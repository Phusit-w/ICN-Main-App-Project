// The shared list of SOC Templates of สร้าง SOC (ADR 0011): anyone with SOC
// access adds one (a blank Word SOC the builder can fill, lib/soc-builder.ts)
// and sees the list; only the one who added a template, or an ADMIN, deletes it.
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { assertSocTemplate } from "@/lib/soc-builder";
import { DOCX_MIME, magicIsDocx, MAX_SOC_FILE_BYTES } from "@/lib/soc-shared";
import { resolveStorageKey, requireSocActor, storeSocFile } from "@/lib/soc";

type SocActor = Awaited<ReturnType<typeof requireSocActor>>;

const MAX_NAME = 120;
const NOT_DOCX = "เทมเพลต SOC ต้องเป็นไฟล์ Word (.docx) ที่ถูกต้อง";
const OLD_DOC = "เทมเพลต SOC เป็น Word รุ่นเก่า (.doc) กรุณา Save As เป็น .docx แล้วอัปโหลดใหม่";

// A template name as typed: trimmed, 1..120 characters. Throws the message the form shows.
export function cleanTemplateName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (!name) throw new Error("กรุณาตั้งชื่อเทมเพลต");
  if (name.length > MAX_NAME) throw new Error(`ชื่อเทมเพลตต้องไม่เกิน ${MAX_NAME} ตัวอักษร`);
  return name;
}

export async function listSocTemplates() {
  const templates = await prisma.socTemplate.findMany({ orderBy: [{ name: "asc" }, { createdAt: "asc" }], include: { addedBy: { select: { displayName: true } } } });
  return templates.map(({ id, name, originalName, sizeBytes, addedById, addedBy, createdAt }) => ({ id, name, originalName, sizeBytes, addedById, addedByName: addedBy.displayName, createdAt }));
}

// Throws, with a message for the user, when a file can't be a SOC Template: not a .docx, too big, or a table the builder can't fill.
export function assertTemplateFile(file: { name: string; bytes: Uint8Array }): void {
  if (path.extname(file.name).toLowerCase() === ".doc") throw new Error(OLD_DOC);
  if (path.extname(file.name).toLowerCase() !== ".docx" || !magicIsDocx(file.bytes)) throw new Error(NOT_DOCX);
  if (file.bytes.byteLength > MAX_SOC_FILE_BYTES) throw new Error(`ไฟล์ ${file.name} ต้องมีขนาดไม่เกิน 25 MB`);
  assertSocTemplate(file.bytes);
}

// Adds a template; a file the builder can't use is refused with the message that names the problem.
export async function addSocTemplate(actor: SocActor, input: { name: unknown; file: { name: string; bytes: Uint8Array } }) {
  const name = cleanTemplateName(input.name);
  const { file } = input;
  assertTemplateFile(file);
  const id = randomUUID();
  const stored = await storeSocFile(`templates/${id}`, file.name, ".docx", file.bytes);
  try {
    const template = await prisma.socTemplate.create({ data: { id, name, addedById: actor.id, mimeType: DOCX_MIME, ...stored } });
    await writeAudit({ actorId: actor.id, action: "SOC_TEMPLATE_ADDED", entityType: "SOC_TEMPLATE", entityId: id, summary: `เพิ่มเทมเพลต SOC ${name}`, metadata: { name, originalName: stored.originalName, sizeBytes: stored.sizeBytes } });
    return template;
  } catch (error) {
    await rm(resolveStorageKey(`templates/${id}`), { recursive: true, force: true });
    throw error;
  }
}

// Deleting is for the one who added the template and for an ADMIN.
export async function deleteSocTemplate(actor: SocActor, id: string) {
  const template = await prisma.socTemplate.findUnique({ where: { id } });
  if (!template) throw new Error("NOT_FOUND");
  if (template.addedById !== actor.id && actor.role !== "ADMIN") throw new Error("FORBIDDEN");
  await prisma.socTemplate.delete({ where: { id } });
  await rm(resolveStorageKey(`templates/${id}`), { recursive: true, force: true });
  await writeAudit({ actorId: actor.id, action: "SOC_TEMPLATE_DELETED", entityType: "SOC_TEMPLATE", entityId: id, summary: `ลบเทมเพลต SOC ${template.name}`, metadata: { name: template.name, addedById: template.addedById } });
}
