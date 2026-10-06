// Importing one Local Check Run (ADR 0008, ticket 05, seam 1): the only path
// that writes check results. Driven through importLocalCheckRun() and the
// manual-upload route, with the signed-in user stubbed. The valid fixture is a
// real full-mode Sonnet run on SOC_Demo (SOC-model-bench-2026-09-04).
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx } from "@/test/docx-fixture";
import { majorItemKey } from "@/lib/soc-major-items";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: importRoute } = await import("@/app/api/soc/jobs/[id]/major-items/[itemId]/import/route");
const { createImportedSocJob, listSocJobs } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");
const { updateSocResult } = await import("@/actions/soc");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

type Row = Record<string, unknown>;
type RunFile = { mode: string; options: string[]; model: string; skill_version: string; results: Row[] } & Record<string, unknown>;

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/soc/${name}`, import.meta.url)));
const SOC_DEMO = fixture("SOC_Demo.docx");
const SONNET_RUN = JSON.parse(new TextDecoder().decode(fixture("results_sonnet.json"))) as RunFile;
const SOC_CHECK = buildDocx("<w:p><w:r><w:t>ผลการตรวจสอบ SOC</w:t></w:r></w:p>");
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");

// The real run covers several major items; one Local Check Run covers one.
function runFor(key: string): RunFile {
  const copy = structuredClone(SONNET_RUN);
  copy.results = copy.results.filter((row) => majorItemKey(String(row.item)) === key);
  return copy;
}

function user(username: string, appAccess: string[] = ["soc"], role = "USER") {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess } });
}

async function setup() {
  const owner = await user("owner");
  const jobId = await createImportedSocJob(owner, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "Datasheet_Demo.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  const item = items.find((m) => m.key === "1");
  assert.ok(item, "SOC_Demo has major item ๑");
  return { owner, jobId, item, total: items.length };
}

const MANUAL = { skillVersion: "sha256:66938c26cb0ed5ae", model: "claude-cli:sonnet", source: "manual" as const };

function importRun(actor: Actor, jobId: string, majorItemId: string, results: unknown, overrides: { socCheck?: Uint8Array; run?: Partial<typeof MANUAL> } = {}) {
  return importLocalCheckRun(actor, {
    jobId, majorItemId, results,
    socCheck: { name: "SOC_Check.docx", bytes: overrides.socCheck ?? SOC_CHECK },
    run: { ...MANUAL, ...overrides.run },
  });
}

async function assertNothingWritten(jobId: string, majorItemId: string) {
  assert.equal(await prisma.socCheckResult.count({ where: { jobId } }), 0);
  assert.equal(await prisma.socCheckRun.count({ where: { jobId } }), 0);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "RUN_OUTPUT" } }), 0);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "RUN_IMPORTED" } }), 0);
  const item = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: majorItemId } });
  assert.deepEqual([item.state, item.skillVersion, item.model, item.runSource, item.ranById], ["not_checked", null, null, null, null]);
  // Only the SOC and the evidence PDF from job creation are on disk.
  assert.equal((await readdir(path.join(storageRoot, jobId))).length, 2);
}

function postImport(jobId: string, itemId: string, fields: { results?: string; socCheck?: Uint8Array<ArrayBuffer>; skillVersion?: string; model?: string; replaceConfirmed?: string }) {
  const form = new FormData();
  if (fields.replaceConfirmed !== undefined) form.set("replaceConfirmed", fields.replaceConfirmed);
  if (fields.results !== undefined) form.set("results", new File([fields.results], "results.json", { type: "application/json" }));
  if (fields.socCheck) form.set("socCheck", new File([fields.socCheck], "SOC_Check-ข้อ1.docx"));
  if (fields.skillVersion !== undefined) form.set("skillVersion", fields.skillVersion);
  if (fields.model !== undefined) form.set("model", fields.model);
  return importRoute(
    new Request(`http://localhost/api/soc/jobs/${jobId}/major-items/${itemId}/import`, { method: "POST", body: form }),
    { params: Promise.resolve({ id: jobId, itemId }) },
  );
}

test("a real full-mode run for one major item imports through the upload route, storing every axis", { skip }, async () => {
  const { jobId, item, total } = await setup();
  signedIn = await user("colleague"); // any soc user may import
  const run = runFor("1");

  const response = await postImport(jobId, item.id, { results: JSON.stringify(run), socCheck: SOC_CHECK });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const body = (await response.json()) as { runId: string; rowCount: number };
  assert.equal(body.rowCount, 7);

  const rows = await prisma.socCheckResult.findMany({ where: { jobId }, orderBy: { rowNumber: "asc" } });
  assert.deepEqual(rows.map((r) => [r.rowNumber, r.item]), run.results.map((r) => [r.row, r.item]));
  for (const row of rows) {
    assert.equal(row.majorItemId, item.id);
    assert.equal(row.runId, body.runId);
  }

  const source = run.results.find((r) => r.item === "๑.๑.๑")!;
  const stored = rows.find((r) => r.item === "๑.๑.๑")!;
  assert.deepEqual({
    reference_check: stored.aiReferenceCheck, reference_detail: stored.referenceDetail,
    heading_title_check: stored.aiHeadingTitleCheck, product_identity: stored.aiProductIdentity,
    content_relevance: stored.aiContentRelevance, item_label_check: stored.itemLabelCheck,
    highlight_check: stored.highlightCheck, highlight_evidence: stored.highlightEvidence,
    evidence_support: stored.evidenceSupport, evidence_detail: stored.evidenceDetail,
    tor_decision: stored.torDecision, tor_decision_basis: stored.torDecisionBasis,
    verified_value: stored.verifiedValue, tor_threshold: stored.torThreshold,
    tor_claim_results: stored.torClaimResults, declared_status: stored.declaredStatus,
    declared_status_check: stored.declaredStatusCheck, detail: stored.aiDetail,
    confidence: stored.aiConfidence, key_issue: stored.keyIssue,
    reference: stored.referenceText, row_type: stored.rowType,
  }, {
    reference_check: source.reference_check, reference_detail: source.reference_detail,
    heading_title_check: source.heading_title_check, product_identity: source.product_identity,
    content_relevance: source.content_relevance, item_label_check: source.item_label_check,
    highlight_check: source.highlight_check, highlight_evidence: source.highlight_evidence,
    evidence_support: source.evidence_support, evidence_detail: source.evidence_detail,
    tor_decision: source.tor_decision, tor_decision_basis: source.tor_decision_basis,
    verified_value: source.verified_value, tor_threshold: source.tor_threshold,
    tor_claim_results: source.tor_claim_results, declared_status: source.declared_status,
    declared_status_check: source.declared_status_check, detail: source.detail,
    confidence: source.confidence, key_issue: source.key_issue,
    reference: source.reference, row_type: source.row_type,
  });
  assert.deepEqual(stored.rawResult, source);
  // A System Recommendation is never a Final Decision.
  assert.ok(rows.every((r) => r.reviewedAt === null && r.reviewedById === null));
  assert.ok(rows.every((r) => r.finalReferenceCheck === "" && r.finalHeadingTitleCheck === "" && r.finalDetail === ""));

  // The run, its SOC_Check document and the major item record where it came from.
  const storedRun = await prisma.socCheckRun.findUniqueOrThrow({ where: { id: body.runId } });
  assert.deepEqual(
    [storedRun.majorItemId, storedRun.source, storedRun.skillVersion, storedRun.model, storedRun.rowCount, storedRun.importedById],
    [item.id, "manual", run.skill_version, run.model, 7, signedIn.id],
  );
  const document = await prisma.socDocument.findUniqueOrThrow({ where: { id: storedRun.documentId } });
  assert.deepEqual([document.jobId, document.type, document.originalName], [jobId, "RUN_OUTPUT", "SOC_Check-ข้อ1.docx"]);
  assert.ok(existsSync(path.join(storageRoot, ...document.storageKey.split("/"))));

  const checked = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.deepEqual(
    [checked.state, checked.skillVersion, checked.model, checked.runSource, checked.ranById],
    ["checked", run.skill_version, run.model, "manual", signedIn.id],
  );
  assert.ok(checked.lastRunAt);

  // Progress moves to 1/N on the list.
  const [listed] = await listSocJobs(signedIn);
  assert.deepEqual(listed.majorItemProgress, { checked: 1, total, percent: Math.round(100 / total) });

  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "RUN_IMPORTED" } });
  assert.equal(event.actorId, signedIn.id);
  assert.deepEqual(event.detail, { runId: body.runId, majorItemId: item.id, majorItem: "๑", rowCount: 7, source: "manual", skillVersion: run.skill_version, model: run.model, documentId: document.id });
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: jobId, action: "SOC_RUN_IMPORTED" } });
  assert.equal(log.actorId, signedIn.id);
});

test("skill version and model typed in the upload form override the ones in the file", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  signedIn = owner;
  const response = await postImport(jobId, item.id, { results: JSON.stringify(runFor("1")), socCheck: SOC_CHECK, skillVersion: " v2026.10.06 ", model: "claude-sonnet-5-5" });
  assert.equal(response.status, 201);
  const checked = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.deepEqual([checked.skillVersion, checked.model], ["v2026.10.06", "claude-sonnet-5-5"]);
});

// Every rule from the skill's references/word-output.md (and
// append_results_to_docx.py's validate()) for full_audit + evidence_support +
// tor_decision. Each must reject the whole file and write nothing.
const REQUIRED = [
  "row", "item", "reference_check", "detail", "reference_detail", "item_label_check",
  "highlight_check", "highlight_evidence", "evidence_support", "evidence_detail",
  "tor_decision", "tor_decision_basis", "verified_value", "tor_threshold",
  "tor_claim_results", "declared_status", "declared_status_check",
];

const BROKEN: [string, (run: RunFile) => unknown, RegExp][] = [
  ["the root isn't an object", () => [], /JSON object/],
  ["mode is standard", (run) => ({ ...run, mode: "standard" }), /mode ต้องเป็น full_audit/],
  ["mode is missing", (run) => ({ ...run, mode: undefined }), /mode ต้องเป็น full_audit/],
  ["options lack tor_decision", (run) => ({ ...run, options: ["evidence_support"] }), /options.*tor_decision/],
  ["options lack evidence_support", (run) => ({ ...run, options: ["tor_decision"] }), /options.*evidence_support/],
  ["options isn't a list", (run) => ({ ...run, options: "evidence_support,tor_decision" }), /options/],
  ["results is empty", (run) => ({ ...run, results: [] }), /results/],
  ["results is missing", (run) => ({ ...run, results: undefined }), /results/],
  ["a result isn't an object", (run) => ({ ...run, results: [...run.results, "row 11"] }), /รายการที่ 8/],
  ["reference_check has an unknown value", (run) => withRow(run, 2, { reference_check: "review" }), /รายการที่ 2.*reference_check/],
  ["tor_claim_results isn't a list", (run) => withRow(run, 3, { tor_claim_results: "none" }), /รายการที่ 3.*tor_claim_results/],
  ["row isn't a row number", (run) => withRow(run, 1, { row: "สี่" }), /รายการที่ 1.*row/],
  ["two results have the same row", (run) => withRow(run, 2, { row: run.results[0].row }), /row 4 ซ้ำ/],
  ["item isn't an item number", (run) => withRow(run, 4, { item: "หมายเหตุ" }), /รายการที่ 4.*เลขข้อ/],
  ...REQUIRED.map((field): [string, (run: RunFile) => unknown, RegExp] => [
    `a row lacks ${field}`, (run) => withRow(run, 5, { [field]: undefined }), new RegExp(`รายการที่ 5.*${field}`),
  ]),
  ["a required field is blank", (run) => withRow(run, 6, { highlight_evidence: "" }), /รายการที่ 6.*highlight_evidence/],
];

function withRow(run: RunFile, position: number, patch: Row): RunFile {
  run.results[position - 1] = { ...run.results[position - 1], ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete run.results[position - 1][key];
  return run;
}

for (const [name, breakIt, reason] of BROKEN) {
  test(`rejected with nothing written when ${name}`, { skip }, async () => {
    const { owner, jobId, item } = await setup();
    const result = await importRun(owner, jobId, item.id, breakIt(runFor("1")));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.some((e) => reason.test(e)), `expected ${reason} in ${JSON.stringify(result)}`);
    await assertNothingWritten(jobId, item.id);
  });
}

test("rows from another major item are rejected, naming them", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  const result = await importRun(owner, jobId, item.id, structuredClone(SONNET_RUN)); // the whole SOC, not just ข้อ ๑
  assert.equal(result.ok, false);
  const errors = result.ok ? [] : result.errors;
  for (const other of ["๒.๑", "๒.๒", "๓.๒", "๓.๓.๑", "๔.๓.๓", "4.8.2.6"]) {
    assert.ok(errors.some((e) => e.includes(`ข้อ ${other}`) && e.includes("ไม่ได้อยู่ในข้อใหญ่ ๑")), `${other} in ${JSON.stringify(errors)}`);
  }
  await assertNothingWritten(jobId, item.id);
});

test("every problem in a file is reported at once", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  const run = withRow(withRow({ ...runFor("1"), mode: "standard" }, 2, { detail: undefined }), 3, { reference_check: "ok" });
  const result = await importRun(owner, jobId, item.id, run);
  assert.equal(result.ok ? 0 : result.errors.length, 3);
});

test("a run without a skill version or model is rejected", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  const result = await importRun(owner, jobId, item.id, runFor("1"), { run: { skillVersion: " ", model: "" } });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.some((e) => /skill/.test(e)) && result.errors.some((e) => /โมเดล/.test(e)));
  await assertNothingWritten(jobId, item.id);
});

test("a SOC_Check that isn't a Word document is rejected", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  const result = await importRun(owner, jobId, item.id, runFor("1"), { socCheck: PDF });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.some((e) => /SOC_Check/.test(e)));
  await assertNothingWritten(jobId, item.id);
});

// Re-checking a major item (ticket 06): a new run for an item that already has
// results replaces its rows, keeping the old rows in a RESULTS_REPLACED event.
function rerun(key: string, detail: string): RunFile {
  const run = runFor(key);
  for (const row of run.results) row.detail = detail;
  return run;
}

// Stands in for a reviewer's Final Decision until the review page (ticket 08).
function decide(rowId: string, reviewerId: string) {
  return prisma.socCheckResult.update({ where: { id: rowId }, data: { reviewedAt: new Date(), reviewedById: reviewerId, finalReferenceCheck: "match", finalDetail: "ยืนยันแล้ว" } });
}

test("a re-check replaces only that major item's rows and keeps the old ones in the audit trail", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  const other = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId, key: "2" } });
  const first = await importRun(owner, jobId, item.id, runFor("1"));
  assert.ok(first.ok);
  assert.ok((await importRun(owner, jobId, other.id, runFor("2"))).ok);
  const before = await prisma.socCheckResult.findMany({ where: { majorItemId: item.id }, orderBy: { rowNumber: "asc" } });
  const otherBefore = await prisma.socCheckResult.findMany({ where: { majorItemId: other.id }, orderBy: { rowNumber: "asc" } });

  const rechecker = await user("rechecker");
  const again = await importRun(rechecker, jobId, item.id, rerun("1", "ตรวจซ้ำ"), { run: { skillVersion: "v2", model: "claude-opus-5-5" } });
  assert.ok(again.ok, JSON.stringify(again));
  assert.equal(again.rowCount, 7);

  const after = await prisma.socCheckResult.findMany({ where: { majorItemId: item.id }, orderBy: { rowNumber: "asc" } });
  assert.deepEqual(after.map((r) => r.rowNumber), before.map((r) => r.rowNumber));
  assert.ok(after.every((r) => r.runId === again.runId && r.aiDetail === "ตรวจซ้ำ"));
  assert.deepEqual(await prisma.socCheckResult.findMany({ where: { majorItemId: other.id }, orderBy: { rowNumber: "asc" } }), otherBefore);

  const recheckedItem = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.deepEqual([recheckedItem.state, recheckedItem.skillVersion, recheckedItem.model, recheckedItem.ranById], ["checked", "v2", "claude-opus-5-5", rechecker.id]);
  // Both runs and their SOC_Check documents stay.
  assert.equal(await prisma.socCheckRun.count({ where: { majorItemId: item.id } }), 2);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "RUN_OUTPUT" } }), 3);

  // The replaced rows can be recovered, every column, from the audit event.
  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "RESULTS_REPLACED" } });
  assert.equal(event.actorId, rechecker.id);
  const detail = event.detail as { majorItemId: string; replacedRunIds: string[]; runId: string; confirmedRows: unknown[]; rows: unknown[] };
  assert.deepEqual([detail.majorItemId, detail.replacedRunIds, detail.runId, detail.confirmedRows], [item.id, [first.runId], again.runId, []]);
  assert.deepEqual(detail.rows, JSON.parse(JSON.stringify(before)));
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "RUN_IMPORTED" } }), 3);
});

test("a re-check over rows with a Final Decision warns and writes nothing until confirmed", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  assert.ok((await importRun(owner, jobId, item.id, runFor("1"))).ok);
  const rows = await prisma.socCheckResult.findMany({ where: { majorItemId: item.id }, orderBy: { rowNumber: "asc" } });
  await decide(rows[1].id, owner.id);
  await decide(rows[4].id, owner.id);
  const before = await prisma.socCheckResult.findMany({ where: { majorItemId: item.id }, orderBy: { rowNumber: "asc" } });
  const itemBefore = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item.id } });

  const warned = await importRun(owner, jobId, item.id, rerun("1", "ตรวจซ้ำ"));
  assert.equal(warned.ok, false);
  assert.ok(!warned.ok && warned.errors.some((e) => /ยืนยันแล้ว/.test(e)));
  assert.deepEqual(!warned.ok && warned.confirmedRows, [rows[1], rows[4]].map((r) => ({ rowNumber: r.rowNumber, item: r.item })));
  assert.deepEqual(await prisma.socCheckResult.findMany({ where: { majorItemId: item.id }, orderBy: { rowNumber: "asc" } }), before);
  assert.deepEqual(await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item.id } }), itemBefore);
  assert.equal(await prisma.socCheckRun.count({ where: { jobId } }), 1);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "RUN_OUTPUT" } }), 1);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: { in: ["RESULTS_REPLACED", "RUN_IMPORTED"] } } }), 1);
  assert.equal((await readdir(path.join(storageRoot, jobId))).length, 3);

  // A row decided after the warning wasn't agreed to, so it warns again.
  await decide(rows[6].id, owner.id);
  const recheck = (replaceConfirmed: number[]) => importLocalCheckRun(owner, {
    jobId, majorItemId: item.id, results: rerun("1", "ตรวจซ้ำ"),
    socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: MANUAL, replaceConfirmed,
  });
  const stale = await recheck([rows[1].rowNumber, rows[4].rowNumber]);
  assert.equal(stale.ok, false);
  assert.deepEqual(!stale.ok && stale.confirmedRows?.map((r) => r.rowNumber), [rows[1], rows[4], rows[6]].map((r) => r.rowNumber));
  assert.equal(await prisma.socCheckRun.count({ where: { jobId } }), 1);

  const confirmed = await recheck([rows[1], rows[4], rows[6]].map((r) => r.rowNumber));
  assert.ok(confirmed.ok, JSON.stringify(confirmed));
  const after = await prisma.socCheckResult.findMany({ where: { majorItemId: item.id } });
  assert.ok(after.every((r) => r.aiDetail === "ตรวจซ้ำ" && r.reviewedAt === null));
  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "RESULTS_REPLACED" } });
  const detail = event.detail as { confirmedRows: unknown[]; rows: { id: string; finalDetail: string }[] };
  assert.deepEqual(detail.confirmedRows, [rows[1], rows[4], rows[6]].map((r) => ({ rowNumber: r.rowNumber, item: r.item })));
  assert.equal(detail.rows.find((r) => r.id === rows[1].id)?.finalDetail, "ยืนยันแล้ว");
});

test("the upload route answers 409 over confirmed rows, and 201 once the reviewer confirms", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  signedIn = owner;
  assert.equal((await postImport(jobId, item.id, { results: JSON.stringify(runFor("1")), socCheck: SOC_CHECK })).status, 201);
  const row = await prisma.socCheckResult.findFirstOrThrow({ where: { majorItemId: item.id }, orderBy: { rowNumber: "asc" } });
  await decide(row.id, owner.id);

  const warned = await postImport(jobId, item.id, { results: JSON.stringify(rerun("1", "ตรวจซ้ำ")), socCheck: SOC_CHECK });
  assert.equal(warned.status, 409);
  const body = (await warned.json()) as { errors: string[]; confirmedRows: { rowNumber: number; item: string }[] };
  assert.deepEqual(body.confirmedRows, [{ rowNumber: row.rowNumber, item: row.item }]);

  const confirmed = await postImport(jobId, item.id, { results: JSON.stringify(rerun("1", "ตรวจซ้ำ")), socCheck: SOC_CHECK, replaceConfirmed: String(row.rowNumber) });
  assert.equal(confirmed.status, 201, JSON.stringify(await confirmed.clone().json()));
  assert.equal((await prisma.socCheckResult.findUniqueOrThrow({ where: { jobId_rowNumber: { jobId, rowNumber: row.rowNumber } } })).aiDetail, "ตรวจซ้ำ");
});

test("of two re-checks racing for the same major item, only one is stored", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  assert.ok((await importRun(owner, jobId, item.id, runFor("1"))).ok);
  const results = await Promise.all([importRun(owner, jobId, item.id, rerun("1", "ก")), importRun(owner, jobId, item.id, rerun("1", "ข"))]);
  assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
  assert.equal(await prisma.socCheckRun.count({ where: { jobId } }), 2);
  assert.equal(await prisma.socCheckResult.count({ where: { jobId } }), 7);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "RESULTS_REPLACED" } }), 1);
  assert.equal((await readdir(path.join(storageRoot, jobId))).length, 4);
});

test("of two imports racing for the same major item, only one is stored", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  const results = await Promise.all([importRun(owner, jobId, item.id, runFor("1")), importRun(owner, jobId, item.id, runFor("1"))]);
  assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
  assert.equal(await prisma.socCheckRun.count({ where: { jobId } }), 1);
  assert.equal(await prisma.socCheckResult.count({ where: { jobId } }), 7);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "RUN_OUTPUT" } }), 1);
  assert.equal((await readdir(path.join(storageRoot, jobId))).length, 3);
});

test("a major item of another job is not found", { skip }, async () => {
  const { owner, jobId } = await setup();
  const otherJob = await createImportedSocJob(owner, { title: "อีกงาน", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "a.pdf", bytes: PDF }] });
  const foreign = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId: otherJob, key: "1" } });
  await assert.rejects(importRun(owner, jobId, foreign.id, runFor("1")), /NOT_FOUND/);
  assert.equal(await prisma.socCheckResult.count(), 0);
});

test("the upload route answers 422 with the Thai reasons for an invalid file", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  signedIn = owner;
  const response = await postImport(jobId, item.id, { results: JSON.stringify({ ...runFor("1"), mode: "custom" }), socCheck: SOC_CHECK });
  assert.equal(response.status, 422);
  const body = (await response.json()) as { errors: string[] };
  assert.ok(body.errors.some((e) => /mode ต้องเป็น full_audit/.test(e)));
  await assertNothingWritten(jobId, item.id);
});

test("the upload route rejects a results file that isn't JSON", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  signedIn = owner;
  const response = await postImport(jobId, item.id, { results: "{ not json", socCheck: SOC_CHECK });
  assert.equal(response.status, 422);
  assert.match(((await response.json()) as { errors: string[] }).errors[0], /JSON/);
  await assertNothingWritten(jobId, item.id);
});

test("the upload route needs both files", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  signedIn = owner;
  const response = await postImport(jobId, item.id, { results: JSON.stringify(runFor("1")) });
  assert.equal(response.status, 400);
  await assertNothingWritten(jobId, item.id);
});

test("a user without soc access can't import", { skip }, async () => {
  const { jobId, item } = await setup();
  signedIn = await user("expense-only", ["expense"]);
  const response = await postImport(jobId, item.id, { results: JSON.stringify(runFor("1")), socCheck: SOC_CHECK });
  assert.equal(response.status, 403);
  await assertNothingWritten(jobId, item.id);
});

test("imported rows can't be edited through the legacy review action", { skip }, async () => {
  const { owner, jobId, item } = await setup();
  await importRun(owner, jobId, item.id, runFor("1"));
  const row = await prisma.socCheckResult.findFirstOrThrow({ where: { jobId } });
  signedIn = owner;
  await assert.rejects(updateSocResult({ jobId, resultId: row.id, referenceCheck: "match", headingTitleCheck: "match", detail: "ok" }));
  assert.equal((await prisma.socCheckResult.findUniqueOrThrow({ where: { id: row.id } })).reviewedAt, null);
});
