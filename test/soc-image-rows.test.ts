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
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx, buildSocDocx, PNG } from "@/test/docx-fixture";

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
function run(rows: [number, string][]) {
  const content = SONNET_RUN.results.find((r) => r.row_type === "content_row") ?? SONNET_RUN.results[1];
  return { ...SONNET_RUN, results: rows.map(([row, item]): Row => ({ ...content, row, item })) };
}

function user(username: string, appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role: "USER", appAccess } });
}

async function checkedJob(ownerName = "owner") {
  const owner = await user(ownerName);
  const jobId = await createImportedSocJob(owner, { title: "MEA", soc: { name: "SOC.docx", bytes: SOC }, evidence: [{ name: "Datasheet.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  const imported = await importLocalCheckRun(owner, {
    jobId, majorItemId: items[0].id, results: run([[3, "๑.๑"], [4, "๑.๑"], [5, "๑.๒"], [6, "๑.๒"]]),
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
  assert.deepEqual(cells, [["3", "๑.๑", "ขนาดท่อตามตาราง"], ["4", "๑.๑", "[รูป]"], ["5", "๑.๒", "ข้อต่อ"], ["6", "๑.๒", "[รูป]"]]);
});
