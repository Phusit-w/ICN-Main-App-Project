// Downloading an Imported SOC Check's results as Excel (2026-10-08, replaces
// the combined SOC_Check Word file of ticket 10), driven through the download
// route with the signed-in user stubbed. One major item → one sheet; the whole
// job → a summary sheet plus one sheet per checked major item.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx } from "@/test/docx-fixture";
import { majorItemKey } from "@/lib/soc-major-items";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { GET: downloadRoute } = await import("@/app/api/soc/jobs/[id]/results-excel/route");
const { createImportedSocJob } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

type Row = Record<string, unknown>;
type RunFile = { results: Row[] } & Record<string, unknown>;

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/soc/${name}`, import.meta.url)));
const SOC_DEMO = fixture("SOC_Demo.docx");
const SONNET_RUN = JSON.parse(new TextDecoder().decode(fixture("results_sonnet.json"))) as RunFile;
const SOC_CHECK = buildDocx("<w:p><w:r><w:t>ผลการตรวจสอบ SOC</w:t></w:r></w:p>");
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// One major item's rows of the real run, each tagged with `marker` as its key_issue.
function runFor(key: string, marker: string): RunFile {
  const copy = structuredClone(SONNET_RUN);
  copy.results = copy.results.filter((row) => majorItemKey(String(row.item)) === key).map((row) => ({ ...row, key_issue: `${marker} ${row.row}` }));
  return copy;
}
const headingRow = (row: Row) => String(row.row_type ?? "").endsWith("heading_row");

function user(username: string, appAccess: string[] = ["soc"], role = "USER") {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess } });
}

async function setup(ownerName = "owner") {
  const owner = await user(ownerName);
  const jobId = await createImportedSocJob(owner, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "Datasheet_Demo.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  const byKey = (key: string) => items.find((m) => m.key === key)!;
  return { owner, jobId, items, byKey };
}

async function importRun(actor: Actor, jobId: string, majorItemId: string, results: RunFile) {
  const imported = await importLocalCheckRun(actor, {
    jobId, majorItemId, results,
    socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK },
    run: { skillVersion: "sha256:66938c26cb0ed5ae", model: "claude-cli:sonnet", source: "manual" },
  });
  assert.ok(imported.ok, JSON.stringify(imported));
}

function download(jobId: string, item?: string) {
  const url = `http://localhost/api/soc/jobs/${jobId}/results-excel${item ? `?item=${item}` : ""}`;
  return downloadRoute(new Request(url), { params: Promise.resolve({ id: jobId }) });
}

async function workbook(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("content-type"), XLSX);
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename\*=UTF-8''SOC_Check-.*\.xlsx$/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  return book;
}

// A sheet's rows below the header, as the text of every cell.
function bodyText(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow((row, n) => { if (n > 1) rows.push((row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)))); });
  return rows;
}
const header = (sheet: ExcelJS.Worksheet) => (sheet.getRow(1).values as unknown[]).slice(1).map(String);

test("the whole job: a summary sheet, then one sheet per checked major item with its latest rows", { skip }, async () => {
  const { owner, jobId, items, byKey } = await setup();
  assert.equal(items.length, 4);
  await importRun(owner, jobId, byKey("1").id, runFor("1", "FIRST-RUN"));
  await importRun(owner, jobId, byKey("2").id, runFor("2", "ITEM-TWO"));
  await importRun(owner, jobId, byKey("1").id, runFor("1", "RECHECKED")); // supersedes FIRST-RUN

  // A Final Decision and note from the review page appear in the sheet.
  const decided = await prisma.socCheckResult.findFirstOrThrow({ where: { jobId, majorItemId: byKey("2").id, NOT: { rowType: { endsWith: "heading_row" } } }, orderBy: { rowNumber: "asc" } });
  await prisma.socCheckResult.update({ where: { id: decided.id }, data: { finalDecision: "better", finalNote: "NOTE-FROM-REVIEWER", reviewedAt: new Date(), reviewedById: owner.id } });

  signedIn = await user("colleague"); // any soc user may download
  const book = await workbook(await download(jobId));
  assert.deepEqual(book.worksheets.map((s) => s.name), ["สรุป", "ข้อ ๑", "ข้อ ๒"]);

  const one = book.getWorksheet("ข้อ ๑")!;
  assert.deepEqual(header(one), ["แถวใน SOC", "ข้อ", "ข้อกำหนด TOR", "หน้าอ้างอิง", "ผลอ้างอิง", "เลขข้อกำกับ", "Highlight", "หลักฐานรองรับ", "ผล TOR (แนะนำ)", "ความเชื่อมั่น", "ประเด็นหลัก", "Final Decision", "หมายเหตุผู้ตรวจ"]);
  const expectedOne = runFor("1", "RECHECKED").results.filter((row) => !headingRow(row));
  const rowsOne = bodyText(one);
  assert.equal(rowsOne.length, expectedOne.length, "every row but headings");
  assert.deepEqual(rowsOne.map((r) => Number(r[0])), expectedOne.map((row) => Number(row.row)), "in SOC order");
  assert.ok(rowsOne.every((r) => r[10].startsWith("RECHECKED ")), "only the latest run");
  const view = one.views[0] as { state?: string; xSplit?: number; ySplit?: number };
  assert.deepEqual([view.state, view.xSplit, view.ySplit], ["frozen", 2, 1], "header row and the first two columns stay in view");

  const rowsTwo = bodyText(book.getWorksheet("ข้อ ๒")!);
  const decidedRow = rowsTwo.find((r) => Number(r[0]) === decided.rowNumber)!;
  assert.equal(decidedRow[11], "ดีกว่า (Better)");
  assert.equal(decidedRow[12], "NOTE-FROM-REVIEWER");

  const summary = bodyText(book.getWorksheet("สรุป")!).map((r) => r.join("|")).join("\n");
  assert.match(summary, /ข้อ ๓/);
  assert.match(summary, /ข้อ ๔/);
  assert.match(summary, /ยังไม่ได้ตรวจ/);

  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "SOC_RESULTS_DOWNLOADED" } });
  assert.equal(event.actorId, signedIn.id);
  assert.deepEqual((event.detail as { checked: string[]; unchecked: string[] }).unchecked, ["๓", "๔"]);
  assert.equal(await prisma.auditLog.count({ where: { entityId: jobId, action: "SOC_RESULTS_DOWNLOADED", actorId: signedIn.id } }), 1);
});

test("a partial_visible highlight shows its Thai label and leaves ผลอ้างอิง a green ตรง", { skip }, async () => {
  const { owner, jobId, byKey } = await setup();
  const run = runFor("1", "PV");
  const zoom = run.results.find((row) => row.item === "๑.๒.๓")!;
  zoom.highlight_check = "partial_visible";
  await importRun(owner, jobId, byKey("1").id, run);
  signedIn = owner;
  const sheet = (await workbook(await download(jobId, byKey("1").id))).worksheets[0];
  const n = bodyText(sheet).findIndex((r) => r[1] === "๑.๒.๓");
  const row = sheet.getRow(n + 2);
  assert.equal(row.getCell(7).value, "ครบตามที่เห็นในหน้า (บางคำไม่ได้ highlight)");
  assert.equal(row.getCell(5).value, "ตรง");
  assert.equal((row.getCell(5).fill as ExcelJS.FillPattern).fgColor?.argb, "FFC6EFCE");
});

test("one major item: a single sheet, no summary", { skip }, async () => {
  const { owner, jobId, byKey } = await setup();
  await importRun(owner, jobId, byKey("1").id, runFor("1", "ONE"));
  await importRun(owner, jobId, byKey("2").id, runFor("2", "TWO"));
  signedIn = owner;
  const book = await workbook(await download(jobId, byKey("2").id));
  assert.deepEqual(book.worksheets.map((s) => s.name), ["ข้อ ๒"]);
  assert.ok(bodyText(book.worksheets[0]).every((r) => r[10].startsWith("TWO ")));
});

test("a major item with no results, or of another job, is refused", { skip }, async () => {
  const { owner, jobId, byKey } = await setup();
  await importRun(owner, jobId, byKey("1").id, runFor("1", "ONE"));
  signedIn = owner;
  const unchecked = await download(jobId, byKey("3").id);
  assert.equal(unchecked.status, 409);
  assert.match(((await unchecked.json()) as { error: string }).error, /ยังไม่มีผลตรวจ/);
  const other = await setup("other-owner");
  assert.equal((await download(jobId, other.byKey("1").id)).status, 404);
});

test("a user without soc access can't download, and nothing is audited", { skip }, async () => {
  const { owner, jobId, byKey } = await setup();
  await importRun(owner, jobId, byKey("1").id, runFor("1", "X"));
  signedIn = await user("expense-only", ["expense"]);
  assert.equal((await download(jobId)).status, 403);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "SOC_RESULTS_DOWNLOADED" } }), 0);
  signedIn = null;
  assert.equal((await download(jobId)).status, 401);
});

test("before any major item is checked the download is refused with a Thai reason", { skip }, async () => {
  const { owner, jobId } = await setup();
  signedIn = owner;
  const response = await download(jobId);
  assert.equal(response.status, 409);
  assert.match(((await response.json()) as { error: string }).error, /ยังไม่มีข้อใหญ่ที่ตรวจแล้ว/);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "SOC_RESULTS_DOWNLOADED" } }), 0);
});
