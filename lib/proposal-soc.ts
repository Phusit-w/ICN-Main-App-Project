// SOC Versions of a Proposal (ADR 0012): every SOC that enters a Proposal is
// the next numbered version, and the highest-numbered READY one is the current
// SOC that every step works on. A SOC is accepted exactly as the SOC check
// accepts it (lib/soc.ts readableSocUpload): Word, Excel, a text PDF (made
// into an .xlsx, ADR 0009), or a scanned PDF, which the outside OCR reads in
// the server's one OCR line (ADR 0010) before the version counts as current.
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { writeAudit } from "@/lib/authorization";
import { NO_MAJOR_ITEMS, OCR_CONFIRM_REQUIRED, readableSocUpload, resolveStorageKey, socStorageRoot, storeSocFile } from "@/lib/soc";
import { hasScannedTable, type CellReader } from "@/lib/soc-pdf-soc";
import { queueOcrRead, stopOcrRead, type OcrRun } from "@/lib/soc-ocr-queue";
import { readScannedSoc } from "@/lib/soc-scan-read";
import { isPdfFile, readSocTable } from "@/lib/soc-table";
import { configuredOcrReader, OCR_NOT_SET_UP } from "@/lib/soc-typhoon";

type Upload = { name: string; bytes: Uint8Array };
type Actor = { id: string };

const READING_STAGE = "กำลังอ่านตาราง";
const STOP_READING = new Error("the version is no longer being read");
const versionKey = (id: string) => `version:${id}`;
const folder = (proposalId: string) => `proposals/${proposalId}`;
const cellsFile = (proposalId: string, versionId: string) => path.join(socStorageRoot(), "proposals", proposalId, `cells-${versionId}.jsonl`);

// The next number is one past the highest; two uploads at once can pick the
// same one, and the unique (proposalId, number) sends the later one round again.
export async function createVersion(proposalId: string, data: Omit<Prisma.SocVersionUncheckedCreateInput, "proposalId" | "number">) {
  for (let attempt = 0; ; attempt += 1) {
    const { _max } = await prisma.socVersion.aggregate({ where: { proposalId }, _max: { number: true } });
    try {
      return await prisma.socVersion.create({ data: { ...data, proposalId, number: (_max.number ?? 0) + 1 } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002" && attempt < 5) continue;
      throw error;
    }
  }
}

// A SOC upload validateUpload() has checked becomes the Proposal's next SOC
// Version (source "upload"). A table that can't be read is refused and nothing
// is kept. A scanned PDF is refused without the OCR key, then without the
// uploader's confirm (it goes to an outside service); once accepted it is
// numbered at once and read in the background.
export async function attachSocVersion(
  actor: Actor,
  proposal: { id: string; title: string },
  upload: Upload,
  { readCell = configuredOcrReader(), ocrConfirmed = false }: { readCell?: CellReader; ocrConfirmed?: boolean } = {},
) {
  const scanned = isPdfFile(upload.bytes) && hasScannedTable(upload.bytes);
  if (scanned) {
    if (!readCell) throw new Error(OCR_NOT_SET_UP);
    if (!ocrConfirmed) throw new Error(OCR_CONFIRM_REQUIRED);
  }
  const prepared = scanned ? null : await readableSocUpload(upload);
  const stored: Awaited<ReturnType<typeof storeSocFile>>[] = [];
  try {
    const store = async (name: string, extension: string, bytes: Uint8Array) => {
      const file = await storeSocFile(folder(proposal.id), name, extension, bytes);
      stored.push(file);
      return file;
    };
    const version = prepared
      ? await (async () => {
        const soc = await store(prepared.soc.name, prepared.file.extension, prepared.soc.bytes);
        const source = prepared.pdfSoc ? await store(prepared.withExtension(".pdf"), ".pdf", upload.bytes) : null;
        return createVersion(proposal.id, {
          source: "upload", state: "ready", createdById: actor.id, mimeType: prepared.file.mimeType, ...soc,
          ...(source ? { sourceName: source.originalName, sourceStorageKey: source.storageKey } : {}),
          warnings: prepared.warnings.length ? prepared.warnings : undefined, rowPages: prepared.pdfSoc?.rowPages,
        });
      })()
      : await (async () => {
        const source = await store(upload.name, ".pdf", upload.bytes);
        return createVersion(proposal.id, { source: "upload", state: "reading", stage: READING_STAGE, createdById: actor.id, sourceName: source.originalName, sourceStorageKey: source.storageKey });
      })();
    await writeAudit({
      actorId: actor.id, action: "PROPOSAL_SOC_VERSION_ADDED", entityType: "PROPOSAL", entityId: proposal.id,
      summary: `เพิ่ม SOC ฉบับ ${version.number} (อัปโหลด) ใน Proposal ${proposal.title}${scanned ? " (PDF สแกน อ่านด้วย OCR)" : ""}`,
      metadata: { versionId: version.id, number: version.number, scanned },
    }).catch((error) => console.error("Audit of a Proposal SOC version failed", error)); // the version exists: its files must stay
    if (scanned) void startVersionRead(version.id, readCell!);
    return { versionId: version.id, number: version.number, state: version.state };
  } catch (error) {
    for (const file of stored) await rm(resolveStorageKey(file.storageKey), { force: true }).catch(() => undefined);
    throw error;
  }
}

// A scanned version is read in the server's one OCR line, under its own key
// (lib/soc-ocr-queue.ts); one waiting there shows "รอคิวที่ N".
// Resolves when the version is ready, failed or stopped; never rejects.
export function startVersionRead(versionId: string, readCell: CellReader): Promise<void> {
  return queueOcrRead(versionKey(versionId), {
    waiting: (place) => prisma.socVersion.updateMany({ where: { id: versionId, state: "reading" }, data: { stage: `รอคิวที่ ${place}` } }),
    read: async (run) => {
      await prisma.socVersion.updateMany({ where: { id: versionId, state: "reading" }, data: { stage: READING_STAGE } }).catch(() => undefined);
      await finishVersionRead(versionId, readCell, run);
    },
  });
}

async function finishVersionRead(versionId: string, readCell: CellReader, run: OcrRun) {
  let stored: Awaited<ReturnType<typeof storeSocFile>> | undefined;
  const version = await prisma.socVersion.findUnique({ where: { id: versionId }, include: { proposal: { select: { deletedAt: true } } } });
  if (!version || version.state !== "reading" || version.proposal.deletedAt || !version.sourceStorageKey || run.stopped) return;
  const cells = cellsFile(version.proposalId, versionId);
  try {
    const pdfSoc = await readScannedSoc(
      new Uint8Array(await readFile(resolveStorageKey(version.sourceStorageKey))),
      cells,
      (image, at) => {
        if (run.stopped) throw STOP_READING;
        return readCell(image, at);
      },
      // Progress is best effort; a version no longer being read stops the read.
      async (done, total) => {
        const data = { progress: Math.min(99, Math.floor((done / total) * 100)), stage: `${READING_STAGE} หน้า ${done}/${total}` };
        const updated = await prisma.socVersion.updateMany({ where: { id: versionId, state: "reading" }, data }).catch(() => ({ count: 1 }));
        if (!updated.count) throw STOP_READING;
      },
    );
    if (run.stopped) throw STOP_READING; // a stop that came with the last cell wins
    const { file, majorItems, warnings: tableWarnings } = readSocTable(pdfSoc.xlsx);
    if (!majorItems.length) throw new Error(NO_MAJOR_ITEMS);
    const warnings = [...pdfSoc.warnings, ...tableWarnings];
    stored = await storeSocFile(folder(version.proposalId), (version.sourceName ?? "SOC.pdf").replace(/(\.[^.\/]*)?$/, ".xlsx"), file.extension, pdfSoc.xlsx);
    const done = await prisma.socVersion.updateMany({
      where: { id: versionId, state: "reading" },
      data: { state: "ready", stage: null, progress: 0, errorMessage: null, mimeType: file.mimeType, warnings: warnings.length ? warnings : undefined, rowPages: pdfSoc.rowPages, ...stored },
    });
    if (!done.count) throw STOP_READING;
    await rm(cells, { force: true }).catch(() => undefined);
  } catch (error) {
    if (stored) await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    if (error === STOP_READING) return;
    // The reason is shown to the user, so a message that is not Thai gets a plain one.
    const reason = error instanceof Error && /[฀-๿]/.test(error.message) ? error.message : "เกิดข้อผิดพลาดระหว่างอ่านตาราง";
    console.error("Scanned PDF SOC version read failed", versionId, error);
    await prisma.socVersion.updateMany({ where: { id: versionId, state: "reading" }, data: { state: "failed", stage: "อ่านตารางไม่สำเร็จ", errorMessage: `${reason} · เซลล์ที่อ่านแล้วยังเก็บไว้ กด "อ่านต่อ" เมื่อพร้อม` } }).catch(() => undefined);
  }
}

// A failed version goes back to reading and goes on from its saved cells.
// Returns false when it was not failed (someone else resumed it first).
export async function resumeVersionRead(versionId: string, readCell = configuredOcrReader()) {
  if (!readCell) throw new Error(OCR_NOT_SET_UP);
  const { count } = await prisma.socVersion.updateMany({ where: { id: versionId, state: "failed", proposal: { deletedAt: null } }, data: { state: "reading", stage: READING_STAGE, errorMessage: null } });
  if (count) void startVersionRead(versionId, readCell);
  return count > 0;
}

// Reads that go with a Proposal into the trash stop (no cell is sent to the
// OCR after this returns); restoring it starts them again from the saved cells.
export async function stopProposalReads(proposalId: string) {
  const reading = await prisma.socVersion.findMany({ where: { proposalId, state: "reading" }, select: { id: true } });
  for (const { id } of reading) await stopOcrRead(versionKey(id));
}

export async function restartProposalReads(proposalId: string, readCell = configuredOcrReader()) {
  if (!readCell) return;
  const reading = await prisma.socVersion.findMany({ where: { proposalId, state: "reading" }, select: { id: true } });
  for (const { id } of reading) void startVersionRead(id, readCell);
}

// Picks up the versions a restart left reading; their saved cells are not read again.
export async function resumeVersionReads(readCell = configuredOcrReader()) {
  if (!readCell) return;
  const reading = await prisma.socVersion.findMany({ where: { state: "reading", proposal: { deletedAt: null } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  for (const { id } of reading) void startVersionRead(id, readCell);
}

// The version history of a Proposal's page, newest first. `current` is the
// highest-numbered one that is ready.
export async function listSocVersions(proposalId: string) {
  const rows = await prisma.socVersion.findMany({ where: { proposalId }, orderBy: { number: "desc" }, include: { createdBy: { select: { displayName: true } } } });
  const currentNumber = rows.find((row) => row.state === "ready")?.number ?? null;
  return rows.map((row) => ({
    id: row.id, number: row.number, source: row.source, state: row.state, stage: row.stage, progress: row.progress, errorMessage: row.errorMessage,
    name: row.originalName ?? row.sourceName, hasSourcePdf: Boolean(row.sourceStorageKey && row.storageKey),
    warnings: (row.warnings as string[] | null) ?? [], createdAt: row.createdAt, createdByName: row.createdBy.displayName, current: row.number === currentNumber,
  }));
}
export type SocVersionView = Awaited<ReturnType<typeof listSocVersions>>[number];
