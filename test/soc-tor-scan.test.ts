// A scanned TOR ต้นฉบับ (tor-match ticket 06) is read by the OCR in the
// background, whole page by whole page, in the same line as scanned PDF SOCs:
// "รอคิวที่ N", pages saved as read, cancel and resume reuse them, a replace
// stops the read and deletes them, and the compare runs when the read ends.
// The OCR is a fake.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import { buildXlsx } from "@/test/xlsx-fixture";
import type { CellReader } from "@/lib/soc-pdf-soc";

const skip = setupTestDatabase();

mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
let signedIn: Awaited<ReturnType<typeof prisma.user.create>> | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });

const { createImportedSocJob } = await import("@/lib/soc");
const { attachTorOriginal, cancelTorRead, resumeTorRead, resumeTorReads, startTorRead, stopTorRead, torMatchView } = await import("@/lib/soc-tor");
const { deleteTrashedSocJob } = await import("@/lib/soc-trash");
const { trashSocJob } = await import("@/actions/soc");
const { restoreSocJob } = await import("@/actions/admin");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-tor-scan-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
  delete process.env.TYPHOON_API_KEY;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const SOC_ROWS = [
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"],
  ["1", "ระบบกล้องวงจรปิด", null, null],
  ["1.1", "กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", "8 ล้านพิกเซล", "Brochure หน้า 3"],
  ["1.2", "กล้องต้องบันทึกภาพได้ไม่น้อยกว่า 7 วัน", "30 วัน", "Brochure หน้า 4"],
  ["2", "ระบบเครือข่าย", null, null],
  ["2.1", "สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต", "48 พอร์ต", "Brochure หน้า 5"],
];
// What the OCR reads on each page of the scanned TOR.
const TOR_TEXT = [
  "1. ระบบกล้องวงจรปิด\n1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล\n1.2 กล้องต้องบันทึกภาพได้ไม่น้อยกว่า 30 วัน",
  "2. ระบบเครือข่าย\n2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต",
];
const SCANNED: TablePage = { columns: [], rows: [], scanned: true };
const SCANNED_TOR = buildTablePdf([SCANNED, SCANNED]);
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");

// The fake answers each page with TOR_TEXT, and can be held back on a page
// (`holdOn`) or made to fail on one (`failOn`).
function fakeOcr({ failOn = 0, holdOn = 0 }: { failOn?: number; holdOn?: number } = {}) {
  const calls: number[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void;
  const reachedHold = new Promise<void>((resolve) => { reached = resolve; });
  const readPage: CellReader = async (_image, at) => {
    if (at.page === holdOn) { reached(); await held; }
    if (at.page === failOn) throw new Error("OCR down");
    calls.push(at.page);
    return TOR_TEXT[at.page - 1];
  };
  return { readPage, calls, release, reachedHold };
}

let users = 0;
async function job() {
  const owner = await prisma.user.create({ data: { username: `tor-scan-${++users}`, displayName: "ผู้ตรวจ", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  const jobId = await createImportedSocJob(owner, { title: `TOR สแกน ${users}`, soc: { name: "SOC.xlsx", bytes: await buildXlsx([{ name: "SOC", rows: SOC_ROWS }]) }, evidence: [{ name: "Brochure.pdf", bytes: PDF }] });
  const view = await prisma.socJob.findUniqueOrThrow({ where: { id: jobId } });
  return { owner, job: view };
}

type Job = Awaited<ReturnType<typeof job>>;
const attachScanned = ({ owner, job }: Job, readPage: CellReader, name = "TOR สแกน.pdf", bytes = SCANNED_TOR) =>
  attachTorOriginal(owner, job, { name, bytes }, { readPage, ocrConfirmed: true });
// The read the attach started (same key, so the same promise).
const readEnds = (jobId: string, readPage: CellReader) => startTorRead(jobId, readPage);
const savedPages = async (jobId: string) => {
  const match = await prisma.socTorMatch.findUniqueOrThrow({ where: { jobId } });
  const file = path.join(storageRoot, jobId, `tor-${match.documentId}.jsonl`);
  return existsSync(file) ? (await readFile(file, "utf8")).trim().split(/\r?\n/).map((line) => (JSON.parse(line) as { page: number }).page) : [];
};

test("a scanned TOR is read page by page in the background, then compared with the SOC", { skip }, async () => {
  const set = await job();
  const ocr = fakeOcr();
  const attached = await attachScanned(set, ocr.readPage);
  assert.equal(attached.state, "reading");
  assert.equal(attached.counts, null);
  await readEnds(set.job.id, ocr.readPage);

  assert.deepEqual(ocr.calls, [1, 2]);
  const view = await torMatchView(set.job.id);
  assert.equal(view?.state, "ready");
  assert.equal(view?.stage, null);
  assert.deepEqual(view?.counts, { "ตรง": 4, "ต่างแค่รูปแบบ": 0, "ความหมายต่าง": 1, "ไม่พบใน SOC": 0, "ไม่พบใน TOR": 0, "ยืนยันไม่ได้": 0 });
  assert.deepEqual(view?.lines.map((l) => [l.socRow, l.outcome, l.torPage]), [[1, "ตรง", 1], [2, "ตรง", 1], [3, "ความหมายต่าง", 1], [4, "ตรง", 2], [5, "ตรง", 2]]);
  const document = await prisma.socDocument.findFirstOrThrow({ where: { jobId: set.job.id, type: "TOR_ORIGINAL" } });
  assert.equal(document.pageCount, 2);
  // The pages read are kept with the result, so a re-compare never calls the OCR again.
  const stored = await prisma.socTorMatch.findUniqueOrThrow({ where: { jobId: set.job.id } });
  assert.deepEqual((stored.pages as { text: string }[]).map((p) => p.text), TOR_TEXT);
  assert.deepEqual(
    (await prisma.socAuditEvent.findMany({ where: { jobId: set.job.id, action: { startsWith: "TOR_" } }, orderBy: { createdAt: "asc" } })).map((e) => e.action),
    ["TOR_ATTACHED", "TOR_READ_COMPLETED"],
  );
});

test("a TOR read waits its turn behind other OCR reads and shows รอคิวที่ N; progress shows the pages read", { skip }, async () => {
  const [first, second] = [await job(), await job()];
  const held = fakeOcr({ holdOn: 2 });
  await attachScanned(first, held.readPage);
  await held.reachedHold;
  assert.equal((await torMatchView(first.job.id))?.stage, "กำลังอ่าน TOR ต้นฉบับ หน้า 1/2");

  const ocr = fakeOcr();
  await attachScanned(second, ocr.readPage);
  await new Promise((resolve) => setTimeout(resolve, 50)); // the waiting label is written in the background
  assert.equal((await torMatchView(second.job.id))?.stage, "รอคิวที่ 1");
  assert.deepEqual(ocr.calls, []);

  held.release();
  await readEnds(first.job.id, held.readPage);
  await readEnds(second.job.id, ocr.readPage);
  assert.equal((await torMatchView(second.job.id))?.state, "ready");
});

test("cancel stops the read and keeps the pages read; resume reads only the rest", { skip }, async () => {
  const set = await job();
  const held = fakeOcr({ holdOn: 2 });
  await attachScanned(set, held.readPage);
  await held.reachedHold;
  const cancelled = cancelTorRead(set.job.id);
  held.release(); // the call already sent is waited for
  assert.equal(await cancelled, true);
  const view = await torMatchView(set.job.id);
  assert.equal(view?.state, "failed");
  assert.match(view?.errorMessage ?? "", /ยกเลิก/);
  assert.equal(await prisma.socTorMatchLine.count({ where: { match: { jobId: set.job.id } } }), 0);
  assert.deepEqual(held.calls, [1, 2]);
  assert.deepEqual(await savedPages(set.job.id), [1, 2]); // the page that was in flight was saved too
  assert.equal(await cancelTorRead(set.job.id), false);

  const ocr = fakeOcr();
  assert.equal(await resumeTorRead(set.job.id, ocr.readPage), true);
  await readEnds(set.job.id, ocr.readPage);
  assert.deepEqual(ocr.calls, []); // nothing read twice
  assert.equal((await torMatchView(set.job.id))?.state, "ready");
});

test("a read that fails ends as failed with a reason; resume reads only the pages not saved", { skip }, async () => {
  const set = await job();
  const failing = fakeOcr({ failOn: 2 });
  await attachScanned(set, failing.readPage);
  await readEnds(set.job.id, failing.readPage);
  const view = await torMatchView(set.job.id);
  assert.equal(view?.state, "failed");
  assert.match(view?.errorMessage ?? "", /อ่าน TOR ต้นฉบับ.*อ่านต่อ/);
  assert.deepEqual(await savedPages(set.job.id), [1]);

  await assert.rejects(resumeTorRead(set.job.id, undefined), /TYPHOON_API_KEY/);
  const ocr = fakeOcr();
  assert.equal(await resumeTorRead(set.job.id, ocr.readPage), true);
  await readEnds(set.job.id, ocr.readPage);
  assert.deepEqual(ocr.calls, [2]);
  assert.equal((await torMatchView(set.job.id))?.state, "ready");
});

test("replacing a TOR being read stops its read and deletes its saved pages", { skip }, async () => {
  const set = await job();
  const held = fakeOcr({ holdOn: 2 });
  const { documentId: oldId } = await attachScanned(set, held.readPage, "TOR เก่า.pdf");
  await held.reachedHold;
  const oldPages = path.join(storageRoot, set.job.id, `tor-${oldId}.jsonl`);
  assert.ok(existsSync(oldPages));

  const ocr = fakeOcr();
  const replacing = attachScanned(set, ocr.readPage, "TOR ใหม่.pdf");
  await new Promise((resolve) => setTimeout(resolve, 50));
  held.release();
  const replaced = await replacing;
  await readEnds(set.job.id, ocr.readPage);
  assert.equal(existsSync(oldPages), false);
  assert.deepEqual(held.calls, [1, 2]); // the old read sent no page after the replace
  assert.deepEqual(ocr.calls, [1, 2]);
  const view = await torMatchView(set.job.id);
  assert.deepEqual([view?.documentId, view?.name, view?.state], [replaced.documentId, "TOR ใหม่.pdf", "ready"]);
  assert.equal(await prisma.socTorMatch.count({ where: { jobId: set.job.id } }), 1);
});

test("a restart picks up a TOR left being read; a job deleted for good stops its read and its pages go", { skip }, async () => {
  const set = await job();
  const held = fakeOcr({ holdOn: 2 });
  await attachScanned(set, held.readPage);
  await held.reachedHold;
  // As after a restart: the read is gone, the TOR Match still says reading.
  const stopping = stopTorRead(set.job.id);
  held.release();
  await stopping;
  assert.equal((await torMatchView(set.job.id))?.state, "reading");
  const ocr = fakeOcr();
  await resumeTorReads(ocr.readPage);
  await readEnds(set.job.id, ocr.readPage);
  assert.deepEqual(ocr.calls, []);
  assert.equal((await torMatchView(set.job.id))?.state, "ready");

  const other = await job();
  const holding = fakeOcr({ holdOn: 2 });
  await attachScanned(other, holding.readPage);
  await holding.reachedHold;
  await prisma.socJob.update({ where: { id: other.job.id }, data: { deletedAt: new Date() } });
  const purging = deleteTrashedSocJob(other.job.id, null);
  holding.release();
  assert.equal(await purging, true);
  assert.deepEqual(holding.calls, [1, 2]);
  assert.equal(existsSync(path.join(storageRoot, other.job.id)), false);
});

test("a TOR read stopped by moving the job to the trash goes on when an admin restores the job", { skip }, async () => {
  const set = await job();
  const held = fakeOcr({ holdOn: 2 });
  await attachScanned(set, held.readPage);
  await held.reachedHold;
  signedIn = set.owner;
  const trashing = trashSocJob(set.job.id);
  held.release();
  await trashing;
  assert.equal((await torMatchView(set.job.id))?.state, "reading");

  process.env.TYPHOON_API_KEY = "test-key";
  const ocr = fakeOcr();
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: TOR_TEXT[1] } }] })));
  try {
    signedIn = await prisma.user.create({ data: { username: "tor-scan-admin", displayName: "แอดมิน", passwordHash: "x", role: "ADMIN", appAccess: ["soc"] } });
    await restoreSocJob(set.job.id);
    await readEnds(set.job.id, ocr.readPage);
  } finally {
    delete process.env.TYPHOON_API_KEY;
    mock.restoreAll();
    signedIn = null;
  }
  assert.equal((await torMatchView(set.job.id))?.state, "ready");
});
