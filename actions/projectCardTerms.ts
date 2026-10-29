"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, writeAudit } from "@/lib/authorization";
import { isTermKind, termNames, termValueFrom, type Term, type TermKind } from "@/lib/project-card-taxonomy";

// Admin Center's editor for the Project Card lists (ProjectCardTerm): add an
// entry, rename one's labels, or set its synonyms. There is deliberately no
// delete, and an entry's stored `value` never changes — cards keep pointing
// at it, so a rename shows up on every card at once.

export type Result = { ok: true } | { ok: false; error: string };
type Labels = Pick<Term, "en" | "th">;

const MAX_LABEL = 80;
const KIND_LABEL: Record<TermKind, string> = { category: "หมวดหมู่", workType: "ลักษณะงาน" };

const cleanWord = (s: string) => s.trim().replace(/\s+/g, " ");

// Labels and synonyms are compared ignoring case ("Fibre" = "fibre").
const wordKey = (s: string) => s.toLowerCase();

function cleanLabels(input: Labels): Labels | string {
  const en = cleanWord(input.en);
  const th = cleanWord(input.th);
  if (!en || !th) return "กรอกชื่อทั้งภาษาอังกฤษและภาษาไทย";
  if (en.length > MAX_LABEL || th.length > MAX_LABEL) return `ชื่อยาวได้ไม่เกิน ${MAX_LABEL} ตัวอักษร`;
  return { en, th };
}

// The reason the lists exist is to stop near-duplicates ("Fiber" vs "Fibre
// Optic" is still the admin's call, but an exact repeat is never allowed).
// Synonyms count too, so a word never names two entries, nor one entry twice.
async function duplicateOf(kind: TermKind, labels: Labels, value: string, exceptId?: string) {
  const rows = await termsOfKind(kind);
  const keys = [labels.en, labels.th].map(wordKey);
  return rows.find((r) =>
    r.id === exceptId
      ? r.synonyms.some((s) => keys.includes(wordKey(s)))
      : r.value === value || wordsNaming(r).some((w) => keys.includes(w)),
  );
}

function termsOfKind(kind: TermKind) {
  return prisma.projectCardTerm.findMany({
    where: { kind },
    select: { id: true, value: true, en: true, th: true, synonyms: true },
  });
}

// Every word that names an entry: its two labels and its synonyms.
function wordsNaming(term: Pick<Term, "en" | "th" | "synonyms">): string[] {
  return termNames(term).map(wordKey);
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
  if (dup?.id === term.id) return { ok: false, error: "ชื่อนี้เป็นคำพ้องของรายการนี้อยู่ ลบออกจากคำพ้องก่อน" };
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

const MAX_SYNONYMS = 30;

// Replaces an entry's synonyms (add, change and remove are all one save).
// Each must be non-blank, and must not repeat a word that already names an
// entry of the same kind — its own labels, or another entry's label or
// synonym — so a word never points at two entries.
export async function setProjectCardTermSynonyms(id: string, input: string[]): Promise<Result> {
  const actor = await requireRole("ADMIN");
  const term = await prisma.projectCardTerm.findUnique({ where: { id } });
  if (!term) return { ok: false, error: "ไม่พบรายการนี้" };
  if (!isTermKind(term.kind)) return { ok: false, error: "ประเภทรายการไม่ถูกต้อง" };
  if (!Array.isArray(input) || input.some((s) => typeof s !== "string")) return { ok: false, error: "คำพ้องไม่ถูกต้อง" };
  const synonyms = input.map(cleanWord);
  if (synonyms.some((s) => !s)) return { ok: false, error: "คำพ้องต้องไม่เป็นช่องว่าง" };
  if (synonyms.some((s) => s.length > MAX_LABEL)) return { ok: false, error: `คำพ้องยาวได้ไม่เกิน ${MAX_LABEL} ตัวอักษร` };
  if (synonyms.length > MAX_SYNONYMS) return { ok: false, error: `คำพ้องได้ไม่เกิน ${MAX_SYNONYMS} คำต่อรายการ` };

  const seen = new Set<string>();
  for (const s of synonyms) {
    if (seen.has(wordKey(s))) return { ok: false, error: `คำพ้อง "${s}" ซ้ำกัน` };
    seen.add(wordKey(s));
  }
  for (const r of await termsOfKind(term.kind)) {
    const taken = new Set(r.id === term.id ? [r.en, r.th].map(wordKey) : wordsNaming(r));
    const clash = synonyms.find((s) => taken.has(wordKey(s)));
    if (clash) {
      return {
        ok: false,
        error: r.id === term.id ? `"${clash}" เป็นชื่อของรายการนี้อยู่แล้ว` : `"${clash}" ใช้กับ "${r.en} · ${r.th}" อยู่แล้ว`,
      };
    }
  }
  if (synonyms.join("\n") === term.synonyms.join("\n")) return { ok: true };

  await prisma.projectCardTerm.update({ where: { id }, data: { synonyms } });
  await writeAudit({
    actorId: actor.id,
    action: "PROJECT_CARD_TERM_SYNONYMS_CHANGED",
    entityType: "PROJECT_CARD_TERM",
    entityId: id,
    summary: `แก้คำพ้อง${KIND_LABEL[term.kind]} ${term.en}`,
    before: { synonyms: term.synonyms },
    after: { synonyms },
  });
  revalidate();
  return { ok: true };
}
