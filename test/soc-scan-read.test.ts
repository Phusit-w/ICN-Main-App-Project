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

const { createImportedSocJob, resumeScanReads, startScanRead, listSocJobs } = await import("@/lib/soc");
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
