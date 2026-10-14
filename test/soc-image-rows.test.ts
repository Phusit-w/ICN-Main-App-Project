// Image Rows on the web (soc-image-rows ticket 06): a Word SOC row whose TOR
// cell is an image counts as a row of its major item, the review page gets
// the image from the stored SOC file through an authorised route, and the
// results Excel writes [รูป] for it. Driven through the upload, the import,
// the image route, the review view and the Excel route, with the signed-in
// user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx, buildSocDocx, buildZip, PNG } from "@/test/docx-fixture";
import { newSocRunnerToken } from "@/lib/soc-runner-token";
import { majorItemStateText, SOC_RUNNER_FOR_EXCEL_SOC, SOC_RUNNER_FOR_IMAGE_ROWS } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { GET: imageRoute } = await import("@/app/api/soc/jobs/[id]/soc-rows/[row]/image/route");
const { GET: excelRoute } = await import("@/app/api/soc/jobs/[id]/results-excel/route");
const { createImportedSocJob } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");
const { socReviewView } = await import("@/lib/soc-review-view");
const { decideSocRow } = await import("@/actions/soc");
const { requestSocCheck, requestSocRowRechecks } = await import("@/actions/socCheckRequests");
const { majorItemRequestViews } = await import("@/lib/soc-check-requests");
const { uploadSocSkillPackage } = await import("@/lib/soc-skill-package");
const { POST: claimRoute } = await import("@/app/api/soc-runner/claim/route");
const { POST: submitRoute } = await import("@/app/api/soc-runner/requests/[id]/submit/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");
const SKILL = buildZip({ "tor-word-compliance-check/SKILL.md": "---\nname: tor-word-compliance-check\n---\n\n# skill\n" }, { deflate: true });

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

type Row = Record<string, unknown>;
const SONNET_RUN = JSON.parse(readFileSync(new URL("./fixtures/soc/results_sonnet.json", import.meta.url), "utf8")) as { results: Row[] } & Row;
const SOC_CHECK = buildDocx("<w:p><w:r><w:t>ผลการตรวจสอบ SOC</w:t></w:r></w:p>");
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");

// Row 4 is an Image Row under ๑.๑; row 6, under ๑.๒, is one a browser can't show.
const SOC = buildSocDocx([
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"],
  ["๑.", "ท่อร้อยสาย", "", ""],
  ["๑.๑", "ขนาดท่อตามตาราง", "HDPE", "Datasheet หน้า 3"],
  ["", { image: PNG }, "ตามตาราง", ""],
  ["๑.๒", "ข้อต่อ", "ตามรูป", "Datasheet หน้า 4"],
  ["", { image: PNG, name: "image2.emf" }, "", ""],
  ["๒.๑", "เรดาร์", "X", "Datasheet หน้า 6"],
]);

// A valid full-mode run: rows of the real Sonnet run, renumbered for this SOC.
// The skill gives an unnumbered row the item number of the row above it.
// `extra`: fields per row number, e.g. an Image Row's kind and reading.
function run(rows: [number, string][], extra: Record<number, Row> = IMAGE_FIELDS) {
  const content = SONNET_RUN.results.find((r) => r.row_type === "content_row") ?? SONNET_RUN.results[1];
  return { ...SONNET_RUN, results: rows.map(([row, item]): Row => ({ ...content, row, item, ...extra[row] })) };
}

// What the skill writes for an Image Row (ticket 07): a mixed image is
// checked like any row; a picture carries no verdict field at all (the shape
// of MEA Y69 row 92 in fixtures/07-image-run).
const MIXED: Row = { image_kind: "mixed_image", image_reading: "ขนาดท่อ: 110 มม.\nความหนา: [?] มม.", image_unsure: "ความหนาอ่านไม่ออก", image_note: "ตรวจเฉพาะค่าที่พิมพ์ในรูป ไม่ได้เทียบรูปวาดกับหลักฐาน", reference_note: "ใช้อ้างอิงของข้อ ๑.๑" };
const PICTURE: Row = { image_kind: "picture", image_reading: "รูปข้อต่อ", image_unsure: "" };
const IMAGE_FIELDS: Record<number, Row> = { 4: MIXED, 6: PICTURE };
// The picture row exactly as the skill gives it: no verdict fields.
const pictureRow = (row: number, item: string): Row => ({ row, item, reference: "", ...PICTURE });

function user(username: string, appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role: "USER", appAccess } });
}

async function checkedJob(ownerName = "owner") {
  const owner = await user(ownerName);
  const jobId = await createImportedSocJob(owner, { title: "MEA", soc: { name: "SOC.docx", bytes: SOC }, evidence: [{ name: "Datasheet.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  const results = run([[3, "๑.๑"], [4, "๑.๑"], [5, "๑.๒"]]);
  results.results.push(pictureRow(6, "๑.๒"));
  const imported = await importLocalCheckRun(owner, {
    jobId, majorItemId: items[0].id, results,
    socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK },
    run: { skillVersion: "v1", model: "claude-cli:sonnet", source: "manual" },
  });
  assert.ok(imported.ok, JSON.stringify(imported));
  return { owner, jobId, items };
}

function getImage(jobId: string, row: string, item = "๑.๑") {
  return imageRoute(new Request(`http://test/api/soc/jobs/${jobId}/soc-rows/${row}/image?item=${encodeURIComponent(item)}`), { params: Promise.resolve({ id: jobId, row }) });
}

test("an uploaded Word SOC counts its Image Rows as rows of the major item they sit under", { skip }, async () => {
  const { items } = await checkedJob();
  assert.deepEqual(items.map((m) => [m.label, m.rowCount]), [["๑", 5], ["๒", 1]]);
});

test("the review page gets an Image Row marked as an image, and its image from the stored SOC", { skip }, async () => {
  const { owner, jobId } = await checkedJob();
  const view = (await socReviewView(jobId)).rows.sort((a, b) => a.rowNumber - b.rowNumber);
  assert.deepEqual(view.map((r) => [r.rowNumber, r.item, r.torText, r.torImage, r.proposalText]), [
    [3, "๑.๑", "ขนาดท่อตามตาราง", false, "HDPE"], [4, "๑.๑", "", true, "ตามตาราง"],
    [5, "๑.๒", "ข้อต่อ", false, "ตามรูป"], [6, "๑.๒", "", true, ""],
  ]);

  signedIn = owner;
  const response = await getImage(jobId, "4");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control") ?? "", /private/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
});

test("a row that isn't an Image Row, or an image a browser can't show, answers with a Thai message", { skip }, async () => {
  const { owner, jobId } = await checkedJob();
  signedIn = owner;
  for (const row of ["3", "99", "0", "abc"]) {
    const response = await getImage(jobId, row);
    assert.equal(response.status, 404, `row ${row}`);
    assert.match((await response.json()).error, /ไม่พบรูป/);
  }
  const emf = await getImage(jobId, "6", "๑.๒");
  assert.equal(emf.status, 415);
  assert.match((await emf.json()).error, /image2\.emf.*เปิดไฟล์ SOC/);
});

test("only users with soc access get an Image Row's image, and only through its own job", { skip }, async () => {
  const { jobId } = await checkedJob();
  const other = await checkedJob("other-owner");
  await prisma.socJob.update({ where: { id: other.jobId }, data: { deletedAt: new Date() } });

  signedIn = null;
  assert.equal((await getImage(jobId, "4")).status, 401);
  signedIn = await user("no-soc", ["project-card"]);
  assert.equal((await getImage(jobId, "4")).status, 403);

  // Any soc user may open an Imported SOC Check, not only its owner.
  signedIn = await user("teammate");
  assert.equal((await getImage(jobId, "4")).status, 200);
  assert.equal((await getImage(other.jobId, "4")).status, 404, "a job in the trash");
  assert.equal((await getImage("no-such-job", "4")).status, 404);
  // A job that isn't an Imported SOC Check is its owner's alone.
  const legacy = await checkedJob("legacy-owner");
  await prisma.socJob.update({ where: { id: legacy.jobId }, data: { kind: "CHECK" } });
  assert.equal((await getImage(legacy.jobId, "4")).status, 404, "another user's own job");
  signedIn = legacy.owner;
  assert.equal((await getImage(legacy.jobId, "4")).status, 200);
});

test("the results Excel writes [รูป] in the TOR column of an Image Row", { skip }, async () => {
  const { owner, jobId } = await checkedJob();
  signedIn = owner;
  const response = await excelRoute(new Request(`http://localhost/api/soc/jobs/${jobId}/results-excel`), { params: Promise.resolve({ id: jobId }) });
  assert.equal(response.status, 200, await response.clone().text());
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  const cells = book.getWorksheet("ข้อ ๑")!.getSheetValues().slice(2).map((row) => (row as unknown[]).slice(1, 4).map(String));
  assert.deepEqual(cells, [
    ["3", "๑.๑", "ขนาดท่อตามตาราง"], ["4", "๑.๑", "[รูป]\nขนาดท่อ: 110 มม.\nความหนา: [?] มม."],
    ["5", "๑.๒", "ข้อต่อ"], ["6", "๑.๒", "[รูป]\nรูปข้อต่อ"],
  ]);
});

// ---- Ticket 08: Image Rows end to end -------------------------------------------

const MANUAL = { skillVersion: "v1", model: "claude-cli:sonnet", source: "manual" as const };

async function uncheckedJob(ownerName = "owner") {
  const owner = await user(ownerName);
  const jobId = await createImportedSocJob(owner, { title: "MEA", soc: { name: "SOC.docx", bytes: SOC }, evidence: [{ name: "Datasheet.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  return { owner, jobId, items };
}

function importInto(owner: Actor, jobId: string, majorItemId: string, results: unknown) {
  return importLocalCheckRun(owner, { jobId, majorItemId, results, socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: MANUAL });
}

test("each major item knows how many Image Rows it has", { skip }, async () => {
  const { items } = await uncheckedJob();
  assert.deepEqual(items.map((m) => [m.label, m.imageRowCount]), [["๑", 2], ["๒", 0]]);
});

test("the import keeps an Image Row's kind, reading, unsure note and borrowed reference; a picture comes with no verdict", { skip }, async () => {
  await checkedJob();
  const rows = await prisma.socCheckResult.findMany({ orderBy: { rowNumber: "asc" } });
  assert.deepEqual(rows.map((r) => [r.rowNumber, r.imageKind, r.imageReading, r.imageUnsure, r.referenceNote]), [
    [3, null, null, null, null],
    [4, "mixed_image", "ขนาดท่อ: 110 มม.\nความหนา: [?] มม.", "ความหนาอ่านไม่ออก", "ใช้อ้างอิงของข้อ ๑.๑"],
    [5, null, null, null, null],
    [6, "picture", "รูปข้อต่อ", null, null],
  ]);
  const picture = rows[3];
  assert.deepEqual([picture.aiReferenceCheck, picture.torDecision, picture.aiConfidence, picture.evidenceSupport], ["", null, "", null]);
});

test("the import refuses an Image Row without a kind, a kind it doesn't know, and a read image without its reading, naming the row", { skip }, async () => {
  const { owner, jobId, items } = await uncheckedJob();
  const rows: [number, string][] = [[3, "๑.๑"], [4, "๑.๑"], [5, "๑.๒"], [6, "๑.๒"]];
  const refused = async (extra: Record<number, Row>, pattern: RegExp) => {
    const result = await importInto(owner, jobId, items[0].id, run(rows, extra));
    assert.equal(result.ok, false, JSON.stringify(extra));
    assert.match((result as { errors: string[] }).errors.join("\n"), pattern);
  };
  await refused({ 6: PICTURE }, /แถว 4 .*แถวรูป.*image_kind/);
  await refused({ 4: { ...MIXED, image_kind: "photo" }, 6: PICTURE }, /แถว 4 .*image_kind.*text_image, mixed_image หรือ picture/);
  await refused({ 4: { ...MIXED, image_kind: "text_image", image_reading: "" }, 6: PICTURE }, /แถว 4 .*image_reading/);
  // A kind on a row whose TOR cell is text: the skill and the web disagree on the SOC.
  await refused({ 3: PICTURE, 4: MIXED, 6: PICTURE }, /แถว 3 .*ไม่ใช่แถวรูป/);
  // A picture still needs its row and item; nothing else.
  await refused({ 4: MIXED, 6: { ...PICTURE, item: "" } }, /ขาด item/);
  // A picture has no verdict, so a row the SOC doesn't have can't be one.
  const notInSoc = await importInto(owner, jobId, items[0].id, { ...run(rows), results: [...run(rows).results, pictureRow(99, "๑.๙")] });
  assert.match((notInSoc as { errors: string[] }).errors.join("\n"), /แถว 99 .*หาแถวนี้ในไฟล์ SOC ไม่เจอ/);
  assert.equal(await prisma.socCheckResult.count({ where: { jobId } }), 0);
});

test("a picture the run calls a heading row is still a row waiting for a Final Decision", { skip }, async () => {
  const { owner, jobId, items } = await uncheckedJob();
  const results = run([[3, "๑.๑"], [4, "๑.๑"], [5, "๑.๒"]]);
  results.results.push({ ...pictureRow(6, "๑.๒"), row_type: "heading_row" });
  assert.ok((await importInto(owner, jobId, items[0].id, results)).ok);
  const picture = (await socReviewView(jobId)).rows.find((r) => r.rowNumber === 6);
  assert.equal(picture?.status, "review");
});

test("the review page shows an Image Row's kind, reading and notes; a picture waits for the reviewer", { skip }, async () => {
  const { jobId } = await checkedJob();
  const view = (await socReviewView(jobId)).rows.sort((a, b) => a.rowNumber - b.rowNumber);
  const [text, mixed, , picture] = view;
  assert.equal(text.image, null);
  assert.deepEqual(mixed.image, {
    kind: "mixed_image", label: "อ่านจากรูป", reading: "ขนาดท่อ: 110 มม.\nความหนา: [?] มม.", unsure: "ความหนาอ่านไม่ออก",
    note: "ตรวจเฉพาะค่าที่พิมพ์ในรูป ไม่ได้เทียบรูปวาดกับหลักฐาน",
  });
  assert.equal(mixed.referenceNote, "ใช้อ้างอิงของข้อ ๑.๑");
  assert.deepEqual(picture.image, { kind: "picture", label: "รูปที่ต้องดูเอง", reading: "รูปข้อต่อ", unsure: null, note: null });
  // No verdict from Claude: never ✅, always waiting for the reviewer.
  assert.deepEqual([picture.status, picture.systemRecommendation, picture.reasons], ["review", null, ["รูปที่ต้องดูเอง: Claude ไม่ตัดสินแถวนี้"]]);
  assert.equal(picture.evidenceMissing, false);
});

test("a major item with an undecided Picture Row is not confirmed; it is once the row has a Final Decision", { skip }, async () => {
  const { owner, jobId, items } = await checkedJob();
  signedIn = owner;
  await prisma.socJob.update({ where: { id: jobId }, data: { status: "NEEDS_REVIEW" } });
  const rows = await prisma.socCheckResult.findMany({ where: { jobId }, orderBy: { rowNumber: "asc" } });
  for (const row of rows.filter((r) => r.imageKind !== "picture")) await decideSocRow({ jobId, resultId: row.id, decision: "compliant", note: "" });
  assert.deepEqual((await socReviewView(jobId)).confirmedItemIds, []);
  const picture = rows.find((r) => r.imageKind === "picture")!;
  await decideSocRow({ jobId, resultId: picture.id, decision: "pending_fix", note: "รอแบบจริง" });
  assert.deepEqual((await socReviewView(jobId)).confirmedItemIds, [], "รอแก้ไข does not settle it");
  await decideSocRow({ jobId, resultId: picture.id, decision: "compliant", note: "ดูรูปเทียบแบบแล้ว" });
  assert.deepEqual((await socReviewView(jobId)).confirmedItemIds, [items[0].id]);
});

// ---- The runner: re-check of a picked Image Row, and runners too old for Image Rows ----

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
type Claimed = { id: string; needsRunner: string | null; imageRows: number; rows: { row: number; item: string }[] };

async function linkRunner(owner: Actor, runnerVersion: string) {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex") } });
  await heartbeat(token, runnerVersion);
  return token;
}

async function heartbeat(token: string, runnerVersion: string) {
  const response = await heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", { method: "POST", headers: { ...auth(token), "content-type": "application/json" }, body: JSON.stringify({ runnerVersion, claudeLogin: "logged_in" }) }));
  assert.equal(response.status, 200);
}

async function claim(token: string) {
  const response = await claimRoute(new Request("http://localhost/api/soc-runner/claim", { method: "POST", headers: auth(token) }));
  assert.equal(response.status, 200, await response.clone().text());
  return ((await response.json()) as { request: Claimed | null }).request;
}

function submit(token: string, requestId: string, results: unknown) {
  const form = new FormData();
  form.set("results", new File([JSON.stringify(results)], "results.json", { type: "application/json" }));
  form.set("socCheck", new File([SOC_CHECK], "SOC_Check.docx"));
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

test("a runner too old for Image Rows is handed no major item that has them, and the job page says why; items without them still go to it", { skip }, async () => {
  const { owner, jobId, items } = await uncheckedJob();
  signedIn = owner;
  await uploadSkill();
  const token = await linkRunner(owner, SOC_RUNNER_FOR_EXCEL_SOC); // 0.5.0, the one before Image Rows
  assert.deepEqual(await requestSocCheck(jobId, items[0].id), { ok: true, requested: 1 });
  assert.equal(await claim(token), null);
  const waiting = (await majorItemRequestViews(jobId)).get(items[0].id)!.request!;
  assert.equal(waiting.runnerTooOld, "image_rows");
  const text = majorItemStateText({ state: "requested", request: waiting }, owner.id);
  assert.equal(text.label, "รอติดตั้ง SOC Runner รุ่นใหม่");
  assert.match(text.detail ?? "", new RegExp(`แถวรูป.*ต้องเป็นรุ่น ${SOC_RUNNER_FOR_IMAGE_ROWS.replaceAll(".", "\\.")} ขึ้นไป.*ติดตั้งใหม่`));

  // ข้อ ๒ has no Image Row: the old runner takes it, and is told no newer version is needed.
  assert.deepEqual(await requestSocCheck(jobId, items[1].id), { ok: true, requested: 1 });
  const plain = await claim(token);
  assert.deepEqual([plain?.needsRunner, plain?.imageRows], [null, 0]);
  await prisma.socCheckRequest.update({ where: { id: plain!.id }, data: { state: "cancelled" } });

  await heartbeat(token, SOC_RUNNER_FOR_IMAGE_ROWS);
  const request = await claim(token);
  assert.deepEqual([request?.needsRunner, request?.imageRows], [SOC_RUNNER_FOR_IMAGE_ROWS, 2]);
  assert.equal((await majorItemRequestViews(jobId)).get(items[0].id)!.request!.runnerTooOld, undefined);
});

test("a picked Image Row is re-checked alone through the runner", { skip }, async () => {
  const { owner, jobId } = await checkedJob();
  signedIn = owner;
  await uploadSkill();
  const token = await linkRunner(owner, SOC_RUNNER_FOR_IMAGE_ROWS);
  const picture = await prisma.socCheckResult.findFirstOrThrow({ where: { jobId, rowNumber: 6 } });
  assert.deepEqual(await requestSocRowRechecks(jobId, [picture.id]), { ok: true, requested: 1 });
  const request = await claim(token);
  assert.deepEqual(request?.rows, [{ row: 6, item: "๑.๒" }]);
  // Read again, the image is now a text image with a verdict.
  const recheck = run([[3, "๑.๑"], [4, "๑.๑"], [5, "๑.๒"], [6, "๑.๒"]], { 4: MIXED, 6: { image_kind: "text_image", image_reading: "ข้อต่อ: PVC", image_unsure: "" } });
  const response = await submit(token, request!.id, recheck);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const rows = await prisma.socCheckResult.findMany({ where: { jobId }, orderBy: { rowNumber: "asc" } });
  assert.deepEqual(rows.map((r) => [r.rowNumber, r.imageKind]), [[3, null], [4, "mixed_image"], [5, null], [6, "text_image"]]);
  assert.ok(rows[3].torDecision);
});
