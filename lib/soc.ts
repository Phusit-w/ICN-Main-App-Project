import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/authorization";
export * from "@/lib/soc-shared";

const MAX_SOC_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EVIDENCE_FILE_BYTES = 120 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 10;

export function socStorageRoot(): string {
  return path.resolve(process.env.SOC_STORAGE_ROOT || path.join(process.cwd(), "data", "soc"));
}

export async function requireSocActor() {
  return requireAccess("soc");
}

export async function authorizeSocJob(jobId: string) {
  const actor = await requireSocActor();
  const job = await prisma.socJob.findUnique({ where: { id: jobId } });
  if (!job || job.deletedAt || (job.ownerId !== actor.id && actor.role !== "ADMIN")) {
    throw new Error("NOT_FOUND");
  }
  return { actor, job };
}

function magicIsDocx(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function magicIsPdf(bytes: Uint8Array): boolean {
  return new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

export async function validateUpload(file: File, kind: "SOC" | "EVIDENCE") {
  const maxBytes = kind === "SOC" ? MAX_SOC_FILE_BYTES : MAX_EVIDENCE_FILE_BYTES;
  const maxLabel = kind === "SOC" ? "25 MB" : "120 MB";
  if (file.size <= 0 || file.size > maxBytes) {
    throw new Error(`ไฟล์ ${file.name} ต้องมีขนาดไม่เกิน ${maxLabel}`);
  }
  const ext = path.extname(file.name).toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = kind === "SOC" ? ext === ".docx" && magicIsDocx(bytes) : ext === ".pdf" && magicIsPdf(bytes);
  if (!valid) throw new Error(kind === "SOC" ? "ไฟล์ SOC ต้องเป็น DOCX ที่ถูกต้อง" : `ไฟล์ ${file.name} ต้องเป็น PDF ที่ถูกต้อง`);
  return bytes;
}

export function validateEvidenceCount(count: number) {
  if (count < 1 || count > MAX_EVIDENCE_FILES) throw new Error("กรุณาแนบ PDF 1–10 ไฟล์");
}

export function validateEvidenceTotalSize(files: File[]) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_EVIDENCE_TOTAL_BYTES) {
    throw new Error("ไฟล์ Datasheet / Catalog รวมกันต้องมีขนาดไม่เกิน 250 MB");
  }
}

export async function storeSocFile(jobId: string, originalName: string, extension: string, bytes: Uint8Array) {
  const storageKey = path.posix.join(jobId, `${randomUUID()}${extension}`);
  const absolute = path.join(socStorageRoot(), ...storageKey.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes, { flag: "wx" });
  return {
    storageKey,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    originalName: path.basename(originalName).slice(0, 240),
  };
}

export function resolveStorageKey(storageKey: string): string {
  const root = socStorageRoot();
  const resolved = path.resolve(root, ...storageKey.split("/"));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_STORAGE_KEY");
  return resolved;
}
