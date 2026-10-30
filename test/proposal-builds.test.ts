// สร้าง SOC inside a Proposal (proposal-build ticket 05): a build from the
// Proposal's own TOR, its READY draft becoming a SOC Version, access widened to
// the Proposal, the 30-day purge keeping the version, and the step's status.
// The build routes and server functions are driven with the signed-in user stubbed; the OCR is a fake.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
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

const { POST: buildRoute } = await import("@/app/api/proposals/[id]/builds/route");
const { POST: torRoute } = await import("@/app/api/proposals/[id]/tor/route");
const { GET: versionDownload } = await import("@/app/api/proposals/[id]/soc-versions/[versionId]/route");
const { GET: buildDownload } = await import("@/app/api/soc/builds/[id]/download/route");
const { createProposalAction } = await import("@/actions/proposal");
const { getProposalPage, listProposals, trashProposal, deleteTrashedProposal, proposalStorageDir } = await import("@/lib/proposal");
const { startProposalBuild } = await import("@/lib/proposal-build");
const { addMissingBuildVersions, authorizeSocBuild, deleteSocBuild, listSocBuilds, purgeExpiredSocBuilds, startBuildRead, cancelBuildRead, resumeBuildRead } = await import("@/lib/soc-builds");
const { resolveStorageKey } = await import("@/lib/soc");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "proposal-builds-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
  delete process.env.TYPHOON_API_KEY;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const TEMPLATE = buildSocDocx([["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ"], ["", "", ""]]);
const torPage = (...lines: string[]): TablePage => ({ columns: [], rows: [], lines: lines.map((text) => ({ text })) });
const TOR = buildTablePdf([
  torPage("1. ระบบกล้องวงจรปิด", "1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล"),
  torPage("2. ระบบเครือข่าย", "2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต"),
]);
const SCANNED: TablePage = { columns: [], rows: [], scanned: true };
const SCANNED_TOR = buildTablePdf([SCANNED, SCANNED]);
const TOR_TEXT = ["1. ระบบกล้องวงจรปิด\n1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", "2. ระบบเครือข่าย\n2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต"];

let users = 0;
const user = (appAccess = ["soc"], role: "USER" | "ADMIN" = "USER") =>
  prisma.user.create({ data: { username: `pb-${++users}`, displayName: `คุณ ${users}`, passwordHash: "x", role, appAccess } });

// A Proposal with a TOR, created by a fresh user (who stays signed in).
async function proposal({ tor = TOR as Uint8Array | null, ocr = false } = {}) {
  const owner = (signedIn = await user());
  const created = await createProposalAction(`งาน ${users}`);
  assert.ok(created.ok);
  if (tor) {
    process.env.TYPHOON_API_KEY = ocr ? "test-key" : "";
    const form = new FormData();
    form.set("tor", new File([tor as BlobPart], "โฟลเดอร์/TOR ลูกค้า.pdf"));
    form.set("ocrConfirmed", "1");
    const response = await torRoute(new Request("http://t/x", { method: "POST", body: form }), { params: Promise.resolve({ id: created.id }) });
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    delete process.env.TYPHOON_API_KEY;
  }
  return { owner, id: created.id };
}

function build(id: string, fields: { pageRanges?: string; title?: string; confirmed?: boolean; template?: boolean } = {}) {
  const form = new FormData();
  form.set("pageRanges", fields.pageRanges ?? "1-2");
  if (fields.title) form.set("title", fields.title);
  if (fields.template !== false) form.set("template", new File([Buffer.from(TEMPLATE)], "template.docx"));
  if (fields.confirmed) form.set("ocrConfirmed", "1");
  return buildRoute(new Request("http://t/x", { method: "POST", body: form }), { params: Promise.resolve({ id }) });
}

const versions = (id: string) => prisma.socVersion.findMany({ where: { proposalId: id }, orderBy: { number: "asc" } });
const stepOf = async (id: string) => (await getProposalPage(id)).steps[2];

function fakeOcr({ failOn = 0 } = {}) {
  const readPage: CellReader = async (_image, at) => {
    if (at.page === failOn) throw new Error("OCR down");
    return TOR_TEXT[at.page - 1];
  };
  return readPage;
}

test("a build from the Proposal's TOR needs no TOR upload and its READY draft becomes the next SOC Version, which reads back", { skip }, async () => {
  const { id, owner } = await proposal();
  assert.equal((await stepOf(id)).status, "todo");
  const response = await build(id, { title: "SOC งานนี้" });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const body = (await response.json()) as { id: string; status: string; rowCount: number };
  assert.equal(body.status, "READY");

  const [version] = await versions(id);
  assert.equal(version.number, 1);
  assert.equal(version.source, "build");
  assert.equal(version.state, "ready");
  assert.equal(version.buildId, body.id);
  assert.equal(version.createdById, owner.id);
  assert.ok(version.storageKey?.startsWith(`proposals/${id}/`));
  const stored = await prisma.socBuild.findUniqueOrThrow({ where: { id: body.id } });
  assert.equal(stored.proposalId, id);
  assert.notEqual(version.storageKey, stored.outputStorageKey, "the version keeps its own copy");

  const download = await versionDownload(new Request("http://t/x"), { params: Promise.resolve({ id, versionId: version.id }) });
  assert.equal(download.status, 200);
  assert.deepEqual(readSocTable(new Uint8Array(await download.arrayBuffer())).rows.slice(1).map((row) => row.item), ["1.", "1.1", "2.", "2.1"]);

  const page = await getProposalPage(id);
  assert.equal(page.currentVersion, 1);
  assert.equal(page.steps[2].status, "done");
  assert.deepEqual(page.builds.map((b) => [b.id, b.versionNumber]), [[body.id, 1]]);
  assert.equal((await listProposals())[0].progress.done, 2); // TOR + สร้าง SOC
});

test("a Proposal without a TOR refuses to build, and a bad page range stores nothing", { skip }, async () => {
  const { id } = await proposal({ tor: null });
  const none = await build(id);
  assert.equal(none.status, 400);
  assert.match(((await none.json()) as { error: string }).error, /TOR/);
  const withTor = await proposal();
  const bad = await build(withTor.id, { pageRanges: "1-9" });
  assert.equal(bad.status, 400);
  assert.equal((await build(withTor.id, { template: false })).status, 400);
  assert.equal(await prisma.socBuild.count({ where: { proposalId: withTor.id } }), 0);
  assert.equal((await versions(withTor.id)).length, 0);
});

test("a scanned TOR build asks for the OCR confirm, is กำลังทำ while it waits, and adds its version only when READY", { skip }, async () => {
  const { id, owner } = await proposal({ tor: SCANNED_TOR, ocr: true });
  process.env.TYPHOON_API_KEY = "test-key";
  const unconfirmed = await build(id);
  assert.equal(unconfirmed.status, 409);
  assert.equal(((await unconfirmed.json()) as { needsOcrConfirm: boolean }).needsOcrConfirm, true);
  delete process.env.TYPHOON_API_KEY;
  assert.equal(await prisma.socBuild.count({ where: { proposalId: id } }), 0);

  const readPage = fakeOcr();
  const started = await startProposalBuild(id, { pageRanges: "1-2", template: { file: { name: "t.docx", bytes: TEMPLATE } } }, { readPage, ocrConfirmed: true });
  assert.equal(started.status, "QUEUED");
  assert.equal((await versions(id)).length, 0);
  assert.equal((await stepOf(id)).status, "doing");
  await startBuildRead(started.id, readPage); // the same key: resolves when the read ends
  assert.equal((await prisma.socBuild.findUniqueOrThrow({ where: { id: started.id } })).status, "READY");
  const [version] = await versions(id);
  assert.equal(version.source, "build");
  assert.equal(version.createdById, owner.id);
  assert.equal((await stepOf(id)).status, "done");
});

test("a failed or cancelled build adds nothing; resuming it to READY adds the version once", { skip }, async () => {
  const { id } = await proposal({ tor: SCANNED_TOR, ocr: true });
  const failing = fakeOcr({ failOn: 2 });
  const started = await startProposalBuild(id, { pageRanges: "1-2", template: { file: { name: "t.docx", bytes: TEMPLATE } } }, { readPage: failing, ocrConfirmed: true });
  await startBuildRead(started.id, failing);
  assert.equal((await prisma.socBuild.findUniqueOrThrow({ where: { id: started.id } })).status, "FAILED");
  assert.equal((await versions(id)).length, 0);
  assert.equal((await stepOf(id)).status, "todo");

  assert.ok(await cancelBuildRead(started.id) === false, "a failed read is not cancellable");
  process.env.TYPHOON_API_KEY = "test-key";
  const good = fakeOcr();
  assert.equal(await resumeBuildRead(started.id, good), true);
  delete process.env.TYPHOON_API_KEY;
  await startBuildRead(started.id, good);
  assert.equal((await versions(id)).length, 1);
  await startBuildRead(started.id, good); // a second finish never makes a second version
  assert.equal((await versions(id)).length, 1);
});

test("a build of a Proposal opens for every SOC user, a standalone build still only for its owner and ADMIN", { skip }, async () => {
  const { id } = await proposal();
  const made = (await (await build(id)).json()) as { id: string };
  const teammate = (signedIn = await user());
  await authorizeSocBuild(made.id);
  await assert.rejects(() => authorizeSocBuild(made.id, { write: true }), /NOT_FOUND/, "cancel, resume and delete stay with the owner and ADMIN");
  await assert.rejects(() => deleteSocBuild(made.id), /NOT_FOUND/);
  assert.equal((await listSocBuilds(teammate)).length, 0);
  const download = await buildDownload(new Request("http://t/x"), { params: Promise.resolve({ id: made.id }) });
  assert.equal(download.status, 200);
  signedIn = await user(["expense"]);
  await assert.rejects(() => authorizeSocBuild(made.id));

  signedIn = await user();
  const { createSocBuild } = await import("@/lib/soc-builds");
  const alone = await createSocBuild(await user(), { tor: { name: "TOR.pdf", bytes: TOR }, pageRanges: "1", template: { file: { name: "t.docx", bytes: TEMPLATE } } });
  await assert.rejects(() => authorizeSocBuild(alone.id), /NOT_FOUND/);
  assert.equal(await prisma.socVersion.count({ where: { buildId: alone.id } }), 0, "a standalone build makes no SOC Version");
  signedIn = await user(["soc"], "ADMIN");
  await authorizeSocBuild(alone.id);
});

test("the build's 30-day purge keeps the SOC Version made from it", { skip }, async () => {
  const { id } = await proposal();
  const made = (await (await build(id)).json()) as { id: string };
  const buildRow = await prisma.socBuild.findUniqueOrThrow({ where: { id: made.id } });
  assert.equal(await purgeExpiredSocBuilds(new Date(Date.now() + 31 * 86400000)), 1);
  assert.equal(await prisma.socBuild.count({ where: { id: made.id } }), 0);
  await assert.rejects(() => stat(resolveStorageKey(buildRow.outputStorageKey!)));
  const [version] = await versions(id);
  assert.equal(version.buildId, null);
  assert.equal(version.state, "ready");
  const download = await versionDownload(new Request("http://t/x"), { params: Promise.resolve({ id, versionId: version.id }) });
  assert.equal(download.status, 200);
  assert.equal((await stepOf(id)).status, "done");
});

test("trashing a Proposal stops a build being read; purging it removes its builds' folders and rows; deleting a build keeps its version", { skip }, async () => {
  const { id, owner } = await proposal({ tor: SCANNED_TOR, ocr: true });
  // The first page is held at the OCR; the trash waits for it, so it is let go a moment later.
  let reached!: () => void;
  const atOcr = new Promise<void>((resolve) => { reached = resolve; });
  const held = new Promise<string>((resolve) => atOcr.then(() => setTimeout(() => resolve(TOR_TEXT[0]), 200)));
  const readPage: CellReader = async () => { reached(); return held; };
  const started = await startProposalBuild(id, { pageRanges: "1-2", template: { file: { name: "t.docx", bytes: TEMPLATE } } }, { readPage, ocrConfirmed: true });
  await atOcr;
  await trashProposal(id);
  assert.equal((await prisma.socBuild.findUniqueOrThrow({ where: { id: started.id } })).status, "CANCELLED");
  signedIn = await user();
  await assert.rejects(() => authorizeSocBuild(started.id), /NOT_FOUND/, "a trashed Proposal's build is hidden from other users");
  signedIn = owner;
  assert.ok(await deleteTrashedProposal(id, owner.id));
  assert.equal(await prisma.socBuild.count({ where: { proposalId: id } }), 0);
  await assert.rejects(() => stat(path.join(storageRoot, "builds", started.id)));
  await assert.rejects(() => stat(proposalStorageDir(id)));

  const other = await proposal();
  const made = (await (await build(other.id)).json()) as { id: string };
  signedIn = other.owner;
  await deleteSocBuild(made.id);
  assert.equal((await versions(other.id)).length, 1);
});

test("a build that turned READY while its Proposal was in the trash gets its SOC Version when the Proposal is restored; a Proposal's builds are not in the owner's old list", { skip }, async () => {
  const { id, owner } = await proposal();
  const made = (await (await build(id)).json()) as { id: string };
  assert.equal((await listSocBuilds(owner)).length, 0, "a Proposal's build is listed on its page, not in สร้าง SOC เดิม");
  await prisma.socVersion.deleteMany({ where: { buildId: made.id } }); // as if READY came in the trash
  await trashProposal(id);
  await addMissingBuildVersions(id);
  assert.equal((await versions(id)).length, 0, "no version is added to a Proposal in the trash");
  const { restoreProposal } = await import("@/lib/proposal");
  await restoreProposal(id, owner.id);
  assert.equal((await versions(id)).length, 1);
  assert.equal((await stepOf(id)).status, "done");
});
