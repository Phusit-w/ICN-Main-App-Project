// A scanned PDF SOC is read in the background (soc-scanned-pdf ticket 03): the
// job exists at once as READING with no rows, every cell read is saved, a read
// that stops goes on from the saved cells, and the finished job is the same
// as the Excel SOC made from the same table. The cell reader is a fake.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import type { CellReader } from "@/lib/soc-pdf-soc";

const skip = setupTestDatabase();

mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => null } });

const { createImportedSocJob, resumeScanReads, startScanRead, listSocJobs, cancelScanRead, stopScanRead } = await import("@/lib/soc");
const { deleteTrashedSocJob } = await import("@/lib/soc-trash");
const { convertPdfSoc } = await import("@/lib/soc-pdf-soc");
const { requestSocCheck } = await import("@/actions/socCheckRequests");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-scan-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
  delete process.env.TYPHOON_API_KEY;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");
const HEADER = ["คุณลักษณะที่กำหนด", "ข้อเสนอทางบริษัท", "เอกสารอ้างอิง (หน้า)", "หมายเหตุ"];
const scan = (rows: string[][]): TablePage => ({ columns: [], rows: [], raster: { columns: [380, 220, 190, 120], rows: [HEADER, ...rows] } });
const PAGES = [
  scan([["๑. ระบบกล้อง", "", "", ""], ["๑.๑ กล้อง PTZ", "CASRI", "หน้า 3", "ตรง"]]),
  scan([["๒. ระบบเซนเซอร์", "", "", ""], ["๒.๑ เซนเซอร์", "IMX585", "หน้า 9", ""]]),
];
const SCANNED = buildTablePdf(PAGES);

// The fake answers each cell with the text the fixture drew in it, and can be
// held back (`hold`) or made to fail after some cells (`failAfter`).
function fakeReader({ failAfter = Infinity }: { failAfter?: number } = {}) {
  const calls: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let hold = false;
  const readCell: CellReader = async (_image, at) => {
    if (hold) await held;
    if (calls.length >= failAfter) throw new Error("OCR down");
    calls.push(`${at.page}/${at.row}/${at.column}`);
    return PAGES[at.page - 1].raster!.rows[at.row][at.column];
  };
  return { readCell, calls, holdUntil: () => { hold = true; return release; } };
}

const user = (username: string) => prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role: "USER", appAccess: ["soc"] } });
const job = (id: string) => prisma.socJob.findUniqueOrThrow({ where: { id }, include: { documents: { orderBy: { type: "asc" } }, majorItems: { orderBy: { position: "asc" }, omit: { id: true, jobId: true, createdAt: true, updatedAt: true } } } });

test("a scanned PDF SOC makes its job at once as READING with no rows; when the read ends it is the same as the Excel SOC", { skip }, async () => {
  const owner = await user("owner");
  const reader = fakeReader();
  const release = reader.holdUntil();
  const jobId = await createImportedSocJob(owner, { title: "USO", soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [{ name: "Brochure.pdf", bytes: PDF }] }, { readCell: reader.readCell });

  const reading = await job(jobId);
  assert.equal(reading.status, "READING");
  assert.equal(reading.stage, "กำลังอ่านตาราง");
  assert.deepEqual(reading.documents.map((d) => d.type), ["EVIDENCE", "SOC_SOURCE_PDF"]); // no SOC yet
  assert.deepEqual(reading.majorItems, []);
  assert.ok((await listSocJobs(owner)).some((j) => j.id === jobId && j.status === "READING"));
  await assert.rejects(requestSocCheck(jobId, "no-such-item"), /./); // nothing to check while reading

  release();
  await startScanRead(jobId, reader.readCell); // the run already going
  const done = await job(jobId);
  assert.equal(done.status, "NEEDS_REVIEW");
  assert.deepEqual(done.documents.map((d) => d.type), ["EVIDENCE", "SOC", "SOC_SOURCE_PDF"]);
  assert.deepEqual(done.socRowPages, [1, 1, 2, 2]);

  // The Excel SOC made from the same table.
  const { xlsx } = await convertPdfSoc(SCANNED, { readCell: fakeReader().readCell });
  const excelId = await createImportedSocJob(owner, { title: "USO xlsx", soc: { name: "SOC.xlsx", bytes: xlsx }, evidence: [{ name: "Brochure.pdf", bytes: PDF }] });
  assert.deepEqual(done.majorItems, (await job(excelId)).majorItems);
  assert.equal(done.majorItems.length, 2);
});

test("every cell is saved as it is read: a read that stopped goes on from the saved cells and reads none twice", { skip }, async () => {
  const owner = await user("owner2");
  const first = fakeReader({ failAfter: 5 });
  const jobId = await createImportedSocJob(owner, { title: "USO", soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [] }, { readCell: first.readCell });
  await startScanRead(jobId, first.readCell);
  const failed = await job(jobId);
  assert.equal(failed.status, "READ_FAILED");
  assert.equal(failed.errorMessage, "OCR down");
  assert.equal(first.calls.length, 5);
  const saved = (await readFile(path.join(storageRoot, jobId, "cells.jsonl"), "utf8")).trim().split("\n");
  assert.equal(saved.length, 5);

  // What a restart finds: the job still READING.
  await prisma.socJob.update({ where: { id: jobId }, data: { status: "READING" } });
  const second = fakeReader();
  await resumeScanReads(second.readCell);
  await startScanRead(jobId, second.readCell);
  assert.equal((await job(jobId)).status, "NEEDS_REVIEW");
  assert.deepEqual(second.calls.filter((c) => first.calls.includes(c)), []);
  assert.equal(first.calls.length + second.calls.length, 17); // all cells with ink (4 + 1 + 4, 4 + 1 + 3), each read once
});

test("a PDF with no scanned table page never calls the cell reader; a scanned one without OCR set up is handled as before", { skip }, async () => {
  const owner = await user("owner3");
  const reader = fakeReader();
  const text = buildTablePdf([{ columns: [60, 200, 150, 150], rows: [["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"], ["1.1", "กล้อง", "CASRI", "หน้า 3"]] }]);
  const jobId = await createImportedSocJob(owner, { title: "Text", soc: { name: "SOC.pdf", bytes: text }, evidence: [] }, { readCell: reader.readCell });
  assert.equal((await job(jobId)).status, "NEEDS_REVIEW");
  assert.equal(reader.calls.length, 0);
  // No TYPHOON_API_KEY and no reader given: the scan is refused, no job is left.
  const before = await prisma.socJob.count();
  await assert.rejects(createImportedSocJob(owner, { title: "Scan", soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [] }));
  assert.equal(await prisma.socJob.count(), before);
});

test("a job moved to the trash while it is read stops being read and is left as it was", { skip }, async () => {
  const owner = await user("owner4");
  const reader = fakeReader();
  const release = reader.holdUntil();
  const jobId = await createImportedSocJob(owner, { title: "USO", soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [] }, { readCell: reader.readCell });
  await prisma.socJob.update({ where: { id: jobId }, data: { deletedAt: new Date() } });
  release();
  await startScanRead(jobId, reader.readCell);
  const left = await job(jobId);
  assert.equal(left.status, "READING");
  assert.equal(left.errorMessage, null);
  assert.deepEqual(left.majorItems, []);
});

test("scanned jobs are read one at a time in upload order; a waiting job shows รอคิวที่ N and positions move up", { skip }, async () => {
  const owner = await user("owner5");
  let active = 0;
  let peak = 0;
  const first = fakeReader();
  const release = first.holdUntil();
  const second = fakeReader();
  const third = fakeReader();
  const watch = (reader: CellReader): CellReader => async (image, at) => {
    active++;
    peak = Math.max(peak, active);
    try { return await reader(image, at); } finally { active--; }
  };
  const make = (title: string, readCell: CellReader) => createImportedSocJob(owner, { title, soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [] }, { readCell: watch(readCell) });
  const a = await make("A", first.readCell);
  const b = await make("B", second.readCell);
  const c = await make("C", third.readCell);
  const stage = async (id: string) => (await job(id)).stage;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  await settle();
  assert.ok((await stage(a)).startsWith("กำลังอ่านตาราง"));
  assert.equal(await stage(b), "รอคิวที่ 1");
  assert.equal(await stage(c), "รอคิวที่ 2");
  assert.equal(second.calls.length + third.calls.length, 0);

  release();
  await startScanRead(a, first.readCell);
  await settle();
  assert.equal((await job(a)).status, "NEEDS_REVIEW");
  await startScanRead(b, second.readCell);
  await startScanRead(c, third.readCell);
  assert.equal((await job(b)).status, "NEEDS_REVIEW");
  assert.equal((await job(c)).status, "NEEDS_REVIEW");
  assert.equal(peak, 1);
});

test("a failed job does not block the queue, and a restart picks the job up again", { skip }, async () => {
  const owner = await user("owner6");
  const broken = fakeReader({ failAfter: 0 });
  const fine = fakeReader();
  const a = await createImportedSocJob(owner, { title: "A", soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [] }, { readCell: broken.readCell });
  const b = await createImportedSocJob(owner, { title: "B", soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [] }, { readCell: fine.readCell });
  await startScanRead(a, broken.readCell);
  await startScanRead(b, fine.readCell);
  assert.equal((await job(a)).status, "READ_FAILED");
  assert.equal((await job(b)).status, "NEEDS_REVIEW");

  // A restart finds the failed job in READING again and reads it from the start of the queue.
  await prisma.socJob.update({ where: { id: a }, data: { status: "READING" } });
  const again = fakeReader();
  await resumeScanReads(again.readCell);
  await startScanRead(a, again.readCell);
  assert.equal(again.calls.length, 17);
  assert.equal((await job(a)).status, "NEEDS_REVIEW");
});

// A reader that stays inside its first call until `go`, so a stop can come while a job is read.
function gatedReader() {
  const base = fakeReader();
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  let go!: () => void;
  const gate = new Promise<void>((resolve) => { go = resolve; });
  let first = true;
  const readCell: CellReader = async (image, at) => {
    if (first) { first = false; enter(); await gate; }
    return base.readCell(image, at);
  };
  return { readCell, calls: base.calls, entered, go };
}

const make = (owner: Awaited<ReturnType<typeof user>>, title: string, readCell: CellReader) => createImportedSocJob(owner, { title, soc: { name: "SOC.pdf", bytes: SCANNED }, evidence: [] }, { readCell });

test("cancel while reading: no cell is read after it returns, saved cells stay, and the job can be read again", { skip }, async () => {
  const owner = await user("owner7");
  const a = gatedReader();
  const b = fakeReader();
  const idA = await make(owner, "A", a.readCell);
  const idB = await make(owner, "B", b.readCell);
  await a.entered;
  const cancelling = cancelScanRead(idA);
  a.go();
  await cancelling;
  const seen = a.calls.length;
  await startScanRead(idB, b.readCell); // B was waiting and now runs
  assert.equal(a.calls.length, seen);
  assert.equal((await job(idA)).status, "READ_FAILED");
  assert.equal((await job(idA)).stage, "ยกเลิกการอ่านแล้ว");
  assert.equal((await job(idB)).status, "NEEDS_REVIEW");
  const saved = (await readFile(path.join(storageRoot, idA, "cells.jsonl"), "utf8")).trim().split(/\r?\n/);
  assert.equal(saved.length, seen); // the cells read before the cancel are kept

  await prisma.socJob.update({ where: { id: idA }, data: { status: "READING" } });
  const again = fakeReader();
  await startScanRead(idA, again.readCell);
  assert.equal((await job(idA)).status, "NEEDS_REVIEW");
});

test("a queued job that is stopped leaves the queue, and later jobs move up", { skip }, async () => {
  const owner = await user("owner8");
  const a = gatedReader();
  const b = fakeReader();
  const c = fakeReader();
  const idA = await make(owner, "A", a.readCell);
  const idB = await make(owner, "B", b.readCell);
  const idC = await make(owner, "C", c.readCell);
  await a.entered;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal((await job(idC)).stage, "รอคิวที่ 2");
  const stopping = stopScanRead(idB);
  a.go();
  await startScanRead(idA, a.readCell);
  await stopping;
  await startScanRead(idC, c.readCell);
  assert.equal(b.calls.length, 0);
  assert.equal((await job(idB)).status, "READING");
  assert.equal((await job(idC)).status, "NEEDS_REVIEW");
});

test("deleting a trashed job for good stops its read and removes the saved cells", { skip }, async () => {
  const owner = await user("owner9");
  const a = gatedReader();
  const id = await make(owner, "A", a.readCell);
  await a.entered;
  await prisma.socJob.update({ where: { id }, data: { deletedAt: new Date() } });
  const deleting = deleteTrashedSocJob(id, null);
  a.go();
  assert.equal(await deleting, true);
  const seen = a.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(a.calls.length, seen);
  await assert.rejects(readFile(path.join(storageRoot, id, "cells.jsonl")));
  assert.equal(await prisma.socJob.count({ where: { id } }), 0);
});
