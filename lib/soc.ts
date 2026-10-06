import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { readSocMajorItems } from "@/lib/soc-major-items";
import { majorItemProgress } from "@/lib/soc-shared";
export * from "@/lib/soc-shared";

type SocActor = Awaited<ReturnType<typeof requireAccess>>;
type Upload = { name: string; bytes: Uint8Array };

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

// Who may open a job: its owner and ADMIN; for an Imported SOC Check, any
// user with `soc` access (spec Q17 = b: the team splits one SOC between them).
function canOpenSocJob(actor: SocActor, job: { ownerId: string; kind: string }) {
  return job.kind === "IMPORTED" || job.ownerId === actor.id || actor.role === "ADMIN";
}

export async function authorizeSocJob(jobId: string) {
  const actor = await requireSocActor();
  const job = await prisma.socJob.findUnique({ where: { id: jobId } });
  if (!job || job.deletedAt || !canOpenSocJob(actor, job)) {
    throw new Error("NOT_FOUND");
  }
  return { actor, job };
}

// Moving a job to the trash stays with its owner and ADMIN, even for an
// imported job that the whole team may open.
export async function authorizeSocJobOwner(jobId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  if (job.ownerId !== actor.id && actor.role !== "ADMIN") throw new Error("FORBIDDEN");
  return { actor, job };
}

// The /soc list: every job the actor may open, with major-item progress for
// imported jobs (null for legacy check jobs, which show `progress` instead).
export async function listSocJobs(actor: SocActor) {
  const jobs = await prisma.socJob.findMany({
    where: { deletedAt: null, ...(actor.role === "ADMIN" ? {} : { OR: [{ ownerId: actor.id }, { kind: "IMPORTED" }] }) },
    include: {
      owner: { select: { displayName: true } },
      majorItems: { select: { state: true } },
      _count: { select: { results: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return jobs.map(({ majorItems, ...job }) => ({
    ...job,
    majorItemProgress: job.kind === "IMPORTED" ? majorItemProgress(majorItems) : null,
  }));
}

// HTTP status for an error thrown by the SOC helpers.
export function socErrorStatus(message: string): number {
  if (message === "UNAUTHORIZED") return 401;
  if (message === "FORBIDDEN") return 403;
  if (message === "NOT_FOUND") return 404;
  return 400;
}

// Creates an Imported SOC Check (ADR 0008) from an upload that
// validateUpload() has already checked: stores the files and creates one
// not_checked major item per ข้อใหญ่ of the SOC. It starts in NEEDS_REVIEW;
// soc-worker never claims it. Nothing is kept if any step fails.
export async function createImportedSocJob(actor: SocActor, input: { title: string; soc: Upload; evidence: Upload[] }) {
  const majorItems = readSocMajorItems(input.soc.bytes);
  if (!majorItems.length) throw new Error("ไม่พบเลขข้อใหญ่ในตาราง SOC กรุณาตรวจว่าคอลัมน์แรกของตารางเป็นเลขข้อ เช่น ๑.๑ หรือ 1.1");
  const jobId = randomUUID();
  try {
    const storedSoc = await storeSocFile(jobId, input.soc.name, ".docx", input.soc.bytes);
    const storedEvidence = await Promise.all(input.evidence.map((file) => storeSocFile(jobId, file.name, ".pdf", file.bytes)));
    const detail = { kind: "IMPORTED", evidenceCount: input.evidence.length, majorItemCount: majorItems.length };
    await prisma.$transaction([
      prisma.socJob.create({
        data: {
          id: jobId, kind: "IMPORTED", title: input.title, ownerId: actor.id,
          status: "NEEDS_REVIEW", stage: "รอตรวจข้อใหญ่", progress: 0,
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
      }),
      prisma.socDocument.create({ data: { jobId, type: "SOC", mimeType: DOCX_MIME, ...storedSoc } }),
      ...storedEvidence.map((stored) => prisma.socDocument.create({ data: { jobId, type: "EVIDENCE", mimeType: "application/pdf", ...stored } })),
      prisma.socMajorItem.createMany({ data: majorItems.map((item, i) => ({ jobId, ...item, position: i + 1 })) }),
      prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "JOB_CREATED", detail } }),
    ]);
    await writeAudit({ actorId: actor.id, action: "SOC_CREATED", entityType: "SOC_JOB", entityId: jobId, summary: `สร้างงาน SOC ${input.title}`, metadata: detail });
  } catch (error) {
    await prisma.socJob.delete({ where: { id: jobId } }).catch(() => undefined);
    await rm(path.join(socStorageRoot(), jobId), { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return jobId;
}

// Adds evidence PDFs (already checked by validateUpload) to an Imported SOC
// Check the actor may open, e.g. a document Claude reported as missing.
export async function addSocEvidence(actor: SocActor, job: { id: string; title: string; kind: string }, evidence: Upload[]) {
  if (job.kind !== "IMPORTED") throw new Error("เพิ่มเอกสารได้เฉพาะงานตรวจแบบนำเข้าผล");
  const stored: Awaited<ReturnType<typeof storeSocFile>>[] = [];
  try {
    for (const file of evidence) stored.push(await storeSocFile(job.id, file.name, ".pdf", file.bytes));
    const documents = stored.map((s) => ({ id: randomUUID(), jobId: job.id, type: "EVIDENCE", mimeType: "application/pdf", ...s }));
    const detail = { documentIds: documents.map((d) => d.id), names: documents.map((d) => d.originalName) };
    await prisma.$transaction([
      prisma.socDocument.createMany({ data: documents }),
      prisma.socJob.update({ where: { id: job.id }, data: { updatedAt: new Date() } }),
      prisma.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: "EVIDENCE_ADDED", detail } }),
    ]);
    await writeAudit({ actorId: actor.id, action: "SOC_EVIDENCE_ADDED", entityType: "SOC_JOB", entityId: job.id, summary: `เพิ่มเอกสารหลักฐาน ${documents.length} ไฟล์ในงาน ${job.title}`, metadata: detail });
    return documents;
  } catch (error) {
    // Files are removed only if their SocDocument rows were never committed.
    const committed = stored.length > 0 && await prisma.socDocument.count({ where: { storageKey: stored[0].storageKey } }) > 0;
    if (!committed) await Promise.all(stored.map((s) => rm(resolveStorageKey(s.storageKey), { force: true }).catch(() => undefined)));
    throw error;
  }
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
