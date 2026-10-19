// TOR Match on a job (docs/SOC-DOMAIN-GLOSSARY.md "TOR Match"): the TOR
// ต้นฉบับ attached to it, read, compared with the job's SOC by
// lib/soc-tor-match.ts, and the result stored. A report only: nothing here
// touches major items, check requests or check results.
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { OCR_CONFIRM_REQUIRED, resolveStorageKey, socStorageRoot, storeSocFile } from "@/lib/soc";
import { jobSocDocument } from "@/lib/soc-import";
import { torJudgeRequestView } from "@/lib/soc-check-requests";
import { queueOcrRead, stopOcrRead, type OcrRun } from "@/lib/soc-ocr-queue";
import type { CellReader } from "@/lib/soc-pdf-soc";
import { readSocTable } from "@/lib/soc-table";
import { matchTor, TOR_MATCH_OUTCOMES, type TorMatch, type TorMatchOutcome, type TorPage } from "@/lib/soc-tor-match";
import { TOR_JUDGE_REQUEST, TOR_JUDGE_SENT } from "@/lib/soc-tor-judge";
import { readScannedTor, readTextTor } from "@/lib/soc-tor-read";
import { SOC_CHECK_REQUEST_OPEN_STATES } from "@/lib/soc-shared";
import { configuredOcrReader, OCR_NOT_SET_UP } from "@/lib/soc-typhoon";

type SocActor = Awaited<ReturnType<typeof requireAccess>>;

export const TOR_DOCUMENT = "TOR_ORIGINAL";
// The SOC's rows change only while a scanned PDF SOC is read; the TOR waits for the full table.
const SOC_NOT_READ = "แนบ TOR ต้นฉบับได้หลังอ่านตาราง SOC ครบแล้ว";
const READING_STAGE = "กำลังอ่าน TOR ต้นฉบับ";
const STOP_READING = new Error("the TOR is no longer being read");

export type TorMatchCounts = Record<TorMatchOutcome, number>;

// The stored lines of a compare: the SOC rows in SOC order, then the TOR
// text no row covers in TOR order. A row's major item is kept only when the
// job's major items are the ones its SOC reads into today (`sameSplit`).
function torMatchLines(result: TorMatch, sameSplit: boolean) {
  type Line = { socRow: number | null; item: string | null; majorItem: string | null; outcome: TorMatchOutcome; socText: string | null; torText: string | null; torPage: number | null };
  const lines: Line[] = [
    ...result.rows.map((row) => ({ socRow: row.position, item: row.item, majorItem: sameSplit ? row.majorItem : null, outcome: row.outcome, socText: row.socText, torText: row.torText, torPage: row.torPage })),
    ...result.missing.map((missing) => ({ socRow: null, item: null, majorItem: null, outcome: "ไม่พบใน SOC" as const, socText: null, torText: missing.torText, torPage: missing.torPage })),
  ];
  return lines.map((line, position) => ({ ...line, position }));
}

function torMatchCounts(lines: { outcome: TorMatchOutcome }[]): TorMatchCounts {
  return Object.fromEntries(TOR_MATCH_OUTCOMES.map((outcome) => [outcome, lines.filter((line) => line.outcome === outcome).length])) as TorMatchCounts;
}

// Compares the job's SOC, as its file reads now, with the TOR's pages. The
// major items are the file's as read today: a job made before the list rule
// (TOR Match 01) may show other ones, which a report only can live with.
// `sameSplit`: the SOC still reads into the job's major items (as soc-import).
async function compareWithSoc(jobId: string, pages: TorPage[]) {
  const soc = await jobSocDocument(jobId);
  if (!soc) throw new Error(SOC_NOT_READ);
  const table = readSocTable(new Uint8Array(await readFile(resolveStorageKey(soc.storageKey))));
  const jobKeys = (await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" }, select: { key: true } })).map((m) => m.key);
  const result = matchTor(table, pages);
  const lines = torMatchLines(result, table.majorItems.map((m) => m.key).join("|") === jobKeys.join("|"));
  return { pages, counts: torMatchCounts(lines), warnings: result.warnings, lines };
}

// Where a scanned TOR's pages are saved as the OCR reads them, so a read that
// stopped goes on without sending a page twice. Gone with its TOR.
const torPagesFile = (jobId: string, documentId: string) => path.join(socStorageRoot(), jobId, `tor-${documentId}.jsonl`);

// Attaches a TOR ต้นฉบับ (a PDF validateUpload() has already checked) to an
// Imported SOC Check the actor may open. A text TOR is compared with the SOC
// at once. A scanned TOR goes to the outside OCR (decision 11): the reviewer
// must confirm that on every attach (`ocrConfirmed`, else OCR_CONFIRM_REQUIRED
// and nothing is stored or sent), it needs the OCR key, and it is read in the
// background (startTorRead) and compared when the read ends. A TOR already
// attached is replaced: its read stops, and its document, saved pages and
// result go, and a Claude step open on it is cancelled.
export async function attachTorOriginal(
  actor: SocActor,
  job: { id: string; title: string; kind: string; status: string },
  upload: { name: string; bytes: Uint8Array },
  { readPage = configuredOcrReader(), ocrConfirmed = false }: { readPage?: CellReader; ocrConfirmed?: boolean } = {},
) {
  if (job.kind !== "IMPORTED") throw new Error("แนบ TOR ต้นฉบับได้เฉพาะงานตรวจแบบนำเข้าผล");
  if (job.status === "READING" || job.status === "READ_FAILED") throw new Error(SOC_NOT_READ);
  const read = readTextTor(upload.bytes);
  if (!read.pages) {
    if (!readPage) throw new Error(OCR_NOT_SET_UP);
    if (!ocrConfirmed) throw new Error(OCR_CONFIRM_REQUIRED);
  }
  const compared = read.pages ? await compareWithSoc(job.id, read.pages) : null;
  const old = await prisma.socDocument.findMany({ where: { jobId: job.id, type: TOR_DOCUMENT } });
  const openJudges = await prisma.socCheckRequest.findMany({ where: { jobId: job.id, kind: TOR_JUDGE_REQUEST, state: { in: [...SOC_CHECK_REQUEST_OPEN_STATES] } }, select: { id: true } });
  const stored = await storeSocFile(job.id, upload.name, ".pdf", upload.bytes);
  const documentId = randomUUID();
  const detail = { documentId, name: stored.originalName, replaced: old.map((d) => d.originalName), ...(compared ? { counts: compared.counts } : { scanned: true }) };
  const match = compared
    ? { state: "ready", pages: compared.pages, counts: compared.counts, warnings: compared.warnings, lines: { createMany: { data: compared.lines } } }
    : { state: "reading", stage: READING_STAGE, scanned: true };
  try {
    await prisma.$transaction([
      // Claude no longer judges the old TOR's lines; a runner on it stops at its next heartbeat.
      prisma.socCheckRequest.updateMany({ where: { id: { in: openJudges.map((r) => r.id) }, state: { in: [...SOC_CHECK_REQUEST_OPEN_STATES] } }, data: { state: "cancelled", finishedAt: new Date(), progressNote: null } }),
      prisma.socAuditEvent.createMany({ data: openJudges.map((r) => ({ jobId: job.id, actorId: actor.id, action: "CHECK_REQUEST_CANCELLED", detail: { checkRequestId: r.id, kind: TOR_JUDGE_REQUEST, reason: "TOR_REPLACED" } })) }),
      // Deleting the old document deletes its TOR Match and lines too.
      prisma.socDocument.deleteMany({ where: { jobId: job.id, type: TOR_DOCUMENT } }),
      prisma.socDocument.create({ data: { id: documentId, jobId: job.id, type: TOR_DOCUMENT, mimeType: "application/pdf", pageCount: read.pageCount, ...stored } }),
      prisma.socTorMatch.create({ data: { jobId: job.id, documentId, ...match } }),
      prisma.socJob.update({ where: { id: job.id }, data: { updatedAt: new Date() } }),
      prisma.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: old.length ? "TOR_REPLACED" : "TOR_ATTACHED", detail } }),
    ]);
  } catch (error) {
    await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    throw error;
  }
  // The old TOR's read, if any, finds its result gone and stops; once it has, its files go.
  await stopTorRead(job.id);
  for (const document of old) {
    await rm(resolveStorageKey(document.storageKey), { force: true }).catch(() => undefined);
    await rm(torPagesFile(job.id, document.id), { force: true }).catch(() => undefined);
  }
  if (!compared) void startTorRead(job.id, readPage!);
  await writeAudit({ actorId: actor.id, action: "SOC_TOR_ATTACHED", entityType: "SOC_JOB", entityId: job.id, summary: `แนบ TOR ต้นฉบับ ${stored.originalName} ในงาน ${job.title}${compared ? "" : " (PDF สแกน อ่านด้วย OCR)"}`, metadata: detail });
  return { documentId, state: match.state, counts: compared?.counts ?? null, warnings: compared?.warnings ?? [] };
}

// A scanned TOR is read in the server's one line of OCR reads
// (lib/soc-ocr-queue.ts), after the scanned SOCs and TORs started before it.
// Resolves when the read has ended (compared, failed or stopped); never rejects.
export function startTorRead(jobId: string, readPage: CellReader): Promise<void> {
  const reading = { jobId, state: "reading", job: { deletedAt: null } };
  return queueOcrRead(`tor:${jobId}`, {
    waiting: (place) => prisma.socTorMatch.updateMany({ where: reading, data: { stage: `รอคิวที่ ${place}` } }),
    read: (run) => finishTorRead(jobId, readPage, run),
  });
}

// Stops reading the job's TOR: no page is sent to the OCR once this returns.
export const stopTorRead = (jobId: string) => stopOcrRead(`tor:${jobId}`);

// Cancel by a reviewer: the read stops and the TOR Match waits as failed with
// its saved pages, to be resumed. False when it was no longer being read.
export async function cancelTorRead(jobId: string) {
  await stopTorRead(jobId);
  const { count } = await prisma.socTorMatch.updateMany({ where: { jobId, state: "reading" }, data: { state: "failed", stage: null, errorMessage: "ยกเลิกการอ่าน TOR ต้นฉบับแล้ว หน้าที่อ่านแล้วยังเก็บไว้ กด \"อ่านต่อ\" เมื่อพร้อม" } });
  return count > 0;
}

// Resume by a reviewer: a failed (or cancelled) read goes on from its saved
// pages. Only a scanned TOR's read can fail; a text TOR that cannot be
// compared is refused at attach. False when it was not failed.
export async function resumeTorRead(jobId: string, readPage = configuredOcrReader()) {
  if (!readPage) throw new Error(OCR_NOT_SET_UP);
  const { count } = await prisma.socTorMatch.updateMany({ where: { jobId, state: "failed", job: { deletedAt: null } }, data: { state: "reading", stage: READING_STAGE, errorMessage: null } });
  if (count) void startTorRead(jobId, readPage);
  return count > 0;
}

// Picks up the TORs a restart left being read; their saved pages are not read again.
export async function resumeTorReads(readPage = configuredOcrReader()) {
  if (!readPage) return;
  const matches = await prisma.socTorMatch.findMany({ where: { state: "reading", job: { deletedAt: null } }, orderBy: { updatedAt: "asc" }, select: { jobId: true } });
  for (const { jobId } of matches) void startTorRead(jobId, readPage);
}

// Reads the job's scanned TOR and compares it with the SOC. Each write is
// made only while this TOR is still being read (not replaced, cancelled or
// moved to the trash); otherwise the read stops quietly.
async function finishTorRead(jobId: string, readPage: CellReader, run: OcrRun) {
  const match = await prisma.socTorMatch.findUnique({ where: { jobId }, include: { document: true, job: { select: { deletedAt: true } } } });
  if (!match || match.state !== "reading" || match.job.deletedAt || run.stopped) return;
  const stillReading = { id: match.id, state: "reading", job: { deletedAt: null } };
  try {
    const pages = await readScannedTor(
      new Uint8Array(await readFile(resolveStorageKey(match.document.storageKey))),
      torPagesFile(jobId, match.documentId),
      (image, at) => {
        if (run.stopped) throw STOP_READING;
        return readPage(image, at);
      },
      async (done, total) => {
        const { count } = await prisma.socTorMatch.updateMany({ where: stillReading, data: { stage: `${READING_STAGE} หน้า ${done}/${total}` } });
        if (!count) throw STOP_READING;
      },
    );
    if (run.stopped) throw STOP_READING; // a cancel that came with the last page wins
    const compared = await compareWithSoc(jobId, pages);
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.socTorMatch.updateMany({ where: stillReading, data: { state: "ready", stage: null, errorMessage: null, pages, counts: compared.counts, warnings: compared.warnings } });
      if (!count) throw STOP_READING;
      await tx.socTorMatchLine.createMany({ data: compared.lines.map((line) => ({ ...line, matchId: match.id })) });
      await tx.socAuditEvent.create({ data: { jobId, actorId: null, action: "TOR_READ_COMPLETED", detail: { documentId: match.documentId, counts: compared.counts } } });
    });
  } catch (error) {
    if (error === STOP_READING) return;
    // The reason is shown to the reviewer, so a message that is not Thai gets a plain one.
    const reason = error instanceof Error && /[฀-๿]/.test(error.message) ? error.message : "เกิดข้อผิดพลาดระหว่างอ่าน TOR ต้นฉบับ";
    console.error("Scanned TOR read failed", jobId, error);
    await prisma.socTorMatch.updateMany({ where: stillReading, data: { state: "failed", stage: null, errorMessage: `${reason} · หน้าที่อ่านแล้วยังเก็บไว้ กด "อ่านต่อ" เมื่อพร้อม` } }).catch(() => undefined);
  }
}

// What the job page shows of a job's TOR Match; null when no TOR is attached.
export async function torMatchView(jobId: string) {
  const match = await prisma.socTorMatch.findUnique({
    where: { jobId },
    include: {
      document: { select: { originalName: true } },
      lines: { orderBy: { position: "asc" }, select: { id: true, socRow: true, item: true, majorItem: true, outcome: true, socText: true, torText: true, torPage: true, claudeOutcome: true, claudeReason: true } },
    },
  });
  if (!match) return null;
  const majorItems = new Map((await prisma.socMajorItem.findMany({ where: { jobId }, select: { id: true, key: true, label: true } })).map((m) => [m.key, m]));
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  return {
    documentId: match.documentId,
    name: match.document.originalName,
    state: match.state,
    stage: match.stage,
    counts: (match.counts ?? null) as TorMatchCounts | null,
    warnings: strings(match.warnings),
    errorMessage: match.errorMessage,
    // The Claude step: how many lines it would be sent, and its latest request.
    judgeable: match.lines.filter((line) => (TOR_JUDGE_SENT as readonly string[]).includes(line.outcome)).length,
    judge: await torJudgeRequestView(match.id),
    // Every outcome line, ตรง included: the issue list hides those by default.
    lines: match.lines.map(({ majorItem, ...line }) => {
      const item = majorItem ? majorItems.get(majorItem) : undefined;
      return { ...line, outcome: line.outcome as TorMatchOutcome, majorItemId: item?.id ?? null, majorItemLabel: item?.label ?? null };
    }),
  };
}
export type TorMatchView = NonNullable<Awaited<ReturnType<typeof torMatchView>>>;
