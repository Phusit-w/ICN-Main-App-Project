// Import one Local Check Run (ADR 0008, seam 1): the only code path that
// writes check results for an Imported SOC Check. Manual upload (phase 1) and
// the SOC Runner API (phase 2) both call importLocalCheckRun().
//
// Validation follows the SOC skill's references/word-output.md and its
// append_results_to_docx.py validate(), for the full mode every check runs
// in: full_audit + evidence_support + tor_decision. Any error rejects the
// whole file and nothing is written.
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { DOCX_MIME, MAX_SOC_FILE_BYTES, magicIsDocx, resolveStorageKey, storeSocFile } from "@/lib/soc";
import { isItemInMajorItem, majorItemKey, socRowTexts } from "@/lib/soc-major-items";
import { parseReferencePages } from "@/lib/soc-review";
import { SOC_CHECK_REQUEST_OPEN_STATES } from "@/lib/soc-shared";

export type LocalCheckRunSource = "manual" | "runner";

export type LocalCheckRunInput = {
  jobId: string;
  majorItemId: string;
  results: unknown; // the parsed results.json
  socCheck: { name: string; bytes: Uint8Array }; // the run's SOC_Check .docx
  run: { skillVersion: string; model: string; source: LocalCheckRunSource };
  // Re-check only: the row numbers with a Final Decision that the reviewer
  // was warned about and agreed to replace ("แทนที่แถวที่ยืนยันแล้ว"). A row
  // decided after the warning isn't in the list, so it warns again.
  replaceConfirmed?: number[];
  // Runner submissions only: the Check Request this run carries out. It must
  // be running; it is closed as done in the same transaction.
  checkRequest?: { id: string; requestedById: string; acknowledgedMissing: string[] };
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

// Fields every result must carry in full mode, in the order the skill lists them.
const REQUIRED_FIELDS = [
  "row", "item", "reference_check", "detail",
  "reference_detail", // reference (standard and full_audit)
  "item_label_check", "highlight_check", "highlight_evidence", // full_audit
  "evidence_support", "evidence_detail", // evidence_support
  "tor_decision", "tor_decision_basis", "verified_value", "tor_threshold", // tor_decision (tor-decision.md)
  "tor_claim_results", "declared_status", "declared_status_check",
] as const;

type ValidRow = Record<string, unknown> & { row: number; item: string };

function isBlank(value: unknown) {
  return value === undefined || value === null || value === "";
}

// Checks a results.json against the full-mode rules and the major item it is
// imported into. Returns every problem found, in Thai, or the rows.
// `takesGroupHeading`: the item is the first sub-section of a split major
// item, so that item's own heading row ("๕") may be among its rows.
export function validateLocalCheckRun(data: unknown, majorItem: { key: string; label: string }, { takesGroupHeading = false } = {}): { rows: ValidRow[] } | { errors: string[] } {
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
    const missing = REQUIRED_FIELDS.filter((field) => isBlank(row[field]));
    if (missing.length) errors.push(`${where}: ขาด ${missing.join(", ")}`);
    if (!isBlank(row.reference_check) && !REFERENCE_CHECKS.has(String(row.reference_check))) {
      errors.push(`${where}: reference_check ไม่ถูกต้อง (${JSON.stringify(row.reference_check)})`);
    }
    if (!isBlank(row.tor_claim_results) && !Array.isArray(row.tor_claim_results)) {
      errors.push(`${where}: tor_claim_results ต้องเป็นรายการ`);
    }
    if (!isBlank(row.row)) {
      if (!Number.isInteger(row.row) || (row.row as number) < 1) {
        errors.push(`${where}: row ต้องเป็นเลขแถวในตาราง Word (จำนวนเต็มบวก)`);
      } else if (seenRows.has(row.row as number)) {
        errors.push(`${where}: row ${row.row} ซ้ำกับรายการก่อนหน้า`);
      } else {
        seenRows.add(row.row as number);
      }
    }
    if (!isBlank(row.item)) {
      if (!majorItemKey(String(row.item))) errors.push(`${where}: item ไม่ใช่เลขข้อ`);
      else if (!isItemInMajorItem(String(row.item), majorItem, { takesGroupHeading })) errors.push(`${where} ไม่ได้อยู่ในข้อใหญ่ ${majorItem.label}`);
    }
  });

  if (errors.length > MAX_ERRORS) {
    return { errors: [...errors.slice(0, MAX_ERRORS), `และปัญหาอื่นอีก ${errors.length - MAX_ERRORS} รายการ`] };
  }
  return errors.length ? { errors } : { rows: results as ValidRow[] };
}

// A results.json value for a String column: values are normally strings,
// but a model may write a number or an object, which is kept as JSON text.
function asColumnText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

// A row has a Final Decision once a reviewer has decided it: decideSocRow
// (the review page) sets reviewedAt with every Final Decision.
const hasFinalDecision = (row: { reviewedAt: Date | null }) => row.reviewedAt !== null;

const RACED = "RACED";

class ConfirmationRequired extends Error {
  rows: ConfirmedRow[];
  constructor(rows: ConfirmedRow[]) {
    super("CONFIRMATION_REQUIRED");
    this.rows = rows;
  }
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
    errors.push(`ข้อ ${item.label} มีคำขอตรวจด้วย SOC Runner ที่ยังไม่เสร็จ ยกเลิกคำขอก่อนนำเข้าผลด้วยมือ`);
  }
  const skillVersion = input.run.skillVersion.trim().slice(0, 200);
  const model = input.run.model.trim().slice(0, 200);
  if (!skillVersion) errors.push("กรุณาระบุเวอร์ชันของ skill ที่ใช้ตรวจ");
  if (!model) errors.push("กรุณาระบุชื่อโมเดล Claude ที่ใช้ตรวจ");
  if (!magicIsDocx(input.socCheck.bytes) || input.socCheck.bytes.byteLength > MAX_SOC_FILE_BYTES) {
    errors.push("ไฟล์ SOC_Check ต้องเป็น Word (.docx) ที่ถูกต้อง ขนาดไม่เกิน 25 MB");
  }
  const groupFirst = item.groupLabel ? await prisma.socMajorItem.findFirst({ where: { jobId: job.id, groupLabel: item.groupLabel }, orderBy: { position: "asc" }, select: { id: true } }) : null;
  const validated = validateLocalCheckRun(input.results, item, { takesGroupHeading: groupFirst?.id === item.id });
  if ("errors" in validated) errors.push(...validated.errors);
  if (errors.length || !("rows" in validated)) return { ok: false, errors };

  const rowText = await jobSocRowTexts(job.id);
  const runId = randomUUID();
  const documentId = randomUUID();
  const stored = await storeSocFile(job.id, input.socCheck.name, ".docx", input.socCheck.bytes);
  const source = input.run.source;
  const detail = { runId, majorItemId: item.id, majorItem: item.label, rowCount: validated.rows.length, source, skillVersion, model, documentId, ...(input.checkRequest ? { checkRequestId: input.checkRequest.id } : {}) };
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
          // Documents the requester chose to check without (the missing-documents banner).
          missingDocuments: request?.acknowledgedMissing.length ? request.acknowledgedMissing : Prisma.DbNull,
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
      replacedRowCount = await replacePreviousRows(tx, { jobId: job.id, actorId: actor.id, item, runId, replaceConfirmed: input.replaceConfirmed ?? [] });
      await tx.socDocument.create({ data: { id: documentId, jobId: job.id, type: "RUN_OUTPUT", mimeType: DOCX_MIME, ...stored } });
      await tx.socCheckRun.create({
        data: { id: runId, jobId: job.id, majorItemId: item.id, source, skillVersion, model, documentId, rowCount: validated.rows.length, importedById: actor.id },
      });
      await tx.socCheckResult.createMany({ data: validated.rows.map((row) => resultRow(job.id, item.id, runId, row, rowText(row.row, row.item))) });
      await tx.socJob.update({ where: { id: job.id }, data: { updatedAt: now } });
      await tx.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: "RUN_IMPORTED", detail } });
    });
  } catch (error) {
    await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    if (error instanceof ConfirmationRequired) {
      const listed = error.rows.map((r) => `ข้อ ${r.item}`).join(", ");
      return { ok: false, confirmedRows: error.rows, errors: [`ข้อ ${item.label} มี ${error.rows.length} แถวที่ยืนยันผลแล้ว (${listed}) การตรวจซ้ำจะแทนที่แถวเหล่านี้ ต้องเลือก "แทนที่แถวที่ยืนยันแล้ว" ก่อนนำเข้า`] };
    }
    if (error instanceof Error && error.message === RACED) return { ok: false, errors: [`ข้อ ${item.label} เพิ่งมีการนำเข้าผลพร้อมกัน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง`] };
    throw error;
  }
  await writeAudit({
    actorId: actor.id, action: "SOC_RUN_IMPORTED", entityType: "SOC_JOB", entityId: job.id,
    summary: replacedRowCount
      ? `ตรวจซ้ำข้อ ${item.label} (${validated.rows.length} แถว แทนที่ ${replacedRowCount} แถวเดิม) ในงาน ${job.title}`
      : `นำเข้าผลตรวจข้อ ${item.label} (${validated.rows.length} แถว) ในงาน ${job.title}`,
    metadata: replacedRowCount ? { ...detail, replacedRowCount } : detail,
  });
  return { ok: true, runId, rowCount: validated.rows.length };
}

// Deletes the major item's current rows, after copying them into a
// RESULTS_REPLACED audit event. Runs inside the import's transaction, after
// the item is claimed. Throws ConfirmationRequired, rolling everything back,
// when a row has a Final Decision and the reviewer hasn't agreed to replace it.
async function replacePreviousRows(
  tx: Prisma.TransactionClient,
  { jobId, actorId, item, runId, replaceConfirmed }: { jobId: string; actorId: string; item: { id: string; label: string }; runId: string; replaceConfirmed: number[] },
): Promise<number> {
  const previous = await tx.socCheckResult.findMany({ where: { majorItemId: item.id }, orderBy: { rowNumber: "asc" } });
  if (!previous.length) return 0;
  const confirmedRows = previous.filter(hasFinalDecision).map((r) => ({ rowNumber: r.rowNumber, item: r.item }));
  if (confirmedRows.some((r) => !replaceConfirmed.includes(r.rowNumber))) throw new ConfirmationRequired(confirmedRows);
  await tx.socCheckResult.deleteMany({ where: { majorItemId: item.id } });
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

// The TOR and bidder text of each row, from the job's SOC. An unreadable SOC
// leaves them empty rather than rejecting a valid run.
async function jobSocRowTexts(jobId: string): Promise<ReturnType<typeof socRowTexts>> {
  try {
    const soc = await prisma.socDocument.findFirst({ where: { jobId, type: "SOC" }, orderBy: { createdAt: "asc" } });
    if (soc) return socRowTexts(new Uint8Array(await readFile(resolveStorageKey(soc.storageKey))));
  } catch (error) {
    console.error(`SOC ${jobId}: TOR text not read from the SOC`, error);
  }
  return () => null;
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
    rowType: asColumnText(row.row_type) ?? "content_row",
    socText: text?.tor ?? "",
    proposalText: text?.proposal ?? null,
    referenceText: reference,
    referencePages: parseReferencePages(reference),
    aiReferenceCheck: String(row.reference_check),
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
    rawResult: row as Prisma.InputJsonValue,
  };
}
