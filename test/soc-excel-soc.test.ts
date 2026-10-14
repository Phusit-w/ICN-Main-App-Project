// An Excel SOC end to end (soc-image-rows ticket 05): a Local Check Run is
// accepted with its results alone (manual import and the runner's submit),
// while a Word SOC still needs its SOC_Check; the review page and the results
// Excel show the workbook's rows, with the sheet when there are several; a
// runner too old for an Excel SOC is handed no such request. Driven through
// the routes, the import and the review view, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx, buildZip } from "@/test/docx-fixture";
import { buildTablePdf } from "@/test/pdf-table-fixture";
import { buildXlsx, type SheetSpec } from "@/test/xlsx-fixture";
import { newSocRunnerToken } from "@/lib/soc-runner-token";
import { majorItemStateText, SOC_RUNNER_FOR_EXCEL_SOC, XLSX_MIME } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: importRoute } = await import("@/app/api/soc/jobs/[id]/major-items/[itemId]/import/route");
const { GET: excelRoute } = await import("@/app/api/soc/jobs/[id]/results-excel/route");
const { POST: claimRoute } = await import("@/app/api/soc-runner/claim/route");
const { POST: submitRoute } = await import("@/app/api/soc-runner/requests/[id]/submit/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");
const { requestSocCheck, requestSocRowRechecks, setSocMajorItemSkipped } = await import("@/actions/socCheckRequests");
const { createImportedSocJob, validateUpload } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");
const { socReviewView } = await import("@/lib/soc-review-view");
const { majorItemRequestViews } = await import("@/lib/soc-check-requests");
const { uploadSocSkillPackage } = await import("@/lib/soc-skill-package");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

type Row = Record<string, unknown>;
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/soc/${name}`, import.meta.url)));
const SOC_DEMO = fixture("SOC_Demo.docx");
const SONNET_RUN = JSON.parse(new TextDecoder().decode(fixture("results_sonnet.json"))) as { results: Row[] } & Row;
const SOC_CHECK = buildDocx("<w:p><w:r><w:t>ผลการตรวจสอบ SOC</w:t></w:r></w:p>");
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");
const SKILL = buildZip({ "tor-word-compliance-check/SKILL.md": "---\nname: tor-word-compliance-check\n---\n\n# skill\n" }, { deflate: true });

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"];
const SHEET_A: SheetSpec = { name: "ระบบ A", rows: [HEADER, ["1", "ระบบ A", null, null], ["1.1", "กล้อง 4K", "CASRI 8K", "Brochure หน้า 3"]] };
const SHEET_B: SheetSpec = { name: "ระบบ B", rows: [["ภาคผนวก"], HEADER, ["2", "ระบบ B", null, null], ["2.1", "เรดาร์", "X-band", "Brochure หน้า 5"]] };

// A valid full-mode run: rows of the real Sonnet run, renumbered for the workbook.
function run(rows: [number, string][]) {
  const content = SONNET_RUN.results.find((r) => r.row_type === "content_row") ?? SONNET_RUN.results[1];
  return { ...SONNET_RUN, results: rows.map(([row, item]): Row => ({ ...content, row, item })) };
}

function user(username: string) {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role: "USER", appAccess: ["soc"] } });
}

async function excelJob(sheets: SheetSpec[] = [SHEET_A, SHEET_B]) {
  const owner = await user("owner");
  const jobId = await createImportedSocJob(owner, { title: "Apron", soc: { name: "Compliance Table.xlsx", bytes: await buildXlsx(sheets) }, evidence: [{ name: "Brochure.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  return { owner, jobId, item: (key: string) => items.find((m) => m.key === key)! };
}

async function wordJob() {
  const owner = await user("word-owner");
  const jobId = await createImportedSocJob(owner, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "Datasheet_Demo.pdf", bytes: PDF }] });
  const item = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId, key: "1" } });
  return { owner, jobId, item };
}

function postImport(jobId: string, itemId: string, results: unknown, socCheck?: Uint8Array<ArrayBuffer>) {
  const form = new FormData();
  form.set("results", new File([JSON.stringify(results)], "results.json", { type: "application/json" }));
  if (socCheck) form.set("socCheck", new File([socCheck], "SOC_Check.docx"));
  form.set("skillVersion", "v1");
  form.set("model", "claude-cli:sonnet");
  return importRoute(new Request(`http://localhost/api/soc/jobs/${jobId}/major-items/${itemId}/import`, { method: "POST", body: form }), { params: Promise.resolve({ id: jobId, itemId }) });
}

const MANUAL = { skillVersion: "v1", model: "claude-cli:sonnet", source: "manual" as const };

test("a run on an Excel SOC is imported with its results alone; no SOC_Check is asked for or kept", { skip }, async () => {
  const { owner, jobId, item } = await excelJob();
  signedIn = owner;
  const response = await postImport(jobId, item("1").id, run([[1, "1"], [2, "1.1"]]));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const { runId } = (await response.json()) as { runId: string };

  const stored = await prisma.socCheckRun.findUniqueOrThrow({ where: { id: runId } });
  assert.deepEqual([stored.documentId, stored.rowCount, stored.source], [null, 2, "manual"]);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "RUN_OUTPUT" } }), 0);
  assert.equal((await readdir(path.join(storageRoot, jobId))).length, 2); // the SOC and the evidence PDF
  assert.equal((await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item("1").id } })).state, "checked");
  // The TOR and proposal text come from the workbook.
  const rows = await prisma.socCheckResult.findMany({ where: { jobId }, orderBy: { rowNumber: "asc" } });
  assert.deepEqual(rows.map((r) => [r.rowNumber, r.item, r.socText, r.proposalText]), [[1, "1", "ระบบ A", ""], [2, "1.1", "กล้อง 4K", "CASRI 8K"]]);

  // A SOC_Check sent anyway (an older habit) doesn't fail the import and isn't stored.
  const again = await importLocalCheckRun(owner, { jobId, majorItemId: item("2").id, results: run([[3, "2"], [4, "2.1"]]), socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: MANUAL });
  assert.ok(again.ok, JSON.stringify(again));
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "RUN_OUTPUT" } }), 0);
});

test("a run on a Word SOC is still refused without its SOC_Check", { skip }, async () => {
  const { owner, jobId, item } = await wordJob();
  signedIn = owner;
  const results = { ...SONNET_RUN, results: SONNET_RUN.results.filter((r) => /^[๑1](?:\.|$)/.test(String(r.item))) };
  const response = await postImport(jobId, item.id, results);
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /SOC_Check/);
  const imported = await importLocalCheckRun(owner, { jobId, majorItemId: item.id, results, run: MANUAL });
  assert.ok(!imported.ok);
  assert.match(imported.errors.join(" "), /SOC_Check ต้องเป็น Word/);
  assert.equal(await prisma.socCheckRun.count({ where: { jobId } }), 0);
  assert.equal((await postImport(jobId, item.id, results, SOC_CHECK)).status, 201);
});

test("the review page and the results Excel show the workbook's rows, with the sheet when the SOC has more than one", { skip }, async () => {
  const { owner, jobId, item } = await excelJob();
  for (const [key, rows] of [["1", [[1, "1"], [2, "1.1"]]], ["2", [[3, "2"], [4, "2.1"]]]] as [string, [number, string][]][]) {
    const imported = await importLocalCheckRun(owner, { jobId, majorItemId: item(key).id, results: run(rows), run: MANUAL });
    assert.ok(imported.ok, JSON.stringify(imported));
  }
  const view = (await socReviewView(jobId)).rows.sort((a, b) => a.rowNumber - b.rowNumber);
  assert.deepEqual(view.map((r) => [r.rowNumber, r.item, r.sheet, r.torText, r.proposalText]), [
    [1, "1", "ระบบ A", "ระบบ A", ""], [2, "1.1", "ระบบ A", "กล้อง 4K", "CASRI 8K"],
    [3, "2", "ระบบ B", "ระบบ B", ""], [4, "2.1", "ระบบ B", "เรดาร์", "X-band"],
  ]);

  signedIn = owner;
  const response = await excelRoute(new Request(`http://localhost/api/soc/jobs/${jobId}/results-excel`), { params: Promise.resolve({ id: jobId }) });
  assert.equal(response.status, 200, await response.clone().text());
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  const cells = (name: string) => book.getWorksheet(name)!.getSheetValues().slice(2).map((row) => (row as unknown[]).slice(1, 4).map(String));
  assert.deepEqual(cells("ข้อ 2"), [["ระบบ B · 3", "2", "ระบบ B"], ["ระบบ B · 4", "2.1", "เรดาร์"]]);
});

test("an Excel SOC with one sheet shows no sheet name", { skip }, async () => {
  const { owner, jobId, item } = await excelJob([SHEET_A]);
  const imported = await importLocalCheckRun(owner, { jobId, majorItemId: item("1").id, results: run([[1, "1"], [2, "1.1"]]), run: MANUAL });
  assert.ok(imported.ok, JSON.stringify(imported));
  assert.deepEqual((await socReviewView(jobId)).rows.map((r) => r.sheet), [null, null]);
});

// ---- The runner API ---------------------------------------------------------------

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
type Claimed = { id: string; needsRunner: string | null; socCheck: boolean; rows: { row: number; item: string }[]; documents: { type: string; name: string }[] };

async function linkRunner(owner: Actor) {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex") } });
  return token;
}

function heartbeat(token: string, runnerVersion: string) {
  return heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", { method: "POST", headers: { ...auth(token), "content-type": "application/json" }, body: JSON.stringify({ runnerVersion, claudeLogin: "logged_in" }) }));
}

async function claim(token: string) {
  const response = await claimRoute(new Request("http://localhost/api/soc-runner/claim", { method: "POST", headers: auth(token) }));
  assert.equal(response.status, 200, await response.clone().text());
  return ((await response.json()) as { request: Claimed | null }).request;
}

function submit(token: string, requestId: string, results: unknown) {
  const form = new FormData();
  form.set("results", new File([JSON.stringify(results)], "results.json", { type: "application/json" }));
  form.set("model", "claude-cli:sonnet");
  return submitRoute(new Request(`http://localhost/api/soc-runner/requests/${requestId}/submit`, { method: "POST", headers: auth(token), body: form }), { params: Promise.resolve({ id: requestId }) });
}

async function uploadSkill() {
  const requester = signedIn;
  signedIn = await prisma.user.create({ data: { username: "admin", displayName: "admin", passwordHash: "x", role: "ADMIN", appAccess: ["soc"] } });
  const uploaded = await uploadSocSkillPackage({ name: "tor-word-compliance-check.skill", bytes: SKILL, version: "v1" });
  assert.ok(uploaded.ok, JSON.stringify(uploaded));
  signedIn = requester;
}

test("a runner too old for an Excel SOC is handed nothing and the job page says to install it again; a new one checks it and submits results alone", { skip }, async () => {
  const { owner, jobId, item } = await excelJob();
  signedIn = owner;
  await uploadSkill();
  const token = await linkRunner(owner);
  assert.deepEqual(await requestSocCheck(jobId, item("1").id), { ok: true, requested: 1 });

  for (const old of [null, "0.4.2"]) { // a runner that hasn't reported yet, then the one before Excel SOCs
    if (old) assert.equal((await heartbeat(token, old)).status, 200);
    assert.equal(await claim(token), null);
    assert.equal((await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item("1").id } })).state, "requested");
  }
  const waiting = (await majorItemRequestViews(jobId)).get(item("1").id)!.request!;
  assert.equal(waiting.runnerTooOld, "excel_soc");
  const text = majorItemStateText({ state: "requested", request: waiting }, owner.id);
  assert.equal(text.label, "รอติดตั้ง SOC Runner รุ่นใหม่");
  assert.match(text.detail ?? "", new RegExp(`ต้องเป็นรุ่น ${SOC_RUNNER_FOR_EXCEL_SOC.replaceAll(".", "\\.")} ขึ้นไป.*ติดตั้งใหม่`));

  // Installed again: the same request is picked up on its own.
  assert.equal((await heartbeat(token, SOC_RUNNER_FOR_EXCEL_SOC)).status, 200);
  const request = await claim(token);
  assert.ok(request);
  assert.deepEqual([request.needsRunner, request.socCheck], [SOC_RUNNER_FOR_EXCEL_SOC, false]);
  assert.deepEqual(request.documents.map((d) => [d.type, d.name]), [["SOC", "Compliance Table.xlsx"], ["EVIDENCE", "Brochure.pdf"]]);
  assert.equal((await majorItemRequestViews(jobId)).get(item("1").id)!.request!.runnerTooOld, undefined);

  const response = await submit(token, request.id, run([[1, "1"], [2, "1.1"]]));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const done = await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(done.state, "done");
  const stored = await prisma.socCheckRun.findUniqueOrThrow({ where: { id: done.runId! } });
  assert.deepEqual([stored.source, stored.documentId, stored.rowCount], ["runner", null, 2]);
});

test("a PDF SOC upload becomes an Excel SOC job: the major items of that table, the runner gets the .xlsx, and the PDF and each row's page are kept", { skip }, async () => {
  const owner = await user("pdf-owner");
  signedIn = owner;
  const pdf = buildTablePdf([
    { columns: [50, 200, 150, 150], rows: [HEADER, SHEET_A.rows[1].map((cell) => String(cell ?? ""))] },
    { columns: [50, 200, 150, 150], rows: [HEADER, SHEET_A.rows[2].map((cell) => String(cell ?? ""))] },
  ]);
  // Known by its content, whatever it is called.
  assert.deepEqual(await validateUpload(new File([pdf], "Compliance Table.pdf"), "SOC"), pdf);
  assert.deepEqual(await validateUpload(new File([pdf], "Compliance Table.docx"), "SOC"), pdf);
  const jobId = await createImportedSocJob(owner, { title: "Surat", soc: { name: "Compliance Table.pdf", bytes: pdf }, evidence: [{ name: "Brochure.pdf", bytes: PDF }] });
  const { jobId: excelJobId } = await excelJob([SHEET_A]);
  const majorItems = (id: string) => prisma.socMajorItem.findMany({ where: { jobId: id }, orderBy: { position: "asc" }, omit: { id: true, jobId: true, createdAt: true, updatedAt: true } });
  assert.deepEqual(await majorItems(jobId), await majorItems(excelJobId));

  const job = await prisma.socJob.findUniqueOrThrow({ where: { id: jobId }, include: { documents: { orderBy: { type: "asc" } } } });
  assert.deepEqual(job.socRowPages, [1, 2]);
  assert.deepEqual(job.documents.map((d) => [d.type, d.originalName, d.mimeType]), [
    ["EVIDENCE", "Brochure.pdf", "application/pdf"],
    ["SOC", "Compliance Table.xlsx", XLSX_MIME],
    ["SOC_SOURCE_PDF", "Compliance Table.pdf", "application/pdf"],
  ]);

  await uploadSkill();
  const token = await linkRunner(owner);
  assert.equal((await heartbeat(token, SOC_RUNNER_FOR_EXCEL_SOC)).status, 200);
  const item = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId, key: "1" } });
  assert.deepEqual(await requestSocCheck(jobId, item.id), { ok: true, requested: 1 });
  const request = await claim(token);
  assert.ok(request);
  assert.equal(request.socCheck, false);
  assert.deepEqual(request.documents.map((d) => [d.type, d.name]), [["SOC", "Compliance Table.xlsx"], ["EVIDENCE", "Brochure.pdf"]]);
});

test("an old runner still takes a Word SOC's request, which names no runner version, and its submit still needs the SOC_Check", { skip }, async () => {
  const { owner, jobId, item } = await wordJob();
  signedIn = owner;
  await uploadSkill();
  const token = await linkRunner(owner);
  assert.equal((await heartbeat(token, "0.4.2")).status, 200);
  assert.deepEqual(await requestSocCheck(jobId, item.id), { ok: true, requested: 1 });
  const request = await claim(token);
  assert.ok(request);
  assert.deepEqual([request.needsRunner, request.socCheck], [null, true]);
  assert.equal((await majorItemRequestViews(jobId)).get(item.id)!.request!.runnerTooOld, undefined);

  const results = { ...SONNET_RUN, results: SONNET_RUN.results.filter((r) => /^[๑1](?:\.|$)/.test(String(r.item))) };
  const response = await submit(token, request.id, results);
  assert.equal(response.status, 422);
  assert.match(((await response.json()) as { errors: string[] }).errors.join(" "), /SOC_Check ต้องเป็น Word/);
  const failed = await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(failed.state, "failed");
});

test("on an Excel SOC a picked row is re-checked alone, a รอแก้ไข row is replaced without asking, and an item can be set to ไม่ต้องตรวจ", { skip }, async () => {
  const { owner, jobId, item } = await excelJob();
  signedIn = owner;
  await uploadSkill();
  const token = await linkRunner(owner);
  assert.equal((await heartbeat(token, SOC_RUNNER_FOR_EXCEL_SOC)).status, 200);
  const first = await importLocalCheckRun(owner, { jobId, majorItemId: item("1").id, results: run([[1, "1"], [2, "1.1"]]), run: MANUAL });
  assert.ok(first.ok, JSON.stringify(first));
  const picked = await prisma.socCheckResult.findFirstOrThrow({ where: { jobId, rowNumber: 2 } });
  await prisma.socCheckResult.update({ where: { id: picked.id }, data: { finalDecision: "pending_fix", reviewedAt: new Date(), reviewedById: owner.id } });

  assert.deepEqual(await requestSocRowRechecks(jobId, [picked.id]), { ok: true, requested: 1 });
  const request = await claim(token);
  assert.ok(request);
  assert.deepEqual(request.rows, [{ row: 2, item: "1.1" }]);
  const recheck = run([[2, "1.1"]]);
  recheck.results[0] = { ...recheck.results[0], key_issue: "ตรวจใหม่แล้ว" };
  assert.equal((await submit(token, request.id, recheck)).status, 201);
  const rows = await prisma.socCheckResult.findMany({ where: { jobId }, orderBy: { rowNumber: "asc" } });
  assert.deepEqual(rows.map((r) => [r.rowNumber, r.runId === first.runId, r.keyIssue === "ตรวจใหม่แล้ว", r.finalDecision]), [[1, true, false, null], [2, false, true, null]]);

  assert.deepEqual(await setSocMajorItemSkipped(jobId, item("2").id, true), { ok: true });
  assert.match(JSON.stringify(await requestSocCheck(jobId, item("2").id)), /ไม่ต้องตรวจ/);
});
