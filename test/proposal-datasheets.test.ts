// The Datasheets of a Proposal (proposal-build ticket 03): batch upload with
// folder paths kept, per-Proposal limits, Citation Name default and edit, and
// removal. Driven through the route and the actions, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildTablePdf } from "@/test/pdf-table-fixture";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: datasheetRoute } = await import("@/app/api/proposals/[id]/datasheets/route");
const { createProposalAction, removeProposalDatasheetAction, renameDatasheetCitationAction } = await import("@/actions/proposal");
const { getProposalPage, proposalStorageDir } = await import("@/lib/proposal");
const { defaultCitationName } = await import("@/lib/proposal-datasheet");
const { MAX_EVIDENCE_FILES } = await import("@/lib/soc-shared");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "proposal-datasheets-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const PDF = buildTablePdf([{ columns: [], rows: [], lines: [{ text: "Datasheet" }] }]);

async function proposal(title = "งาน Datasheet") {
  const owner = await prisma.user.create({ data: { username: `u-${title}`, displayName: "ผู้ใช้", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  signedIn = owner;
  const created = await createProposalAction(title);
  assert.ok(created.ok);
  return { owner, id: created.id };
}

function upload(id: string, files: { name: string; path?: string; bytes?: Uint8Array }[]) {
  const form = new FormData();
  for (const file of files) {
    form.append("evidence", new File([(file.bytes ?? PDF) as BlobPart], file.name));
    form.append("evidencePath", file.path ?? file.name);
  }
  return datasheetRoute(new Request("http://localhost/x", { method: "POST", body: form }), { params: Promise.resolve({ id }) });
}

const listOf = async (id: string) => (await getProposalPage(id)).datasheets;
const filesOf = async (id: string) => (await readdir(proposalStorageDir(id))).length;

test("the default Citation Name drops folders, extension, leading number and anything after ' - '", () => {
  assert.equal(defaultCitationName("08 CASRI Product brochure - surat-1_ab12.pdf"), "CASRI Product brochure");
  assert.equal(defaultCitationName("บทที่ 2/2.5 กล้อง/1. Hikvision DS-2CD.PDF"), "Hikvision DS-2CD");
  assert.equal(defaultCitationName("Switch datasheet.pdf"), "Switch datasheet");
  assert.equal(defaultCitationName("12.pdf"), "12");
});

test("batches add up on the list with folder paths and default Citation Names, and the Proposal page counts them", { skip }, async () => {
  const { id } = await proposal();
  assert.deepEqual(await listOf(id), []);
  const first = await upload(id, [{ name: "a.pdf", path: "บทที่ 2/2.5/08 CASRI Product brochure - surat-1.pdf" }, { name: "b.pdf", path: "b.pdf" }]);
  assert.equal(first.status, 201, JSON.stringify(await first.clone().json()));
  assert.equal((await upload(id, [{ name: "c.pdf", path: "บทที่ 3/c.pdf" }])).status, 201);

  const list = await listOf(id);
  assert.deepEqual(list.map((d) => [d.originalName, d.citationName]), [
    ["b.pdf", "b"], ["บทที่ 2/2.5/08 CASRI Product brochure - surat-1.pdf", "CASRI Product brochure"], ["บทที่ 3/c.pdf", "c"],
  ]);
  assert.equal(list[0].sizeBytes, PDF.byteLength);
  assert.equal(await filesOf(id), 3);
  const row = await prisma.proposalDatasheet.findFirstOrThrow({ where: { proposalId: id } });
  assert.ok(row.storageKey.startsWith(`proposals/${id}/`));
});

test("limits: 200 files and 120 MB per Proposal are refused whole, a non-PDF too, and nothing is stored", { skip }, async () => {
  const { id } = await proposal();
  assert.equal((await upload(id, [{ name: "x.pdf", bytes: new TextEncoder().encode("not a pdf") }])).status, 400);
  assert.equal((await upload(id, [{ name: "empty.pdf", bytes: new Uint8Array() }])).status, 400);
  const big = new Uint8Array(120 * 1024 * 1024 + 1);
  assert.equal((await upload(id, [{ name: "big.pdf", bytes: big }])).status, 400);
  assert.equal((await upload(id, [])).status, 400);
  assert.deepEqual(await listOf(id), []);
  await assert.rejects(() => stat(proposalStorageDir(id)), "nothing stored");

  // The 200-file cap counts what the Proposal already holds.
  await prisma.proposalDatasheet.createMany({
    data: Array.from({ length: MAX_EVIDENCE_FILES - 1 }, (_, i) => ({ proposalId: id, originalName: `f${i}.pdf`, citationName: `f${i}`, storageKey: `proposals/${id}/seed-${i}.pdf`, sizeBytes: 10, checksum: "x", uploadedById: signedIn!.id })),
  });
  const over = await upload(id, [{ name: "one.pdf" }, { name: "two.pdf" }]);
  assert.equal(over.status, 400);
  assert.match(((await over.json()) as { error: string }).error, /200/);
  assert.equal((await listOf(id)).length, MAX_EVIDENCE_FILES - 1);
  assert.equal((await upload(id, [{ name: "last.pdf" }])).status, 201);
});

test("the 1 GB total counts what the Proposal already holds", { skip }, async () => {
  const { id } = await proposal();
  await prisma.proposalDatasheet.create({ data: { proposalId: id, originalName: "huge.pdf", citationName: "huge", storageKey: `proposals/${id}/huge.pdf`, sizeBytes: 1024 * 1024 * 1024 - 10, checksum: "x", uploadedById: signedIn!.id } });
  const response = await upload(id, [{ name: "a.pdf" }]);
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /1 GB/);
});

test("the Citation Name can be edited; an empty or over-long name is refused", { skip }, async () => {
  const { id } = await proposal();
  await upload(id, [{ name: "08 Brand - x.pdf" }]);
  const [datasheet] = await listOf(id);
  assert.deepEqual(await renameDatasheetCitationAction(id, datasheet.id, "  Brand Datasheet  "), { ok: true, name: "Brand Datasheet" });
  assert.equal((await listOf(id))[0].citationName, "Brand Datasheet");
  assert.equal((await renameDatasheetCitationAction(id, datasheet.id, "   ")).ok, false);
  assert.equal((await renameDatasheetCitationAction(id, datasheet.id, "x".repeat(121))).ok, false);
  assert.equal((await listOf(id))[0].citationName, "Brand Datasheet");
  const other = await proposal("อีกงาน");
  await assert.rejects(() => renameDatasheetCitationAction(other.id, datasheet.id, "Hijack"), /NOT_FOUND/);
});

test("removing a Datasheet takes it off the list at once and deletes its file; another Proposal's Datasheet is untouched", { skip }, async () => {
  const { id } = await proposal();
  await upload(id, [{ name: "a.pdf" }, { name: "b.pdf" }]);
  const [a, b] = await listOf(id);
  const key = (await prisma.proposalDatasheet.findUniqueOrThrow({ where: { id: a.id } })).storageKey;
  await removeProposalDatasheetAction(id, a.id);
  assert.deepEqual((await listOf(id)).map((d) => d.id), [b.id]);
  assert.equal(await filesOf(id), 1);
  await assert.rejects(() => stat(path.join(storageRoot, ...key.split("/"))));

  const other = await proposal("อีกงาน 2");
  await assert.rejects(() => removeProposalDatasheetAction(other.id, b.id), /NOT_FOUND/);
  assert.equal((await listOf(id)).length, 1);
});

test("any SOC user may add; a user without SOC access and an unknown Proposal are refused; trashing and purging removes the files", { skip }, async () => {
  const { id, owner } = await proposal();
  signedIn = await prisma.user.create({ data: { username: "teammate", displayName: "เพื่อน", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  assert.equal((await upload(id, [{ name: "a.pdf" }])).status, 201);
  signedIn = await prisma.user.create({ data: { username: "outsider", displayName: "x", passwordHash: "x", role: "USER", appAccess: ["expense"] } });
  assert.equal((await upload(id, [{ name: "b.pdf" }])).status, 403);
  signedIn = owner;
  assert.equal((await upload("no-such-proposal", [{ name: "b.pdf" }])).status, 404);

  const { deleteTrashedProposal, trashProposal } = await import("@/lib/proposal");
  await trashProposal(id);
  assert.equal((await upload(id, [{ name: "c.pdf" }])).status, 404);
  assert.ok(await deleteTrashedProposal(id, owner.id));
  assert.equal(await prisma.proposalDatasheet.count({ where: { proposalId: id } }), 0);
  await assert.rejects(() => stat(proposalStorageDir(id)));
});
