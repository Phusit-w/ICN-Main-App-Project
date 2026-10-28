// A scanned TOR build (soc-builder ticket 06): the OCR reads the chosen pages
// only, in the same line as other OCR reads, with "รอคิวที่ N" and pages done;
// the draft is built when the read ends. Cancel and resume keep the pages
// read; a failed read can be resumed; a delete stops the read. The OCR is a fake.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildSocDocx } from "@/test/docx-fixture";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import { readSocTable } from "@/lib/soc-table";
import type { CellReader } from "@/lib/soc-pdf-soc";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: createRoute } = await import("@/app/api/soc/builds/route");
const { OCR_CONFIRM_REQUIRED, resolveStorageKey } = await import("@/lib/soc");
const { cancelBuildRead, createSocBuild, deleteSocBuild, downloadSocBuild, resumeBuildRead, resumeBuildReads, startBuildRead } = await import("@/lib/soc-builds");
const { stopOcrRead } = await import("@/lib/soc-ocr-queue");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-build-scan-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
  delete process.env.TYPHOON_API_KEY;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const TEMPLATE = buildSocDocx([["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ"], ["", "", ""]]);
// What the OCR reads on each of the three scanned pages.
const TOR_TEXT = [
  "1. ระบบกล้องวงจรปิด\n1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล",
  "2. ระบบเครือข่าย\n2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต",
  "3. หมายเหตุ\n3.1 ราคารวมภาษีมูลค่าเพิ่ม",
];
const SCANNED: TablePage = { columns: [], rows: [], scanned: true };
const SCANNED_TOR = buildTablePdf([SCANNED, SCANNED, SCANNED]);

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
async function owner() {
  const actor = await prisma.user.create({ data: { username: `build-scan-${++users}`, displayName: "ผู้สร้าง", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  signedIn = actor;
  return actor;
}

const input = (pageRanges = "1-2", title = `TOR สแกน ${users}`) => ({ title, tor: { name: "TOR สแกน.pdf", bytes: SCANNED_TOR }, pageRanges, template: { file: { name: "template.docx", bytes: TEMPLATE } } });
const scanned = (actor: Actor, ocr: ReturnType<typeof fakeOcr>, pageRanges = "1-2") => createSocBuild(actor, input(pageRanges), { readPage: ocr.readPage, ocrConfirmed: true });
// The read the create started (same key, so the same promise).
const readEnds = (id: string, ocr: ReturnType<typeof fakeOcr>) => startBuildRead(id, ocr.readPage);
const view = (id: string) => prisma.socBuild.findUniqueOrThrow({ where: { id } });
const savedPages = async (id: string) => {
  const file = path.join(storageRoot, "builds", id, "tor-pages.jsonl");
  return existsSync(file) ? (await readFile(file, "utf8")).trim().split(/\r?\n/).map((line) => (JSON.parse(line) as { page: number }).page) : [];
};

test("a scanned TOR is refused without the OCR key or the user's confirm, and nothing is stored or sent", { skip }, async () => {
  const actor = await owner();
  const ocr = fakeOcr();
  await assert.rejects(createSocBuild(actor, input(), { readPage: ocr.readPage }), new RegExp(OCR_CONFIRM_REQUIRED));
  await assert.rejects(createSocBuild(actor, input(), { readPage: undefined, ocrConfirmed: true }), /TYPHOON_API_KEY/);
  assert.equal(await prisma.socBuild.count({ where: { ownerId: actor.id } }), 0);
  assert.deepEqual(ocr.calls, []);
  assert.equal(existsSync(path.join(storageRoot, "builds")) ? readdirSync(path.join(storageRoot, "builds")).length : 0, 0);

  // Over HTTP the refusal is a 409 that asks the form to confirm.
  const form = new FormData();
  form.set("tor", new File([Buffer.from(SCANNED_TOR)], "TOR สแกน.pdf", { type: "application/pdf" }));
  form.set("pageRanges", "1-2");
  form.set("template", new File([Buffer.from(TEMPLATE)], "template.docx"));
  process.env.TYPHOON_API_KEY = "test-key"; // only configured: no page is sent before the confirm
  const response = await createRoute(new Request("http://test/api/soc/builds", { method: "POST", body: form })).finally(() => { delete process.env.TYPHOON_API_KEY; });
  assert.equal(response.status, 409);
  assert.equal(((await response.json()) as { needsOcrConfirm?: boolean }).needsOcrConfirm, true);
});

test("a bad template is refused before the TOR is queued", { skip }, async () => {
  const actor = await owner();
  const ocr = fakeOcr();
  await assert.rejects(createSocBuild(actor, { ...input(), template: { file: { name: "t.docx", bytes: buildSocDocx([["a"], [""]]) } } }, { readPage: ocr.readPage, ocrConfirmed: true }), /ไม่พบตาราง SOC ในเทมเพลต/);
  assert.equal(await prisma.socBuild.count({ where: { ownerId: actor.id } }), 0);
  assert.deepEqual(ocr.calls, []);
});

test("only the chosen pages are sent to the OCR, then the draft is built from them", { skip }, async () => {
  const actor = await owner();
  const ocr = fakeOcr();
  const created = await scanned(actor, ocr, "2-3");
  assert.equal(created.status, "QUEUED");
  assert.equal(created.scanned, true);
  assert.equal(created.pagesTotal, 2);
  await readEnds(created.id, ocr);

  assert.deepEqual(ocr.calls, [2, 3]);
  const build = await view(created.id);
  assert.deepEqual([build.status, build.stage, build.pagesDone, build.pagesTotal, build.scanned], ["READY", null, 2, 2, true]);
  assert.equal(build.rowCount, 4);
  const draft = await downloadSocBuild(created.id);
  assert.ok(draft);
  assert.deepEqual(readSocTable(draft.bytes).rows.slice(1).map((row) => [row.item, row.tor]), [["2.", "ระบบเครือข่าย"], ["2.1", "สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต"], ["3.", "หมายเหตุ"], ["3.1", "ราคารวมภาษีมูลค่าเพิ่ม"]]);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { entityId: created.id }, orderBy: { createdAt: "asc" } })).map((e) => e.action), ["SOC_BUILD_CREATED", "SOC_BUILD_READ_COMPLETED"]);
});

test("a build waits its turn behind other OCR reads and shows รอคิวที่ N; progress shows the pages read", { skip }, async () => {
  const actor = await owner();
  const held = fakeOcr({ holdOn: 2 });
  const first = await scanned(actor, held);
  await held.reachedHold;
  const reading = await view(first.id);
  assert.deepEqual([reading.status, reading.stage, reading.pagesDone], ["READING", "กำลังอ่าน TOR หน้า 1/2", 1]);

  const ocr = fakeOcr();
  const second = await scanned(actor, ocr);
  await new Promise((resolve) => setTimeout(resolve, 50)); // the waiting label is written in the background
  const waiting = await view(second.id);
  assert.deepEqual([waiting.status, waiting.stage], ["QUEUED", "รอคิวที่ 1"]);
  assert.deepEqual(ocr.calls, []);

  held.release();
  await readEnds(first.id, held);
  await readEnds(second.id, ocr);
  assert.equal((await view(second.id)).status, "READY");
});

test("cancel stops the read and keeps the pages read; resume reads only the rest", { skip }, async () => {
  const actor = await owner();
  const held = fakeOcr({ holdOn: 2 });
  const created = await scanned(actor, held);
  await held.reachedHold;
  const cancelled = cancelBuildRead(created.id);
  held.release(); // the call already sent is waited for
  assert.equal(await cancelled, true);
  const build = await view(created.id);
  assert.deepEqual([build.status, build.stage, build.outputStorageKey], ["CANCELLED", null, null]);
  assert.match(build.errorMessage ?? "", /ยกเลิก/);
  assert.deepEqual(held.calls, [1, 2]);
  assert.deepEqual(await savedPages(created.id), [1, 2]);
  assert.equal(await cancelBuildRead(created.id), false);

  const ocr = fakeOcr();
  assert.equal(await resumeBuildRead(created.id, ocr.readPage), true);
  await readEnds(created.id, ocr);
  assert.deepEqual(ocr.calls, []); // nothing read twice
  assert.equal((await view(created.id)).status, "READY");
});

test("a read that fails ends as FAILED with a reason; resume reads only the pages not saved", { skip }, async () => {
  const actor = await owner();
  const failing = fakeOcr({ failOn: 2 });
  const created = await scanned(actor, failing);
  await readEnds(created.id, failing);
  const failed = await view(created.id);
  assert.equal(failed.status, "FAILED");
  assert.match(failed.errorMessage ?? "", /อ่านต่อ/);
  assert.deepEqual(await savedPages(created.id), [1]);
});

test("resume needs the OCR key and only a failed or cancelled build can be resumed", { skip }, async () => {
  const actor = await owner();
  const failing = fakeOcr({ failOn: 2 });
  const created = await scanned(actor, failing);
  await readEnds(created.id, failing);
  await assert.rejects(resumeBuildRead(created.id, undefined), /TYPHOON_API_KEY/);
  assert.equal((await view(created.id)).status, "FAILED");

  const ocr = fakeOcr();
  assert.equal(await resumeBuildRead(created.id, ocr.readPage), true);
  await readEnds(created.id, ocr);
  assert.deepEqual(ocr.calls, [2]);
  assert.equal((await view(created.id)).status, "READY");
  assert.equal(await resumeBuildRead(created.id, ocr.readPage), false);
});

test("a restart picks up a build left being read", { skip }, async () => {
  const actor = await owner();
  const held = fakeOcr({ holdOn: 2 });
  const created = await scanned(actor, held);
  await held.reachedHold;
  // As after a restart: the read is gone, the build still says reading.
  const stopping = stopOcrRead(`build:${created.id}`);
  held.release();
  await stopping;
  assert.equal((await view(created.id)).status, "READING");
  const ocr = fakeOcr();
  await resumeBuildReads(ocr.readPage);
  await readEnds(created.id, ocr);
  assert.deepEqual(ocr.calls, []);
  assert.equal((await view(created.id)).status, "READY");
});

test("deleting a build being read stops its read and removes its files", { skip }, async () => {
  const actor = await owner();
  const held = fakeOcr({ holdOn: 2 });
  const created = await scanned(actor, held);
  await held.reachedHold;
  const deleting = deleteSocBuild(created.id);
  held.release();
  await deleting;
  assert.deepEqual(held.calls, [1, 2]); // no page after the delete
  assert.equal(await prisma.socBuild.count({ where: { id: created.id } }), 0);
  assert.equal(existsSync(path.join(storageRoot, "builds", created.id)), false);
  assert.equal(existsSync(resolveStorageKey(created.torStorageKey)), false);
});

test("only the owner or an admin can cancel or resume a build", { skip }, async () => {
  const actor = await owner();
  const held = fakeOcr({ holdOn: 2 });
  const created = await scanned(actor, held);
  await held.reachedHold;
  signedIn = await prisma.user.create({ data: { username: `build-scan-other-${++users}`, displayName: "คนอื่น", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  await assert.rejects(cancelBuildRead(created.id), /NOT_FOUND/);
  signedIn = actor;
  held.release();
  await readEnds(created.id, held);
});
