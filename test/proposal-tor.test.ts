// The TOR step of a Proposal (proposal-build ticket 02): upload, replace, a
// scanned TOR needing the OCR confirm, the TOR step's status and its download.
// Driven through the route, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: torRoute, GET: torDownload } = await import("@/app/api/proposals/[id]/tor/route");
const { createProposalAction } = await import("@/actions/proposal");
const { getProposalPage, listProposals, proposalStorageDir } = await import("@/lib/proposal");
const { OCR_NOT_SET_UP } = await import("@/lib/soc-typhoon");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "proposal-tor-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => {
  delete process.env.TYPHOON_API_KEY;
  return rm(storageRoot, { recursive: true, force: true });
});

const textPage = (n: number): TablePage => ({ columns: [], rows: [], lines: [`${n}. ระบบกล้องวงจรปิด`, `${n}.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล`].map((text) => ({ text })) });
const TEXT_TOR = (pages: number) => buildTablePdf(Array.from({ length: pages }, (_, i) => textPage(i + 1)));
const SCANNED_TOR = buildTablePdf([{ columns: [], rows: [], scanned: true }]);

async function proposal(title = "งาน TOR") {
  const owner = await prisma.user.create({ data: { username: `u-${title}`, displayName: "ผู้ใช้", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  signedIn = owner;
  const created = await createProposalAction(title);
  assert.ok(created.ok);
  return { owner, id: created.id };
}

function upload(id: string, bytes: Uint8Array | null, { name = "TOR.pdf", confirmed = false } = {}) {
  const form = new FormData();
  if (bytes) form.set("tor", new File([bytes as BlobPart], name));
  if (confirmed) form.set("ocrConfirmed", "1");
  return torRoute(new Request("http://localhost/api/proposals/x/tor", { method: "POST", body: form }), { params: Promise.resolve({ id }) });
}

const torStep = async (id: string) => (await getProposalPage(id)).steps[0];
const filesOf = async (id: string) => (await readdir(proposalStorageDir(id))).length;

test("a text TOR is stored in the Proposal's folder, the step turns เสร็จ with 'ชื่อไฟล์ · N หน้า', and the page shows the chip", { skip }, async () => {
  const { id } = await proposal();
  assert.equal((await torStep(id)).status, "todo");

  const response = await upload(id, TEXT_TOR(3), { name: "โฟลเดอร์/TOR ลูกค้า.pdf" });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const row = await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } });
  assert.equal(row.pageCount, 3);
  assert.equal(row.scanned, false);
  assert.ok(row.storageKey.startsWith(`proposals/${id}/`));
  assert.equal(await filesOf(id), 1);

  const page = await getProposalPage(id);
  assert.equal(page.steps[0].status, "done");
  assert.equal(page.steps[0].now, "TOR ลูกค้า.pdf · 3 หน้า");
  assert.deepEqual(page.tor, { name: "โฟลเดอร์/TOR ลูกค้า.pdf", pageCount: 3, scanned: false });
  assert.deepEqual((await listProposals())[0].progress, { done: 1, total: 5 });

  const download = await torDownload(new Request("http://localhost/x"), { params: Promise.resolve({ id }) });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
});

test("replacing the TOR keeps one current TOR and deletes the old file", { skip }, async () => {
  const { id } = await proposal();
  assert.equal((await upload(id, TEXT_TOR(2), { name: "เก่า.pdf" })).status, 201);
  const oldKey = (await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } })).storageKey;
  assert.equal((await upload(id, TEXT_TOR(5), { name: "ใหม่.pdf" })).status, 201);

  assert.equal(await prisma.proposalTor.count({ where: { proposalId: id } }), 1);
  const row = await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } });
  assert.equal(row.originalName, "ใหม่.pdf");
  assert.equal(row.pageCount, 5);
  assert.notEqual(row.storageKey, oldKey);
  assert.equal(await filesOf(id), 1);
  await assert.rejects(() => stat(path.join(storageRoot, ...oldKey.split("/"))));
});

test("a scanned TOR is refused without OCR set up, then without the confirm, and stored after the confirm", { skip }, async () => {
  const { id } = await proposal();
  delete process.env.TYPHOON_API_KEY;
  const noOcr = await upload(id, SCANNED_TOR, { confirmed: true });
  assert.equal(noOcr.status, 400);
  assert.deepEqual(await noOcr.json(), { error: OCR_NOT_SET_UP });

  process.env.TYPHOON_API_KEY = "test-key";
  const unconfirmed = await upload(id, SCANNED_TOR);
  assert.equal(unconfirmed.status, 409);
  assert.equal(((await unconfirmed.json()) as { needsOcrConfirm: boolean }).needsOcrConfirm, true);
  assert.equal(await prisma.proposalTor.count({ where: { proposalId: id } }), 0);
  await assert.rejects(() => stat(proposalStorageDir(id)), "nothing stored without the confirm");

  assert.equal((await upload(id, SCANNED_TOR, { confirmed: true })).status, 201);
  const row = await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } });
  assert.equal(row.scanned, true);
  assert.equal((await torStep(id)).status, "done");
});

test("a file that is not a PDF, an empty form, and a user without SOC access are refused; a failed replace keeps the old TOR", { skip }, async () => {
  const { id, owner } = await proposal();
  assert.equal((await upload(id, TEXT_TOR(1))).status, 201);
  const keep = await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } });

  assert.equal((await upload(id, new TextEncoder().encode("not a pdf"), { name: "x.pdf" })).status, 400);
  assert.equal((await upload(id, null)).status, 400);
  assert.equal((await upload(id, new Uint8Array(), { name: "empty.pdf" })).status, 400);
  assert.equal((await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } })).storageKey, keep.storageKey);

  signedIn = await prisma.user.create({ data: { username: "outsider", displayName: "x", passwordHash: "x", role: "USER", appAccess: ["expense"] } });
  assert.equal((await upload(id, TEXT_TOR(1))).status, 403);
  assert.equal((await torDownload(new Request("http://localhost/x"), { params: Promise.resolve({ id }) })).status, 404);

  signedIn = owner;
  assert.equal((await upload("no-such-proposal", TEXT_TOR(1))).status, 404);
});

test("any SOC user may upload or replace the TOR of another user's Proposal", { skip }, async () => {
  const { id } = await proposal();
  signedIn = await prisma.user.create({ data: { username: "teammate", displayName: "เพื่อน", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  assert.equal((await upload(id, TEXT_TOR(2))).status, 201);
});
