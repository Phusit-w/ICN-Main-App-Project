// Import one Local Check Run (ADR 0008, seam 1): the only code path that
// writes check results for an Imported SOC Check. Manual upload (phase 1) and
// the SOC Runner API (phase 2) both call importLocalCheckRun().
//
// Validation follows the SOC skill's SKILL.md "results.json" section and its
// append_results_to_docx.py validate(), for the full mode every check runs
// in: full_audit + evidence_support + tor_decision. Any error rejects the
// whole file and nothing is written.
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { DOCX_MIME, MAX_SOC_FILE_BYTES, magicIsDocx, resolveStorageKey, storeSocFile } from "@/lib/soc";
import { isItemInMajorItem, majorItemKey } from "@/lib/soc-major-items";
import { readSocTable, type SocTable } from "@/lib/soc-table";
import { parseReferencePages, PENDING_FIX } from "@/lib/soc-review";
import { isExcelSoc, isSocImageKind, majorItemName, SOC_CHECK_REQUEST_OPEN_STATES, SOC_IMAGE_KINDS } from "@/lib/soc-shared";

export type LocalCheckRunSource = "manual" | "runner";

export type LocalCheckRunInput = {
  jobId: string;
  majorItemId: string;
  results: unknown; // the parsed results.json
  // The run's SOC_Check .docx. Required for a Word SOC. A run on an Excel SOC
  // has none; one sent anyway is not kept.
  socCheck?: { name: string; bytes: Uint8Array };
  // packetFallback (runner only): why the item ran on the old flow instead of the
  // evidence packet; recorded with the run in its RUN_IMPORTED event.
  run: { skillVersion: string; model: string; source: LocalCheckRunSource; packetFallback?: string };
  // Re-check only: the row numbers with a Final Decision that the reviewer
  // was warned about and agreed to replace ("แทนที่แถวที่ยืนยันแล้ว"). A row
  // decided after the warning isn't in the list, so it warns again.
  replaceConfirmed?: number[];
  // Runner submissions only: the Check Request this run carries out. It must
  // be running; it is closed as done in the same transaction.
  // `rowNumbers`: a re-check of only these rows (picked on the review page);
  // the run's other rows are ignored and the item's other results kept.
  checkRequest?: { id: string; requestedById: string; acknowledgedMissing: string[]; rowNumbers?: number[] };
};

export type ConfirmedRow = { rowNumber: number; item: string };

// `confirmedRows` is set only when a re-check would replace rows that have a
// Final Decision: nothing was written, and the same import with these rows
// as `replaceConfirmed` goes ahead.
export type LocalCheckRunImport =
  | { ok: true; runId: string; rowCount: number }
  | { ok: false; errors: string[]; confirmedRows?: ConfirmedRow[] };

const MAX_ERRORS = 50;

// The skill's reference_check values (its LABELS); unlike the legacy
// SOC_CHECK_STATUSES, there is no "review".
const REFERENCE_CHECKS = new Set(["match", "mismatch", "not_found", "unverifiable", "not_applicable"]);
// Matched exactly by the review statuses and the Excel colours (soc-results-excel.ts), as
// in the skill's append_results_to_docx.py: a reason belongs in detail, not here.
const CONFIDENCES = new Set(["high", "medium", "low"]);

// Fields every result must carry in full mode, in the order the skill lists them.
const REQUIRED_FIELDS = [
  "row", "item", "reference_check", "detail",
  "reference_detail", // reference (standard and full_audit)
  "item_label_check", "highlight_check", "highlight_evidence", // full_audit
  "evidence_support", "evidence_detail", // evidence_support
  "tor_decision", "tor_decision_basis", "verified_value", "tor_threshold", // tor_decision (tor-decision.md)
  "tor_claim_results", "declared_status", "declared_status_check",
] as const;

// A picture (an Image Row Claude doesn't judge) carries no verdict: only these.
const PICTURE_REQUIRED_FIELDS = ["row", "item"] as const;

type ValidRow = Record<string, unknown> & { row: number; item: string };

function isBlank(value: unknown) {
  return value === undefined || value === null || value === "";
}

// Checks a results.json against the full-mode rules and the major item it is
// imported into. Returns every problem found, in Thai, or the rows.
// `takesGroupHeading`: the item is the first sub-section of a split major
// item, so that item's own heading row ("๕") may be among its rows.
// `isImageRow`: whether a row of the job's SOC is an Image Row (null when the
// row isn't found); an Image Row must come with its image_kind, and only an
// Image Row may. Without it (the SOC can't be read) the kinds are only checked
// against their values.
export function validateLocalCheckRun(
  data: unknown, majorItem: { key: string; label: string },
  { takesGroupHeading = false, isImageRow }: { takesGroupHeading?: boolean; isImageRow?: (row: number, item: string) => boolean | null } = {},
): { rows: ValidRow[] } | { errors: string[] } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { errors: ["ไฟล์ results.json ต้องเป็น JSON object ที่มี mode, options และ results"] };
  }
  const file = data as Record<string, unknown>;
  const errors: string[] = [];
  if (file.mode !== "full_audit") {
    errors.push(`mode ต้องเป็น full_audit (ในไฟล์เป็น ${isBlank(file.mode) ? "ค่าว่าง" : JSON.stringify(file.mode)}) ให้ตรวจแบบ Full audit ใหม่`);
  }
  const options = file.options;
  if (!Array.isArray(options) || !options.every((o) => typeof o === "string")) {
    errors.push("options ต้องเป็นรายการ และต้องมี evidence_support และ tor_decision");
  } else {
    const missing = ["evidence_support", "tor_decision"].filter((o) => !options.includes(o));
    if (missing.length) errors.push(`options ต้องเปิด evidence_support และ tor_decision (ขาด ${missing.join(", ")})`);
  }

  const results = file.results;
  if (!Array.isArray(results) || results.length === 0) {
    errors.push("ไม่พบผลตรวจ: results ต้องเป็นรายการที่มีอย่างน้อยหนึ่งแถว");
    return { errors };
  }

  const seenRows = new Set<number>();
  results.forEach((result: unknown, index) => {
    const at = `ผลรายการที่ ${index + 1}`;
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      errors.push(`${at} ต้องเป็น object`);
      return;
    }
    const row = result as Record<string, unknown>;
    const where = typeof row.item === "string" && row.item ? `${at} (ข้อ ${row.item})` : at;
    const kind = isBlank(row.image_kind) ? null : row.image_kind;
    const missing = (kind === "picture" ? PICTURE_REQUIRED_FIELDS : REQUIRED_FIELDS).filter((field) => isBlank(row[field]));
    if (missing.length) errors.push(`${where}: ขาด ${missing.join(", ")}`);
    errors.push(...imageRowErrors(row, kind, where, isImageRow));
    if (!isBlank(row.reference_check) && !REFERENCE_CHECKS.has(String(row.reference_check))) {
      errors.push(`${where}: reference_check ไม่ถูกต้อง (${JSON.stringify(row.reference_check)})`);
    }
    if (!isBlank(row.confidence) && !CONFIDENCES.has(String(row.confidence))) {
      errors.push(`${where}: confidence ต้องเป็น high, medium หรือ low คำเดียว (ในไฟล์เป็น ${JSON.stringify(String(row.confidence).slice(0, 40))}) เหตุผลให้อยู่ใน detail`);
    }
    if (!isBlank(row.tor_claim_results) && !Array.isArray(row.tor_claim_results)) {
      errors.push(`${where}: tor_claim_results ต้องเป็นรายการ`);
    }
    if (!isBlank(row.row)) {
      if (!Number.isInteger(row.row) || (row.row as number) < 1) {
        errors.push(`${where}: row ต้องเป็นเลขแถวในตาราง SOC (จำนวนเต็มบวก)`);
      } else if (seenRows.has(row.row as number)) {
        errors.push(`${where}: row ${row.row} ซ้ำกับรายการก่อนหน้า`);
      } else {
        seenRows.add(row.row as number);
      }
    }
    if (!isBlank(row.item)) {
      if (!majorItemKey(String(row.item))) errors.push(`${where}: item ไม่ใช่เลขข้อ`);
      else if (!isItemInMajorItem(String(row.item), majorItem, { takesGroupHeading })) errors.push(`${where} ไม่ได้อยู่ใน${majorItemName(majorItem.label, "ข้อใหญ่")}`);
    }
  });

  if (errors.length > MAX_ERRORS) {
    return { errors: [...errors.slice(0, MAX_ERRORS), `และปัญหาอื่นอีก ${errors.length - MAX_ERRORS} รายการ`] };
  }
  return errors.length ? { errors } : { rows: results as ValidRow[] };
}

// An Image Row's fields (soc-image-rows): a kind the skill knows, the
// reading of an image it read, and a kind exactly on the SOC's Image Rows.
function imageRowErrors(row: Record<string, unknown>, kind: unknown, where: string, isImageRow?: (row: number, item: string) => boolean | null): string[] {
  const errors: string[] = [];
  const rowName = Number.isInteger(row.row) ? `แถว ${row.row} ` : "";
  if (kind !== null && !isSocImageKind(kind)) {
    errors.push(`${where}: ${rowName}มี image_kind ที่ไม่รู้จัก (${JSON.stringify(String(kind).slice(0, 40))}) ต้องเป็น ${SOC_IMAGE_KINDS.slice(0, -1).join(", ")} หรือ ${SOC_IMAGE_KINDS.at(-1)}`);
  } else if ((kind === "text_image" || kind === "mixed_image") && isBlank(row.image_reading)) {
    errors.push(`${where}: ${rowName}อ่านรูปเป็น ${kind} แต่ไม่มี image_reading (ข้อความที่อ่านจากรูป)`);
  }
  const imageRow = isImageRow && Number.isInteger(row.row) && typeof row.item === "string" ? isImageRow(row.row as number, row.item) : null;
  if (imageRow === true && kind === null) errors.push(`${where}: ${rowName}เป็นแถวรูป (ช่อง TOR ใน SOC เป็นรูป) แต่ไม่มี image_kind ให้ตรวจใหม่ด้วย skill รุ่นที่อ่านแถวรูป`);
  if (imageRow === false && kind !== null) errors.push(`${where}: ${rowName}ไม่ใช่แถวรูป (ช่อง TOR ใน SOC เป็นข้อความ) แต่มี image_kind`);
  // A picture comes without a verdict, so it must be a row known to be an Image Row.
  if (isImageRow && imageRow === null && kind === "picture" && rowName) errors.push(`${where}: ${rowName}เป็น picture (ไม่มีผลตรวจ) แต่หาแถวนี้ในไฟล์ SOC ไม่เจอ จึงยืนยันไม่ได้ว่าเป็นแถวรูป`);
  return errors;
}

// A results.json value for a String column: values are normally strings,
// but a model may write a number or an object, which is kept as JSON text.
function asColumnText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

const MAX_MISSING = 50;
const MAX_MISSING_NAME = 300;

// The documents Claude reports it couldn't find while checking: results.json's
// optional top-level `missing_documents` (HEADLESS.md), as names or
// { name, cited_in_rows }. Anything else in the list is ignored.
export function reportedMissingDocuments(data: unknown): string[] {
  const list = typeof data === "object" && data !== null ? (data as Record<string, unknown>).missing_documents : undefined;
  if (!Array.isArray(list)) return [];
  const names = list.map((entry) => (typeof entry === "string" ? entry : typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).name : null))
    .filter((name): name is string => typeof name === "string" && name.trim() !== "")
    .map((name) => name.trim().slice(0, MAX_MISSING_NAME));
  return [...new Set(names)].slice(0, MAX_MISSING);
}

// A row has a Final Decision once a reviewer has decided it: decideSocRow
// (the review page) sets reviewedAt with every Final Decision. รอแก้ไข waits
// for a re-check, so it doesn't count.
const hasFinalDecision = (row: { reviewedAt: Date | null; finalDecision: string | null }) => row.reviewedAt !== null && row.finalDecision !== PENDING_FIX;

const RACED = "RACED";

class ConfirmationRequired extends Error {
  rows: ConfirmedRow[];
  constructor(rows: ConfirmedRow[]) {
    super("CONFIRMATION_REQUIRED");
    this.rows = rows;
  }
}

// Which flow the skill ran on, from results.json `options` (the skill adds
// "evidence_packet" only when it used the packet).
export function evidenceFlow(results: unknown): "packet" | "standard" {
  const options = typeof results === "object" && results !== null ? (results as Record<string, unknown>).options : null;
  return Array.isArray(options) && options.includes("evidence_packet") ? "packet" : "standard";
}

// Validates and stores one Local Check Run for one major item. The caller
// has already authorised the actor for the job. Throws NOT_FOUND when the
// job or major item doesn't exist; returns the problems when the run is
// invalid, in which case nothing is written.
//
// Re-check: when the item already has results, they are replaced in the same
// transaction and copied, every column, into a RESULTS_REPLACED audit event.
// Earlier runs and their SOC_Check documents are kept.
export async function importLocalCheckRun(actor: { id: string }, input: LocalCheckRunInput): Promise<LocalCheckRunImport> {
  const job = await prisma.socJob.findUnique({ where: { id: input.jobId } });
  const item = await prisma.socMajorItem.findUnique({ where: { id: input.majorItemId } });
  if (!job || job.deletedAt || !item || item.jobId !== job.id) throw new Error("NOT_FOUND");

  const errors: string[] = [];
  if (job.kind !== "IMPORTED") errors.push("นำเข้าผลได้เฉพาะงานตรวจแบบนำเข้าผล");
  const openStates: readonly string[] = SOC_CHECK_REQUEST_OPEN_STATES;
  if (!input.checkRequest && openStates.includes(item.state)) {
    errors.push(`${majorItemName(item.label)} มีคำขอตรวจด้วย SOC Runner ที่ยังไม่เสร็จ กดยกเลิกตรวจก่อนนำเข้าผลด้วยมือ`);
  }
  if (item.skipped) errors.push(`${majorItemName(item.label)} ตั้งเป็นไม่ต้องตรวจอยู่ กด "ตรวจข้อนี้" ก่อนนำเข้าผล`);
  const skillVersion = input.run.skillVersion.trim().slice(0, 200);
  const model = input.run.model.trim().slice(0, 200);
  if (!skillVersion) errors.push("กรุณาระบุเวอร์ชันของ skill ที่ใช้ตรวจ");
  if (!model) errors.push("กรุณาระบุชื่อโมเดล Claude ที่ใช้ตรวจ");
  const soc = await jobSocDocument(job.id);
  const needsSocCheck = !isExcelSoc(soc);
  const socCheck = needsSocCheck ? input.socCheck ?? null : null;
  if (needsSocCheck && (!socCheck || !magicIsDocx(socCheck.bytes) || socCheck.bytes.byteLength > MAX_SOC_FILE_BYTES)) {
    errors.push("ไฟล์ SOC_Check ต้องเป็น Word (.docx) ที่ถูกต้อง ขนาดไม่เกิน 25 MB");
  }
  const groupFirst = item.groupLabel ? await prisma.socMajorItem.findFirst({ where: { jobId: job.id, groupLabel: item.groupLabel }, orderBy: { position: "asc" }, select: { id: true } }) : null;
  const rowText = (await readJobSoc(soc))?.rowText ?? (() => null);
  const isImageRow = (row: number, itemNumber: string) => { const text = rowText(row, itemNumber); return text ? !!text.image : null; };
  const validated = validateLocalCheckRun(input.results, item, { takesGroupHeading: groupFirst?.id === item.id, isImageRow });
  if ("errors" in validated) errors.push(...validated.errors);
  if (errors.length || !("rows" in validated)) return { ok: false, errors };
  const onlyRows = input.checkRequest?.rowNumbers?.length ? input.checkRequest.rowNumbers : null;
  const runRows = onlyRows ? validated.rows.filter((row) => onlyRows.includes(row.row)) : validated.rows;
  if (!runRows.length) return { ok: false, errors: [`ผลตรวจไม่มีแถวที่ขอตรวจใหม่ (แถว ${onlyRows!.join(", ")})`] };

  // For the banner: documents the requester chose to check without, and
  // those Claude reports it couldn't find.
  // A re-check of picked rows keeps the names already on the item.
  const kept = onlyRows && Array.isArray(item.missingDocuments) ? item.missingDocuments.filter((n): n is string => typeof n === "string") : [];
  const missingDocuments = [...new Set([...kept, ...(input.checkRequest?.acknowledgedMissing ?? []), ...reportedMissingDocuments(input.results)])];
  const runId = randomUUID();
  const documentId = socCheck ? randomUUID() : null;
  const stored = socCheck ? await storeSocFile(job.id, socCheck.name, ".docx", socCheck.bytes) : null;
  const source = input.run.source;
  const packetFallback = input.run.packetFallback?.trim().slice(0, 300);
  const detail = { runId, majorItemId: item.id, majorItem: item.label, rowCount: runRows.length, source, skillVersion, model, ...(documentId ? { documentId } : {}), evidenceFlow: evidenceFlow(input.results), ...(packetFallback ? { packetFallback } : {}), ...(input.checkRequest ? { checkRequestId: input.checkRequest.id } : {}), ...(onlyRows ? { rowNumbers: runRows.map((r) => r.row) } : {}) };
  let replacedRowCount = 0;
  try {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Claiming the item first locks its row. Every import moves lastRunAt,
      // so of two imports racing for the same item only one gets past here.
      // A manual import can't land while a Check Request is open on the item;
      // a runner's lands only while its request is running.
      const request = input.checkRequest;
      const claimed = await tx.socMajorItem.updateMany({
        where: { id: item.id, lastRunAt: item.lastRunAt, state: request ? "running" : { notIn: [...SOC_CHECK_REQUEST_OPEN_STATES] } },
        data: {
          state: "checked", skillVersion, model, runSource: source, lastRunAt: now, ranById: actor.id,
          requestedById: request?.requestedById ?? null,
          missingDocuments: missingDocuments.length ? missingDocuments : Prisma.DbNull,
        },
      });
      if (claimed.count !== 1) throw new Error(RACED);
      if (request) {
        const closed = await tx.socCheckRequest.updateMany({
          where: { id: request.id, majorItemId: item.id, state: "running" },
          data: { state: "done", runId, finishedAt: now, progressNote: null },
        });
        if (closed.count !== 1) throw new Error(RACED);
      }
      replacedRowCount = await replacePreviousRows(tx, { jobId: job.id, actorId: actor.id, item, runId, replaceConfirmed: input.replaceConfirmed ?? [], onlyRows: onlyRows ? runRows.map((r) => r.row) : null });
      if (documentId && stored) await tx.socDocument.create({ data: { id: documentId, jobId: job.id, type: "RUN_OUTPUT", mimeType: DOCX_MIME, ...stored } });
      await tx.socCheckRun.create({
        data: { id: runId, jobId: job.id, majorItemId: item.id, source, skillVersion, model, documentId, rowCount: runRows.length, importedById: actor.id },
      });
      await tx.socCheckResult.createMany({ data: runRows.map((row) => resultRow(job.id, item.id, runId, row, rowText(row.row, row.item))) });
      await tx.socJob.update({ where: { id: job.id }, data: { updatedAt: now } });
      await tx.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: "RUN_IMPORTED", detail } });
    });
  } catch (error) {
    if (stored) await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    if (error instanceof ConfirmationRequired) {
      const listed = error.rows.map((r) => `ข้อ ${r.item}`).join(", ");
      return { ok: false, confirmedRows: error.rows, errors: [`${majorItemName(item.label)} มี ${error.rows.length} แถวที่ยืนยันผลแล้ว (${listed}) การตรวจซ้ำจะแทนที่แถวเหล่านี้ ต้องเลือก "แทนที่แถวที่ยืนยันแล้ว" ก่อนนำเข้า`] };
    }
    if (error instanceof Error && error.message === RACED) return { ok: false, errors: [`${majorItemName(item.label)} เพิ่งมีการนำเข้าผลพร้อมกัน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง`] };
    throw error;
  }
  await writeAudit({
    actorId: actor.id, action: "SOC_RUN_IMPORTED", entityType: "SOC_JOB", entityId: job.id,
    summary: replacedRowCount
      ? `ตรวจซ้ำ${majorItemName(item.label)} (${runRows.length} แถว แทนที่ ${replacedRowCount} แถวเดิม) ในงาน ${job.title}`
      : `นำเข้าผลตรวจ${majorItemName(item.label)} (${runRows.length} แถว) ในงาน ${job.title}`,
    metadata: replacedRowCount ? { ...detail, replacedRowCount } : detail,
  });
  return { ok: true, runId, rowCount: runRows.length };
}

// Deletes the major item's current rows (only `onlyRows` for a re-check of
// picked rows), after copying them into a RESULTS_REPLACED audit event. Runs inside the import's transaction, after
// the item is claimed. Throws ConfirmationRequired, rolling everything back,
// when a row has a Final Decision and the reviewer hasn't agreed to replace it.
async function replacePreviousRows(
  tx: Prisma.TransactionClient,
  { jobId, actorId, item, runId, replaceConfirmed, onlyRows }: { jobId: string; actorId: string; item: { id: string; label: string }; runId: string; replaceConfirmed: number[]; onlyRows: number[] | null },
): Promise<number> {
  const where = { majorItemId: item.id, ...(onlyRows ? { rowNumber: { in: onlyRows } } : {}) };
  const previous = await tx.socCheckResult.findMany({ where, orderBy: { rowNumber: "asc" } });
  if (!previous.length) return 0;
  const confirmedRows = previous.filter(hasFinalDecision).map((r) => ({ rowNumber: r.rowNumber, item: r.item }));
  if (confirmedRows.some((r) => !replaceConfirmed.includes(r.rowNumber))) throw new ConfirmationRequired(confirmedRows);
  await tx.socCheckResult.deleteMany({ where });
  const replacedRunIds = [...new Set(previous.map((r) => r.runId).filter((id): id is string => id !== null))];
  await tx.socAuditEvent.create({
    data: {
      jobId, actorId, action: "RESULTS_REPLACED",
      // Every column of every replaced row, as JSON (dates become ISO strings).
      detail: { majorItemId: item.id, majorItem: item.label, runId, replacedRunIds, confirmedRows, rows: JSON.parse(JSON.stringify(previous)) },
    },
  });
  return previous.length;
}

// The job's SOC file, as stored at upload.
export const jobSocDocument = (jobId: string) => prisma.socDocument.findFirst({ where: { jobId, type: "SOC" }, orderBy: { createdAt: "asc" } });

// The table of a job's SOC, for the TOR and bidder text of each row (and its
// sheet). Null when the SOC can't be read: the texts are then left empty
// rather than a valid run rejected. The review page reads it too.
export async function readJobSoc(soc: { jobId: string; storageKey: string } | null): Promise<SocTable | null> {
  try {
    if (soc) return readSocTable(new Uint8Array(await readFile(resolveStorageKey(soc.storageKey))));
  } catch (error) {
    console.error(`SOC ${soc?.jobId}: TOR text not read from the SOC`, error);
  }
  return null;
}

// The page of the PDF SOC that results row `row` with item `item` was read
// from, the row found as its TOR text is. `rowPages` is the job's
// socRowPages: the page of the Excel SOC's row i + 1 at index i (soc-pdf-soc
// ticket 01). Null when the SOC wasn't a PDF or the row isn't found.
export function socRowPage(soc: SocTable | null, rowPages: unknown, row: number, item: string): number | null {
  const position = soc?.rowPosition(row, item);
  const page: unknown = position && Array.isArray(rowPages) ? rowPages[position - 1] : null;
  return typeof page === "number" && Number.isInteger(page) && page > 0 ? page : null;
}

// One results.json row as a SocCheckResult. The skill's standard axes fill
// the legacy ai* columns (the System Recommendation). The legacy final*
// columns stay empty: the Final Decision is a separate, human step.
function resultRow(jobId: string, majorItemId: string, runId: string, row: ValidRow, text: { tor: string; proposal: string | null } | null): Prisma.SocCheckResultCreateManyInput {
  const reference = asColumnText(row.reference) ?? "";
  return {
    jobId, majorItemId, runId,
    rowNumber: row.row,
    item: row.item,
    // A picture is never a heading row: it waits for a Final Decision.
    rowType: row.image_kind === "picture" ? "content_row" : asColumnText(row.row_type) ?? "content_row",
    socText: text?.tor ?? "",
    proposalText: text?.proposal ?? null,
    referenceText: reference,
    referencePages: parseReferencePages(reference),
    aiReferenceCheck: asColumnText(row.reference_check) ?? "", // a picture has none
    aiHeadingTitleCheck: asColumnText(row.heading_title_check) ?? "",
    aiProductIdentity: asColumnText(row.product_identity) ?? "",
    aiContentRelevance: asColumnText(row.content_relevance) ?? "",
    aiDetail: asColumnText(row.detail) ?? "",
    aiConfidence: asColumnText(row.confidence) ?? "",
    finalReferenceCheck: "",
    finalHeadingTitleCheck: "",
    finalProductIdentity: "",
    finalContentRelevance: "",
    finalDetail: "",
    referenceDetail: asColumnText(row.reference_detail),
    itemLabelCheck: asColumnText(row.item_label_check),
    highlightCheck: asColumnText(row.highlight_check),
    highlightEvidence: asColumnText(row.highlight_evidence),
    evidenceSupport: asColumnText(row.evidence_support),
    evidenceDetail: asColumnText(row.evidence_detail),
    torDecision: asColumnText(row.tor_decision),
    torDecisionBasis: asColumnText(row.tor_decision_basis),
    verifiedValue: asColumnText(row.verified_value),
    torThreshold: asColumnText(row.tor_threshold),
    torClaimResults: row.tor_claim_results as Prisma.InputJsonValue,
    declaredStatus: asColumnText(row.declared_status),
    declaredStatusCheck: asColumnText(row.declared_status_check),
    keyIssue: asColumnText(row.key_issue),
    imageKind: asColumnText(row.image_kind),
    imageReading: asColumnText(row.image_reading) || null,
    imageUnsure: asColumnText(row.image_unsure) || null,
    referenceNote: asColumnText(row.reference_note) || null,
    rawResult: row as Prisma.InputJsonValue,
  };
}
