import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { convertPdfSoc, hasScannedTable, type CellReader } from "@/lib/soc-pdf-soc";
import { readScannedSoc } from "@/lib/soc-scan-read";
import { typhoonCellReader, typhoonConfigured } from "@/lib/soc-typhoon";
import { assertSocFile, isPdfFile, readSocTable } from "@/lib/soc-table";
import { evidenceSelectionProblem, majorItemProgress, MAX_EVIDENCE_FILE_BYTES, MAX_SOC_FILE_BYTES } from "@/lib/soc-shared";
import { evidencePath, UPLOAD_BATCH_BYTES, UPLOAD_BATCH_FILES } from "@/lib/soc-upload";
export * from "@/lib/soc-shared";

type SocActor = Awaited<ReturnType<typeof requireAccess>>;
type Upload = { name: string; bytes: Uint8Array };

const NO_MAJOR_ITEMS = "ไม่พบเลขข้อใหญ่ในตาราง SOC กรุณาตรวจว่าคอลัมน์ลำดับของตารางเป็นเลขข้อ เช่น ๑.๑ หรือ 1.1";
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

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
      majorItems: { select: { state: true, skipped: true } },
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
// soc-worker never claims it. Nothing is kept if any step fails. A PDF SOC
// becomes an Excel SOC here (ADR 0009): the job's SOC is the .xlsx made from
// it, and the PDF is kept beside it as the job's SOC_SOURCE_PDF.
//
// A PDF SOC with a scanned table page (ADR 0010) is read by OCR in the
// background: its job is made at once in READING, without a SOC or major
// items, and finishScanRead() completes it. `readCell` is the OCR; with none
// (the key is not set up) such a PDF is handled as before.
export async function createImportedSocJob(actor: SocActor, input: { title: string; soc: Upload; evidence: Upload[] }, { readCell = defaultCellReader() }: { readCell?: CellReader } = {}) {
  const isPdf = isPdfFile(input.soc.bytes);
  if (readCell && isPdf && hasScannedTable(input.soc.bytes)) return createReadingSocJob(actor, input, readCell);
  const pdfSoc = isPdf ? await convertPdfSoc(input.soc.bytes) : null;
  const withExtension = (extension: string) => input.soc.name.replace(/(\.[^.\/]*)?$/, extension);
  const soc = pdfSoc ? { name: withExtension(".xlsx"), bytes: pdfSoc.xlsx } : input.soc;
  const { file: socFile, majorItems, warnings: tableWarnings } = readSocTable(soc.bytes);
  if (!majorItems.length) throw new Error(NO_MAJOR_ITEMS);
  const warnings = [...(pdfSoc?.warnings ?? []), ...tableWarnings];
  const jobId = randomUUID();
  try {
    const storedSoc = await storeSocFile(jobId, soc.name, socFile.extension, soc.bytes);
    const storedSource = pdfSoc ? await storeSocFile(jobId, withExtension(".pdf"), ".pdf", input.soc.bytes) : null;
    const storedEvidence = await Promise.all(input.evidence.map((file) => storeSocFile(jobId, file.name, ".pdf", file.bytes)));
    const detail = { kind: "IMPORTED", evidenceCount: input.evidence.length, majorItemCount: majorItems.length, ...(pdfSoc ? { pdfSoc: true } : {}) };
    await prisma.$transaction([
      prisma.socJob.create({
        data: {
          id: jobId, kind: "IMPORTED", title: input.title, ownerId: actor.id,
          status: "NEEDS_REVIEW", stage: "รอตรวจข้อใหญ่", progress: 0,
          expiresAt: new Date(Date.now() + RETENTION_MS),
          socWarnings: warnings.length ? warnings : undefined,
          socRowPages: pdfSoc ? pdfSoc.rowPages : undefined,
        },
      }),
      prisma.socDocument.create({ data: { jobId, type: "SOC", mimeType: socFile.mimeType, ...storedSoc } }),
      ...(storedSource ? [prisma.socDocument.create({ data: { jobId, type: "SOC_SOURCE_PDF", mimeType: "application/pdf", ...storedSource } })] : []),
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

const defaultCellReader = () => (typhoonConfigured() ? typhoonCellReader : undefined);

async function createReadingSocJob(actor: SocActor, input: { title: string; soc: Upload; evidence: Upload[] }, readCell: CellReader) {
  const jobId = randomUUID();
  try {
    const storedSource = await storeSocFile(jobId, input.soc.name, ".pdf", input.soc.bytes);
    const storedEvidence = await Promise.all(input.evidence.map((file) => storeSocFile(jobId, file.name, ".pdf", file.bytes)));
    const detail = { kind: "IMPORTED", evidenceCount: input.evidence.length, pdfSoc: true, scanned: true };
    await prisma.$transaction([
      prisma.socJob.create({
        data: {
          id: jobId, kind: "IMPORTED", title: input.title, ownerId: actor.id,
          status: "READING", stage: READING_STAGE, progress: 0,
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
      }),
      prisma.socDocument.create({ data: { jobId, type: "SOC_SOURCE_PDF", mimeType: "application/pdf", ...storedSource } }),
      ...storedEvidence.map((stored) => prisma.socDocument.create({ data: { jobId, type: "EVIDENCE", mimeType: "application/pdf", ...stored } })),
      prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "JOB_CREATED", detail } }),
    ]);
    await writeAudit({ actorId: actor.id, action: "SOC_CREATED", entityType: "SOC_JOB", entityId: jobId, summary: `สร้างงาน SOC ${input.title} (PDF สแกน อ่านด้วย OCR)`, metadata: detail });
  } catch (error) {
    await prisma.socJob.delete({ where: { id: jobId } }).catch(() => undefined);
    await rm(path.join(socStorageRoot(), jobId), { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  void startScanRead(jobId, readCell);
  return jobId;
}

const READING_STAGE = "กำลังอ่านตาราง";
const STOP_READING = new Error("the job is no longer being read");

// Scanned jobs are read one at a time, in the order they were started: the
// OCR's rate limit is shared, so reading two at once would be no faster.
// `order` holds the jobs not finished yet, the one being read first; the
// others show "รอคิวที่ N". Kept on globalThis: the server's startup hook and
// its routes may load this module separately.
// One scheduled read of a job; a stop sets `stopped`, and `started` says the read has begun.
type ScanRun = { promise: Promise<void>; stopped: boolean; started: boolean };
type ScanReads = { queue: Promise<unknown>; running: Map<string, ScanRun>; order: string[]; labels: Promise<unknown> };
const scanReads = ((globalThis as { socScanReads?: ScanReads }).socScanReads ??= { queue: Promise.resolve(), running: new Map(), order: [] as string[], labels: Promise.resolve() });

// Writes "รอคิวที่ N" on the waiting jobs (writes are one after another, each from the order as it is then).
function labelScanQueue() {
  scanReads.labels = scanReads.labels.then(async () => {
    for (const [i, id] of scanReads.order.entries()) {
      if (i === 0) continue;
      await prisma.socJob.updateMany({ where: { id, status: "READING", deletedAt: null }, data: { stage: `รอคิวที่ ${i}` } }).catch(() => undefined);
    }
  });
  return scanReads.labels;
}

// Reads the job's scanned PDF in the background (the work of a READING job).
// Resolves when the job has been completed or failed; never rejects.
export function startScanRead(jobId: string, readCell: CellReader): Promise<void> {
  const current = scanReads.running.get(jobId);
  if (current && !current.stopped) return current.promise;
  scanReads.order.push(jobId);
  void labelScanQueue();
  const run: ScanRun = { stopped: false, started: false, promise: Promise.resolve() };
  run.promise = scanReads.queue.then(async () => {
    if (run.stopped) return; // stopped while waiting: already out of the line
    run.started = true;
    await scanReads.labels;
    await prisma.socJob.updateMany({ where: { id: jobId, status: "READING", deletedAt: null }, data: { stage: READING_STAGE } }).catch(() => undefined);
    await finishScanRead(jobId, readCell, run);
    scanReads.order = scanReads.order.filter((id) => id !== jobId);
    await labelScanQueue();
  });
  scanReads.queue = run.promise;
  scanReads.running.set(jobId, run);
  void run.promise.finally(() => { if (scanReads.running.get(jobId) === run) scanReads.running.delete(jobId); });
  return run.promise;
}

// Stops reading the job: no new cell is sent to the OCR once this returns
// (a call already sent is waited for). A job still waiting leaves the line at
// once and the jobs behind it move up. The cells already read stay on disk.
export async function stopScanRead(jobId: string) {
  const run = scanReads.running.get(jobId);
  if (!run || run.stopped) return;
  run.stopped = true;
  if (run.started) return run.promise;
  scanReads.order = scanReads.order.filter((id) => id !== jobId);
  scanReads.running.delete(jobId);
  await labelScanQueue();
}

// Cancel by the reviewer: the job stops and waits as "อ่านตารางไม่สำเร็จ" with its saved cells (resume is ticket 06).
// Returns false when the job was no longer being read (it had just finished).
export async function cancelScanRead(jobId: string) {
  await stopScanRead(jobId);
  const { count } = await prisma.socJob.updateMany({ where: { id: jobId, status: "READING" }, data: { status: "READ_FAILED", stage: "ยกเลิกการอ่านแล้ว", errorMessage: null } });
  return count > 0;
}

// Picks up the jobs a restart left in READING; their saved cells are not read again.
export async function resumeScanReads(readCell = defaultCellReader()) {
  if (!readCell) return;
  const jobs = await prisma.socJob.findMany({ where: { status: "READING", deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  for (const { id } of jobs) void startScanRead(id, readCell);
}

// Turns a READING job into an ordinary Excel SOC job: the .xlsx made from the
// scanned PDF becomes its SOC, the major items are made, checks come on.
async function finishScanRead(jobId: string, readCell: CellReader, run: ScanRun) {
  let stored: Awaited<ReturnType<typeof storeSocFile>> | undefined;
  try {
    const job = await prisma.socJob.findUnique({ where: { id: jobId }, include: { documents: { where: { type: "SOC_SOURCE_PDF" } } } });
    const source = job?.documents[0];
    if (!job || job.status !== "READING" || job.deletedAt || !source || run.stopped) return;
    const pdfSoc = await readScannedSoc(
      new Uint8Array(await readFile(resolveStorageKey(source.storageKey))),
      path.join(socStorageRoot(), jobId, "cells.jsonl"),
      (image, at) => {
        if (run.stopped) throw STOP_READING;
        return readCell(image, at);
      },
      // Progress is best effort; a job that is no longer READING (moved to the trash) stops the read.
      async (done, total) => {
        const data = { progress: Math.min(99, Math.floor((done / total) * 100)), stage: `${READING_STAGE} หน้า ${done}/${total}` };
        const updated = await prisma.socJob.updateMany({ where: { id: jobId, status: "READING", deletedAt: null }, data }).catch(() => ({ count: 1 }));
        if (!updated.count) throw STOP_READING;
      },
    );
    if (run.stopped) throw STOP_READING; // a cancel that came with the last cell wins
    const { file, majorItems, warnings: tableWarnings } = readSocTable(pdfSoc.xlsx);
    if (!majorItems.length) throw new Error(NO_MAJOR_ITEMS);
    const warnings = [...pdfSoc.warnings, ...tableWarnings];
    const name = source.originalName.replace(/(\.[^.\/]*)?$/, ".xlsx");
    stored = await storeSocFile(jobId, name, file.extension, pdfSoc.xlsx);
    await prisma.$transaction([
      prisma.socJob.update({
        where: { id: jobId },
        data: { status: "NEEDS_REVIEW", stage: "รอตรวจข้อใหญ่", progress: 0, errorMessage: null, socWarnings: warnings.length ? warnings : undefined, socRowPages: pdfSoc.rowPages },
      }),
      prisma.socDocument.create({ data: { jobId, type: "SOC", mimeType: file.mimeType, ...stored } }),
      prisma.socMajorItem.createMany({ data: majorItems.map((item, i) => ({ jobId, ...item, position: i + 1 })) }),
      prisma.socAuditEvent.create({ data: { jobId, actorId: job.ownerId, action: "READ_COMPLETED", detail: { majorItemCount: majorItems.length } } }),
    ]);
  } catch (error) {
    if (stored) await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    if (error === STOP_READING) return;
    const message = error instanceof Error ? error.message : "อ่านตารางไม่สำเร็จ";
    console.error("Scanned PDF SOC read failed", jobId, error);
    await prisma.socJob.update({ where: { id: jobId }, data: { status: "READ_FAILED", stage: "อ่านตารางไม่สำเร็จ", errorMessage: message } }).catch(() => undefined);
  }
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

// Removes one evidence PDF from an Imported SOC Check the actor may open,
// e.g. a wrong file or an old version. The SOC itself can't be removed: its
// major items come from it. Refused while a SOC Runner is checking the job,
// since the runner may still be downloading the job's documents.
export async function removeSocEvidence(actor: SocActor, documentId: string) {
  const document = await prisma.socDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("NOT_FOUND");
  const { job } = await authorizeSocJob(document.jobId);
  if (job.kind !== "IMPORTED" || document.type !== "EVIDENCE") throw new Error("ลบได้เฉพาะไฟล์ PDF หลักฐานของงานตรวจแบบนำเข้าผล");
  if (await prisma.socCheckRequest.count({ where: { jobId: job.id, state: "running" } })) {
    throw new Error("SOC Runner กำลังตรวจงานนี้อยู่ ลบไฟล์ได้หลังตรวจเสร็จ");
  }
  const detail = { documentId: document.id, name: document.originalName };
  await prisma.$transaction([
    prisma.socDocument.delete({ where: { id: document.id } }),
    prisma.socJob.update({ where: { id: job.id }, data: { updatedAt: new Date() } }),
    prisma.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: "EVIDENCE_REMOVED", detail } }),
  ]);
  await rm(resolveStorageKey(document.storageKey), { force: true }).catch(() => undefined);
  await writeAudit({ actorId: actor.id, action: "SOC_EVIDENCE_REMOVED", entityType: "SOC_JOB", entityId: job.id, summary: `ลบเอกสารหลักฐาน ${document.originalName} จากงาน ${job.title}`, metadata: detail });
}

export async function validateUpload(file: File, kind: "SOC" | "EVIDENCE") {
  const maxBytes = kind === "SOC" ? MAX_SOC_FILE_BYTES : MAX_EVIDENCE_FILE_BYTES;
  const maxLabel = kind === "SOC" ? "25 MB" : "120 MB";
  if (file.size <= 0 || file.size > maxBytes) {
    throw new Error(`ไฟล์ ${file.name} ต้องมีขนาดไม่เกิน ${maxLabel}`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "SOC") assertSocFile({ name: file.name, bytes });
  else if (path.extname(file.name).toLowerCase() !== ".pdf" || !isPdfFile(bytes)) throw new Error(`ไฟล์ ${file.name} ต้องเป็น PDF ที่ถูกต้อง`);
  return bytes;
}

// One request's evidence: within a batch (lib/soc-upload.ts) and, with what
// the job already has, within the job's limits.
export function validateEvidenceBatch(files: File[], existing = { count: 0, bytes: 0 }) {
  if (files.length > UPLOAD_BATCH_FILES || files.reduce((sum, file) => sum + file.size, 0) > UPLOAD_BATCH_BYTES) {
    throw new Error(`ส่งได้ครั้งละไม่เกิน ${UPLOAD_BATCH_FILES} ไฟล์ และ ${UPLOAD_BATCH_BYTES / 1024 / 1024} MB`);
  }
  const problem = evidenceSelectionProblem(files, existing);
  if (problem) throw new Error(problem);
}

// The evidence a job already has, for validateEvidenceBatch.
export async function jobEvidenceTotals(jobId: string) {
  const { _count, _sum } = await prisma.socDocument.aggregate({ where: { jobId, type: "EVIDENCE" }, _count: true, _sum: { sizeBytes: true } });
  return { count: _count, bytes: _sum.sizeBytes ?? 0 };
}

// The evidence files of an upload, each with its name in the job: the folder
// path the upload forms send beside it as `evidencePath`, or the file's own
// name. Paired before empty files are dropped, so the paths stay in line.
export function evidenceUploads(form: FormData): { file: File; name: string }[] {
  const paths = form.getAll("evidencePath");
  return form.getAll("evidence").flatMap((value, i) => {
    if (!(value instanceof File) || value.size === 0) return [];
    const picked = paths[i];
    return [{ file: value, name: evidencePath(typeof picked === "string" && picked ? picked : value.name) }];
  });
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
    originalName: evidencePath(originalName),
  };
}

export function resolveStorageKey(storageKey: string): string {
  const root = socStorageRoot();
  const resolved = path.resolve(root, ...storageKey.split("/"));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_STORAGE_KEY");
  return resolved;
}
