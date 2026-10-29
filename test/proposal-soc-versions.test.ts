// SOC Versions of a Proposal (proposal-build ticket 04): every uploaded SOC is
// the next numbered version, the highest ready one is current, a SOC is
// accepted as the SOC check accepts it, a scanned PDF reads in the background
// before it counts, and old versions stay downloadable. Driven through the
// routes, with the signed-in user stubbed and a fake OCR cell reader.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildSocDocx } from "@/test/docx-fixture";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import { buildXlsx } from "@/test/xlsx-fixture";
import type { CellReader } from "@/lib/soc-pdf-soc";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: uploadRoute } = await import("@/app/api/proposals/[id]/soc-versions/route");
const { GET: downloadRoute } = await import("@/app/api/proposals/[id]/soc-versions/[versionId]/route");
const { createProposalAction, trashProposalAction } = await import("@/actions/proposal");
const { restoreProposalAction, purgeProposal } = await import("@/actions/admin");
const { getProposalPage, listProposals, proposalStorageDir } = await import("@/lib/proposal");
const { attachSocVersion, startVersionRead, resumeVersionRead, listSocVersions } = await import("@/lib/proposal-soc");
const { OCR_NOT_SET_UP } = await import("@/lib/soc-typhoon");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "proposal-soc-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => {
  delete process.env.TYPHOON_API_KEY;
  return rm(storageRoot, { recursive: true, force: true });
});

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"];
const ROWS = [["1", "ระบบกล้อง", "", ""], ["1.1", "กล้อง 4K", "CASRI 8K", "Brochure หน้า 3"]];
const WORD = () => buildSocDocx([HEADER, ...ROWS]);
const EXCEL = () => buildXlsx([{ name: "SOC", rows: [HEADER, ...ROWS] }]);
const TEXT_PDF = () => buildTablePdf([{ columns: [50, 200, 150, 150], rows: [HEADER, ...ROWS] }]);
const NO_ITEMS = () => buildSocDocx([HEADER, ["ก", "ไม่มีเลขข้อ", "", ""]]);

const SCAN_HEADER = ["คุณลักษณะที่กำหนด", "ข้อเสนอทางบริษัท", "เอกสารอ้างอิง (หน้า)", "หมายเหตุ"];
const scan = (rows: string[][]): TablePage => ({ columns: [], rows: [], raster: { columns: [380, 220, 190, 120], rows: [SCAN_HEADER, ...rows] } });
const SCAN_PAGES = [scan([["๑. ระบบกล้อง", "", "", ""], ["๑.๑ กล้อง PTZ", "CASRI", "หน้า 3", ""]])];
const SCANNED = () => buildTablePdf(SCAN_PAGES);

// The fake answers each cell with the text the fixture drew in it; it can fail after some cells or be held back.
function fakeReader({ failAfter = Infinity, hold = false } = {}) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const readCell: CellReader = async (_image, at) => {
    if (hold) await held;
    if (calls >= failAfter) throw new Error("OCR down");
    calls += 1;
    return SCAN_PAGES[at.page - 1].raster!.rows[at.row][at.column];
  };
  return { readCell, release };
}

async function proposal(title = "งาน SOC") {
  const owner = await prisma.user.create({ data: { username: `u-${title}`, displayName: "ผู้ใช้", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  signedIn = owner;
  const created = await createProposalAction(title);
  assert.ok(created.ok);
  return { owner, id: created.id };
}

function upload(id: string, bytes: Uint8Array, name: string, confirmed = false) {
  const form = new FormData();
  form.set("soc", new File([bytes as BlobPart], name));
  if (confirmed) form.set("ocrConfirmed", "1");
  return uploadRoute(new Request("http://localhost/x", { method: "POST", body: form }), { params: Promise.resolve({ id }) });
}

const ctx = (id: string, versionId: string) => ({ params: Promise.resolve({ id, versionId }) });
const download = (id: string, versionId: string, source = false) => downloadRoute(new Request(`http://localhost/x${source ? "?file=source" : ""}`), ctx(id, versionId));
const owns = (id: string) => prisma.socVersion.findMany({ where: { proposalId: id }, orderBy: { number: "asc" } });

test("Word, Excel and text PDF SOCs become versions 1, 2, 3; the latest is current, the old ones stay listed and downloadable", { skip }, async () => {
  const { id } = await proposal();
  assert.equal((await getProposalPage(id)).currentVersion, null);

  const word = await upload(id, await WORD(), "SOC.docx");
  assert.equal(word.status, 201, JSON.stringify(await word.clone().json()));
  assert.equal((await upload(id, await EXCEL(), "SOC.xlsx")).status, 201);
  assert.equal((await upload(id, TEXT_PDF(), "SOC.pdf")).status, 201);

  const versions = await owns(id);
  assert.deepEqual(versions.map((v) => [v.number, v.source, v.state]), [[1, "upload", "ready"], [2, "upload", "ready"], [3, "upload", "ready"]]);
  assert.ok(versions.every((v) => v.storageKey?.startsWith(`proposals/${id}/`)));

  const page = await getProposalPage(id);
  assert.equal(page.currentVersion, 3);
  assert.deepEqual(page.socVersions.map((v) => [v.number, v.current]), [[3, true], [2, false], [1, false]]);
  assert.equal(page.steps[3].now, "ใช้ SOC ฉบับ 3");
  assert.equal((await listProposals())[0].currentVersion, 3);

  // A PDF SOC keeps its source PDF and the PDF page of each row; the file itself is the .xlsx made from it.
  const pdfVersion = versions[2];
  assert.equal(pdfVersion.originalName, "SOC.xlsx");
  assert.equal(pdfVersion.sourceName, "SOC.pdf");
  assert.ok(Array.isArray(pdfVersion.rowPages) && (pdfVersion.rowPages as number[]).length > 0);
  assert.equal(page.socVersions[0].hasSourcePdf, true);
  assert.equal(page.socVersions[2].hasSourcePdf, false);

  // Old versions download too.
  const first = await download(id, versions[0].id);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal((await download(id, pdfVersion.id, true)).headers.get("content-type"), "application/pdf");
  assert.equal((await download(id, versions[0].id, true)).status, 404); // a Word SOC has no source PDF
});

test("a SOC whose table can't be read is refused and keeps nothing, and the number is not used up", { skip }, async () => {
  const { id } = await proposal();
  const noItems = await upload(id, await NO_ITEMS(), "SOC.docx");
  assert.equal(noItems.status, 400);
  assert.match(((await noItems.json()) as { error: string }).error, /เลขข้อใหญ่/);
  assert.equal((await upload(id, new TextEncoder().encode("not a soc"), "SOC.docx")).status, 400);
  assert.equal((await owns(id)).length, 0);
  await assert.rejects(() => stat(proposalStorageDir(id)), "nothing stored");

  assert.equal((await upload(id, await WORD(), "SOC.docx")).status, 201);
  assert.equal((await owns(id))[0].number, 1);
});

test("uploads at the same moment get different numbers", { skip }, async () => {
  const { id } = await proposal();
  const bytes = await WORD();
  const answers = await Promise.all([1, 2, 3].map((n) => upload(id, bytes, `SOC ${n}.docx`)));
  assert.deepEqual(answers.map((r) => r.status), [201, 201, 201]);
  assert.deepEqual((await owns(id)).map((v) => v.number), [1, 2, 3]);
});

test("a scanned PDF SOC: refused without OCR set up, then without the confirm; accepted it is numbered at once, reading, and only counts once read", { skip }, async () => {
  const { id } = await proposal();
  assert.equal((await upload(id, await WORD(), "SOC.docx")).status, 201);

  delete process.env.TYPHOON_API_KEY;
  const noOcr = await upload(id, SCANNED(), "สแกน.pdf", true);
  assert.equal(noOcr.status, 400);
  assert.deepEqual(await noOcr.json(), { error: OCR_NOT_SET_UP });

  process.env.TYPHOON_API_KEY = "test-key";
  const unconfirmed = await upload(id, SCANNED(), "สแกน.pdf");
  assert.equal(unconfirmed.status, 409);
  assert.equal(((await unconfirmed.json()) as { needsOcrConfirm: boolean }).needsOcrConfirm, true);
  assert.equal((await owns(id)).length, 1, "nothing kept without the confirm");

  // Accepted: through the library with the fake reader, held so the version stays reading.
  const reader = fakeReader({ hold: true });
  const { owner } = { owner: signedIn! };
  const attached = await attachSocVersion(owner, { id, title: "งาน SOC" }, { name: "สแกน.pdf", bytes: SCANNED() }, { readCell: reader.readCell, ocrConfirmed: true });
  assert.equal(attached.number, 2);
  assert.equal(attached.state, "reading");
  assert.equal((await getProposalPage(id)).currentVersion, 1, "a version still being read is not current");
  assert.deepEqual((await listSocVersions(id)).map((v) => [v.number, v.state, v.current]), [[2, "reading", false], [1, "ready", true]]);

  reader.release();
  await startVersionRead(attached.versionId, reader.readCell); // joins the read in the line
  const read = await prisma.socVersion.findUniqueOrThrow({ where: { id: attached.versionId } });
  assert.equal(read.state, "ready");
  assert.equal(read.originalName, "สแกน.xlsx");
  assert.equal(read.sourceName, "สแกน.pdf");
  assert.ok(read.storageKey && read.sourceStorageKey);
  assert.equal((await getProposalPage(id)).currentVersion, 2);
  assert.equal((await download(id, read.id)).status, 200);
});

test("a scanned read that fails shows why and goes on from the saved cells when resumed", { skip }, async () => {
  process.env.TYPHOON_API_KEY = "test-key";
  const { id, owner } = await proposal();
  const failing = fakeReader({ failAfter: 1 });
  const attached = await attachSocVersion(owner, { id, title: "งาน SOC" }, { name: "สแกน.pdf", bytes: SCANNED() }, { readCell: failing.readCell, ocrConfirmed: true });
  await startVersionRead(attached.versionId, failing.readCell);
  const failed = await prisma.socVersion.findUniqueOrThrow({ where: { id: attached.versionId } });
  assert.equal(failed.state, "failed");
  assert.match(failed.errorMessage ?? "", /อ่านต่อ/);
  assert.equal((await getProposalPage(id)).currentVersion, null);

  assert.equal(await resumeVersionRead(attached.versionId, fakeReader().readCell), true);
  assert.equal(await resumeVersionRead(attached.versionId, fakeReader().readCell), false, "already resumed");
  // Let the resumed read (started with its own reader) finish.
  await startVersionRead(attached.versionId, fakeReader().readCell);
  assert.equal((await prisma.socVersion.findUniqueOrThrow({ where: { id: attached.versionId } })).state, "ready");
});

test("downloads and uploads need SOC access and the right Proposal; any SOC user may add a version to another's Proposal", { skip }, async () => {
  const { id } = await proposal("งานเจ้าของ");
  assert.equal((await upload(id, await WORD(), "SOC.docx")).status, 201);
  const version = (await owns(id))[0];
  const other = await proposal("งานอื่น");

  signedIn = await prisma.user.create({ data: { username: "teammate", displayName: "เพื่อน", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  assert.equal((await download(id, version.id)).status, 200);
  assert.equal((await upload(id, await EXCEL(), "SOC.xlsx")).status, 201);
  assert.equal((await upload("no-such-proposal", await EXCEL(), "SOC.xlsx")).status, 404);
  assert.equal((await download(other.id, version.id)).status, 404, "a version of another Proposal");

  signedIn = await prisma.user.create({ data: { username: "outsider", displayName: "x", passwordHash: "x", role: "USER", appAccess: ["expense"] } });
  assert.equal((await upload(id, await WORD(), "SOC.docx")).status, 403);
  assert.equal((await download(id, version.id)).status, 404);
});

test("a trashed Proposal stops its scanned read; restoring it goes on; the purge removes the versions and their files", { skip }, async () => {
  process.env.TYPHOON_API_KEY = "test-key";
  const { id, owner } = await proposal("งานถังขยะ");
  const reader = fakeReader({ hold: true });
  const attached = await attachSocVersion(owner, { id, title: "งานถังขยะ" }, { name: "สแกน.pdf", bytes: SCANNED() }, { readCell: reader.readCell, ocrConfirmed: true });
  assert.equal((await upload(id, await WORD(), "SOC.docx")).status, 201);

  // Trashing waits for the OCR call already sent, so the held call is let go as it starts.
  const trashing = trashProposalAction(id);
  reader.release();
  await trashing;
  assert.equal((await prisma.socVersion.findUniqueOrThrow({ where: { id: attached.versionId } })).state, "reading", "a trashed Proposal's read does not finish");

  const admin = await prisma.user.create({ data: { username: "admin", displayName: "แอดมิน", passwordHash: "x", role: "ADMIN", appAccess: ["soc"] } });
  signedIn = admin;
  // Without an OCR key the restore has no reader to restart the read with; the read goes on once one is given.
  delete process.env.TYPHOON_API_KEY;
  await restoreProposalAction(id);
  assert.equal((await prisma.socVersion.findUniqueOrThrow({ where: { id: attached.versionId } })).state, "reading");
  await startVersionRead(attached.versionId, fakeReader().readCell);
  assert.equal((await prisma.socVersion.findUniqueOrThrow({ where: { id: attached.versionId } })).state, "ready");

  signedIn = owner;
  await trashProposalAction(id);
  signedIn = admin;
  await purgeProposal(id);
  assert.equal(await prisma.socVersion.count({ where: { proposalId: id } }), 0);
  await assert.rejects(() => readdir(proposalStorageDir(id)));
});
