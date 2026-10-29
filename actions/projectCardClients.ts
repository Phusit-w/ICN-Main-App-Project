"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, writeAudit } from "@/lib/authorization";

// Admin Center's editor for the client names list (ProjectCardClient): the
// codes written on cards with the Thai names and abbreviations Question
// Search recognises. No card stores a reference to an entry, so entries can
// be changed or removed freely — and nothing here touches a card's Client.

export type Result = { ok: true } | { ok: false; error: string };
type ClientInput = { code: string; names: string[] };

const MAX_CODE = 40;
const MAX_NAME = 80;
const MAX_NAMES = 30;

const cleanWord = (s: string) => s.trim().replace(/\s+/g, " ");

// Codes and names are compared ignoring case ("True" = "TRUE").
const wordKey = (s: string) => s.toLowerCase();

function cleanInput(input: ClientInput): ClientInput | string {
  if (typeof input?.code !== "string" || !Array.isArray(input.names) || input.names.some((s) => typeof s !== "string")) {
    return "ข้อมูลไม่ถูกต้อง";
  }
  const code = cleanWord(input.code);
  const names = input.names.map(cleanWord);
  if (!code) return "กรอกรหัสหน่วยงาน";
  if (code.length > MAX_CODE) return `รหัสยาวได้ไม่เกิน ${MAX_CODE} ตัวอักษร`;
  if (names.length === 0) return "กรอกชื่อหรือชื่อย่ออย่างน้อยหนึ่งชื่อ";
  if (names.some((s) => !s)) return "ชื่อต้องไม่เป็นช่องว่าง";
  if (names.some((s) => s.length > MAX_NAME)) return `ชื่อยาวได้ไม่เกิน ${MAX_NAME} ตัวอักษร`;
  if (names.length > MAX_NAMES) return `ชื่อได้ไม่เกิน ${MAX_NAMES} ชื่อต่อหน่วยงาน`;
  const seen = new Set<string>();
  for (const s of names) {
    if (seen.has(wordKey(s))) return `ชื่อ "${s}" ซ้ำกัน`;
    seen.add(wordKey(s));
  }
  return { code, names };
}

// A word — code or name — names one client only, so Question Search never
// has to choose between two. A client may list its own code as a name.
async function clashOf(input: ClientInput, exceptId?: string): Promise<string | null> {
  const others = await prisma.projectCardClient.findMany({ where: exceptId ? { id: { not: exceptId } } : {} });
  const words = [input.code, ...input.names];
  for (const other of others) {
    const taken = new Set([other.code, ...other.names].map(wordKey));
    const clash = words.find((w) => taken.has(wordKey(w)));
    if (clash) return `"${clash}" ใช้กับหน่วยงาน ${other.code} อยู่แล้ว`;
  }
  return null;
}

function revalidate() {
  revalidatePath("/admin/project-card-terms");
  revalidatePath("/project-card");
}

export async function createProjectCardClient(input: ClientInput): Promise<Result> {
  const actor = await requireRole("ADMIN");
  const client = cleanInput(input);
  if (typeof client === "string") return { ok: false, error: client };
  const clash = await clashOf(client);
  if (clash) return { ok: false, error: clash };

  let row;
  try {
    row = await prisma.projectCardClient.create({ data: client });
  } catch {
    // Another admin added the same code between the check above and now (the
    // unique index catches an exact repeat; a race on case is left possible).
    return { ok: false, error: "เพิ่มไม่สำเร็จ อาจมีรหัสนี้อยู่แล้ว ลองโหลดหน้าใหม่" };
  }
  await writeAudit({
    actorId: actor.id,
    action: "PROJECT_CARD_CLIENT_CREATED",
    entityType: "PROJECT_CARD_CLIENT",
    entityId: row.id,
    summary: `เพิ่มชื่อหน่วยงาน ${client.code}`,
    after: client,
  });
  revalidate();
  return { ok: true };
}

export async function updateProjectCardClient(id: string, input: ClientInput): Promise<Result> {
  const actor = await requireRole("ADMIN");
  const existing = await prisma.projectCardClient.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "ไม่พบหน่วยงานนี้" };
  const client = cleanInput(input);
  if (typeof client === "string") return { ok: false, error: client };
  if (client.code === existing.code && client.names.join("\n") === existing.names.join("\n")) return { ok: true };
  const clash = await clashOf(client, id);
  if (clash) return { ok: false, error: clash };

  try {
    await prisma.projectCardClient.update({ where: { id }, data: client });
  } catch {
    return { ok: false, error: "บันทึกไม่สำเร็จ อาจมีรหัสนี้อยู่แล้ว ลองโหลดหน้าใหม่" };
  }
  await writeAudit({
    actorId: actor.id,
    action: "PROJECT_CARD_CLIENT_CHANGED",
    entityType: "PROJECT_CARD_CLIENT",
    entityId: id,
    summary: `แก้ชื่อหน่วยงาน ${existing.code}`,
    before: { code: existing.code, names: existing.names },
    after: client,
  });
  revalidate();
  return { ok: true };
}

export async function deleteProjectCardClient(id: string): Promise<Result> {
  const actor = await requireRole("ADMIN");
  const existing = await prisma.projectCardClient.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "ไม่พบหน่วยงานนี้" };

  // deleteMany, so another admin removing it first is not an error.
  await prisma.projectCardClient.deleteMany({ where: { id } });
  await writeAudit({
    actorId: actor.id,
    action: "PROJECT_CARD_CLIENT_DELETED",
    entityType: "PROJECT_CARD_CLIENT",
    entityId: id,
    summary: `ลบชื่อหน่วยงาน ${existing.code}`,
    before: { code: existing.code, names: existing.names },
  });
  revalidate();
  return { ok: true };
}
