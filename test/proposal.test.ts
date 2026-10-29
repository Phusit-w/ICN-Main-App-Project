// Proposal (ADR 0012) lifecycle through its server actions: unique title,
// list visibility, rename/trash rights, restore, purge, derived step statuses.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { createProposalAction, renameProposalAction, trashProposalAction } = await import("@/actions/proposal");
const { restoreProposalAction, purgeProposal } = await import("@/actions/admin");
const { listProposals, getProposalPage, proposalSteps, proposalProgress, proposalStorageDir, purgeExpiredProposals } = await import("@/lib/proposal");
const { SOC_TITLE_INVALID, SOC_TITLE_TAKEN } = await import("@/lib/soc-shared");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "proposal-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

function user(username: string, role = "USER", appAccess = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess } });
}

async function create(owner: Actor, title: string) {
  signedIn = owner;
  const result = await createProposalAction(title);
  assert.ok(result.ok, JSON.stringify(result));
  return result.id;
}

test("a title that matches a live Proposal is refused, ignoring case, edge spaces and doubled spaces; empty and too long too", { skip }, async () => {
  const owner = await user("owner");
  await create(owner, "Udon CASRI");
  for (const title of ["Udon CASRI", "  udon casri ", "UDON   CASRI"]) {
    assert.deepEqual(await createProposalAction(title), { ok: false, error: SOC_TITLE_TAKEN }, title);
  }
  assert.deepEqual(await createProposalAction("   "), { ok: false, error: SOC_TITLE_INVALID });
  assert.deepEqual(await createProposalAction("x".repeat(161)), { ok: false, error: SOC_TITLE_INVALID });
  assert.equal(await prisma.proposal.count(), 1);
});

test("every SOC user sees every Proposal in the list; a user without SOC access is refused", { skip }, async () => {
  const a = await user("a");
  const b = await user("b");
  await create(a, "งาน ก");
  await create(b, "งาน ข");
  signedIn = a;
  const list = await listProposals();
  assert.deepEqual(list.map((p) => p.title).sort(), ["งาน ก", "งาน ข"]);
  assert.deepEqual(list[0].progress, { done: 0, total: 5 });
  assert.equal(list[0].currentVersion, null);
  assert.equal(list[0].waitingCount, 0);

  const outsider = await user("outsider", "USER", ["expense"]);
  signedIn = outsider;
  await assert.rejects(() => listProposals(), /FORBIDDEN/);
  await assert.rejects(() => createProposalAction("งาน ค"), /FORBIDDEN/);
  signedIn = a;
  assert.equal((await getProposalPage((await prisma.proposal.findFirstOrThrow()).id)).canManage, (await prisma.proposal.findFirstOrThrow()).creatorId === a.id);
});

test("rename and trash: creator and ADMIN only, rename under the same uniqueness rule", { skip }, async () => {
  const creator = await user("creator");
  const other = await user("other");
  const admin = await user("admin", "ADMIN");
  const id = await create(creator, "Apron A");
  await create(creator, "Apron B");

  signedIn = other;
  await assert.rejects(() => renameProposalAction(id, "Hijack"), /FORBIDDEN/);
  await assert.rejects(() => trashProposalAction(id), /FORBIDDEN/);
  assert.equal((await getProposalPage(id)).canManage, false);

  signedIn = creator;
  assert.deepEqual(await renameProposalAction(id, "apron b"), { ok: false, error: SOC_TITLE_TAKEN });
  assert.deepEqual(await renameProposalAction(id, "APRON A"), { ok: true, title: "APRON A" }); // own title, re-cased
  assert.deepEqual(await renameProposalAction(id, "Apron C"), { ok: true, title: "Apron C" });

  signedIn = admin;
  assert.deepEqual(await renameProposalAction(id, "Apron D"), { ok: true, title: "Apron D" });
  await trashProposalAction(id);
  const trashed = await prisma.proposal.findUniqueOrThrow({ where: { id } });
  assert.equal(trashed.deletedById, admin.id);
  assert.ok(trashed.purgeAfter && Math.abs(trashed.purgeAfter.getTime() - Date.now() - 30 * 86400000) < 60000);
  assert.deepEqual((await listProposals()).map((p) => p.title), ["Apron B"]);
  await assert.rejects(() => getProposalPage(id), /NOT_FOUND/);
});

test("a trashed Proposal frees its title; restore keeps it or adds a suffix when a live one took it", { skip }, async () => {
  const owner = await user("owner");
  const admin = await user("admin", "ADMIN");
  const id = await create(owner, "Udon");
  await trashProposalAction(id);
  const second = await create(owner, "udon"); // title is free again
  signedIn = admin;
  await restoreProposalAction(id);
  const restored = await prisma.proposal.findUniqueOrThrow({ where: { id } });
  assert.equal(restored.title, "Udon (กู้คืน)");
  assert.equal(restored.deletedAt, null);
  assert.ok(second);
});

test("purge: early by ADMIN, and automatically after 30 days, removes the row and its folder; live ones stay", { skip }, async () => {
  const owner = await user("owner");
  const admin = await user("admin", "ADMIN");
  const early = await create(owner, "Early");
  const late = await create(owner, "Late");
  const live = await create(owner, "Live");
  for (const id of [early, late]) {
    await mkdir(proposalStorageDir(id), { recursive: true });
    await writeFile(path.join(proposalStorageDir(id), "tor.pdf"), "x");
  }

  signedIn = admin;
  await assert.rejects(() => purgeProposal(live), /ถังขยะ/); // not trashed
  await trashProposalAction(early);
  await purgeProposal(early);
  assert.equal(await prisma.proposal.count({ where: { id: early } }), 0);
  await assert.rejects(() => stat(proposalStorageDir(early)));

  await trashProposalAction(late);
  assert.equal(await purgeExpiredProposals(new Date()), 0); // 30 days not over
  assert.equal(await purgeExpiredProposals(new Date(Date.now() + 31 * 86400000)), 1);
  assert.equal(await prisma.proposal.count({ where: { id: late } }), 0);
  await assert.rejects(() => stat(proposalStorageDir(late)));
  assert.equal(await prisma.proposal.count({ where: { id: live } }), 1);
});

test("an empty Proposal has six steps: all ยังไม่ทำ except โครง Content (เร็ว ๆ นี้), progress 0/5", { skip: false }, () => {
  const steps = proposalSteps({});
  assert.deepEqual(steps.map((s) => s.title), ["TOR", "โครง Content", "สร้าง SOC", "กรอกอ้างอิง", "ตรวจ TOR ตรงต้นฉบับ", "ตรวจหลักฐาน"]);
  assert.deepEqual(steps.map((s) => s.status), ["todo", "reserved", "todo", "todo", "todo", "todo"]);
  assert.deepEqual(proposalProgress(steps), { done: 0, total: 5 });
});
