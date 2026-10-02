"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, writeAudit } from "@/lib/authorization";
import { isTermKind, termValueFrom, type Term, type TermKind } from "@/lib/project-card-taxonomy";

// Admin Center's editor for the Project Card lists (ProjectCardTerm): add an
// entry, or rename one's labels. There is deliberately no delete, and an
// entry's stored `value` never changes — cards keep pointing at it, so a
// rename shows up on every card at once.

export type Result = { ok: true } | { ok: false; error: string };
type Labels = Pick<Term, "en" | "th">;

const MAX_LABEL = 80;
const KIND_LABEL: Record<TermKind, string> = { category: "หมวดหมู่", workType: "ลักษณะงาน" };

function cleanLabels(input: Labels): Labels | string {
  const en = input.en.trim().replace(/\s+/g, " ");
  const th = input.th.trim().replace(/\s+/g, " ");
  if (!en || !th) return "กรอกชื่อทั้งภาษาอังกฤษและภาษาไทย";
  if (en.length > MAX_LABEL || th.length > MAX_LABEL) return `ชื่อยาวได้ไม่เกิน ${MAX_LABEL} ตัวอักษร`;
  return { en, th };
}

// The reason the lists exist is to stop near-duplicates ("Fiber" vs "Fibre
// Optic" is still the admin's call, but an exact repeat is never allowed).
async function duplicateOf(kind: TermKind, labels: Labels, value: string, exceptId?: string) {
  const rows = await prisma.projectCardTerm.findMany({ where: { kind }, select: { id: true, value: true, en: true, th: true } });
  return rows.find(
    (r) =>
      r.id !== exceptId &&
      (r.value === value || r.en.toLowerCase() === labels.en.toLowerCase() || r.th === labels.th),
  );
}

function revalidate() {
  revalidatePath("/admin/project-card-terms");
  revalidatePath("/project-card");
}

export async function createProjectCardTerm(input: { kind: TermKind; en: string; th: string }): Promise<Result> {
  const actor = await requireRole("ADMIN");
  if (!isTermKind(input.kind)) return { ok: false, error: "ประเภทรายการไม่ถูกต้อง" };
  const labels = cleanLabels(input);
  if (typeof labels === "string") return { ok: false, error: labels };
  const value = termValueFrom(labels.en);
  if (!value) return { ok: false, error: "ชื่อภาษาอังกฤษต้องมีตัวอักษร A–Z หรือตัวเลขอย่างน้อยหนึ่งตัว" };
  const dup = await duplicateOf(input.kind, labels, value);
  if (dup) return { ok: false, error: `มี${KIND_LABEL[input.kind]} "${dup.en} · ${dup.th}" อยู่แล้ว` };

  const last = await prisma.projectCardTerm.findFirst({ where: { kind: input.kind }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  let term;
  try {
    term = await prisma.projectCardTerm.create({
      data: { kind: input.kind, value, ...labels, sortOrder: (last?.sortOrder ?? 0) + 10 },
    });
  } catch {
    // Another admin added the same value between the check above and now
    // (the unique index on kind + value), same handling as changeUsername.
    return { ok: false, error: `เพิ่มไม่สำเร็จ อาจมี${KIND_LABEL[input.kind]}ชื่อนี้อยู่แล้ว ลองโหลดหน้าใหม่` };
  }
  await writeAudit({
    actorId: actor.id,
    action: "PROJECT_CARD_TERM_CREATED",
    entityType: "PROJECT_CARD_TERM",
    entityId: term.id,
    summary: `เพิ่ม${KIND_LABEL[input.kind]} ${labels.en} · ${labels.th}`,
    after: { kind: input.kind, value, ...labels },
  });
  revalidate();
  return { ok: true };
}

export async function renameProjectCardTerm(id: string, input: Labels): Promise<Result> {
  const actor = await requireRole("ADMIN");
  const term = await prisma.projectCardTerm.findUnique({ where: { id } });
  if (!term) return { ok: false, error: "ไม่พบรายการนี้" };
  if (!isTermKind(term.kind)) return { ok: false, error: "ประเภทรายการไม่ถูกต้อง" };
  const kind = term.kind;
  const labels = cleanLabels(input);
  if (typeof labels === "string") return { ok: false, error: labels };
  if (labels.en === term.en && labels.th === term.th) return { ok: true };
  const dup = await duplicateOf(kind, labels, term.value, term.id);
  if (dup) return { ok: false, error: `มี${KIND_LABEL[kind]} "${dup.en} · ${dup.th}" อยู่แล้ว` };

  await prisma.projectCardTerm.update({ where: { id }, data: labels });
  await writeAudit({
    actorId: actor.id,
    action: "PROJECT_CARD_TERM_RENAMED",
    entityType: "PROJECT_CARD_TERM",
    entityId: id,
    summary: `แก้ชื่อ${KIND_LABEL[kind]} ${term.en} → ${labels.en}`,
    before: { en: term.en, th: term.th },
    after: labels,
  });
  revalidate();
  return { ok: true };
}
