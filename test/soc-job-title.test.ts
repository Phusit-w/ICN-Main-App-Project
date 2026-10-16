// Job Title (docs/SOC-DOMAIN-GLOSSARY.md): unique among live jobs at upload
// and at rename, renamable by the owner or an ADMIN, kept apart from the trash.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildSocDocx } from "@/test/docx-fixture";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: createJob } = await import("@/app/api/soc/jobs/route");
const { renameSocJobAction, trashSocJob } = await import("@/actions/soc");
const { restoreSocJob } = await import("@/actions/admin");
const { SOC_TITLE_INVALID, SOC_TITLE_TAKEN } = await import("@/lib/soc");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-title-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const SOC = buildSocDocx([
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"],
  ["๑.", "ระบบเฝ้าระวัง", "", ""],
  ["๑.๑", "กล้อง", "CASRI", "หน้า 3"],
]);
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");

function user(username: string, role = "USER") {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess: ["soc"] } });
}

async function upload(owner: Actor, title: string) {
  signedIn = owner;
  const form = new FormData();
  form.set("title", title);
  form.set("soc", new File([SOC], "SOC.docx"));
  form.append("evidence", new File([PDF], "a.pdf"));
  return createJob(new Request("http://localhost/api/soc/jobs", { method: "POST", body: form }));
}

async function create(owner: Actor, title: string) {
  const response = await upload(owner, title);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return ((await response.json()) as { id: string }).id;
}

const titleOf = async (id: string) => (await prisma.socJob.findUniqueOrThrow({ where: { id } })).title;

test("an upload whose title matches a live job is refused, ignoring case, edge spaces and doubled spaces", { skip }, async () => {
  const owner = await user("owner");
  await create(owner, "Udon CASRI");
  const other = await user("other");
  for (const title of ["Udon CASRI", "  udon casri ", "UDON   CASRI"]) {
    const response = await upload(other, title);
    assert.equal(response.status, 400, title);
    assert.deepEqual(await response.json(), { error: SOC_TITLE_TAKEN });
  }
  assert.equal(await prisma.socJob.count(), 1);
  await create(other, "Udon CASRI 2");
});

test("an empty or over-160-character title is refused", { skip }, async () => {
  const owner = await user("owner");
  for (const title of ["   ", "x".repeat(161)]) {
    const response = await upload(owner, title);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: SOC_TITLE_INVALID });
  }
});

test("the owner renames a job; the audit trail keeps the old and new title", { skip }, async () => {
  const owner = await user("owner");
  const id = await create(owner, "Old name");
  assert.deepEqual(await renameSocJobAction(id, "  New   name "), { ok: true, title: "New   name" });
  assert.equal(await titleOf(id), "New   name");
  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId: id, action: "JOB_RENAMED" } });
  assert.deepEqual(event.detail, { from: "Old name", to: "New   name" });
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_RENAMED", entityId: id } }), 1);
});

test("renaming to a title another live job has is refused and changes nothing", { skip }, async () => {
  const owner = await user("owner");
  const a = await create(owner, "Alpha");
  await create(owner, "Beta");
  assert.deepEqual(await renameSocJobAction(a, "bETA "), { ok: false, error: SOC_TITLE_TAKEN });
  assert.equal(await titleOf(a), "Alpha");
  assert.deepEqual(await renameSocJobAction(a, "  "), { ok: false, error: SOC_TITLE_INVALID });
});

test("a job may change the case of its own title, and keeping it is not a clash", { skip }, async () => {
  const owner = await user("owner");
  const id = await create(owner, "Alpha");
  assert.deepEqual(await renameSocJobAction(id, "ALPHA"), { ok: true, title: "ALPHA" });
  assert.deepEqual(await renameSocJobAction(id, "ALPHA"), { ok: true, title: "ALPHA" });
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId: id, action: "JOB_RENAMED" } }), 1);
});

test("only the owner or an ADMIN renames, and a job in the trash cannot be renamed", { skip }, async () => {
  const owner = await user("owner");
  const id = await create(owner, "Alpha");
  signedIn = await user("stranger");
  await assert.rejects(renameSocJobAction(id, "Hijack"), /FORBIDDEN/);
  signedIn = await user("boss", "ADMIN");
  assert.equal((await renameSocJobAction(id, "By admin")).ok, true);
  signedIn = owner;
  await trashSocJob(id);
  await assert.rejects(renameSocJobAction(id, "Late"), /NOT_FOUND/);
  assert.equal(await titleOf(id), "By admin");
});

test("a trashed job does not hold its title; restoring it into a clash adds a suffix", { skip }, async () => {
  const owner = await user("owner");
  const first = await create(owner, "Alpha");
  await trashSocJob(first);
  const second = await create(owner, "alpha");
  const admin = await user("boss", "ADMIN");
  signedIn = admin;
  await restoreSocJob(first);
  assert.equal(await titleOf(first), "Alpha (กู้คืน)");
  assert.equal(await titleOf(second), "alpha");

  const gone = await create(owner, "Beta");
  await trashSocJob(gone);
  await create(owner, "Beta");
  await create(owner, "Beta (กู้คืน)");
  signedIn = admin;
  await restoreSocJob(gone);
  assert.equal(await titleOf(gone), "Beta (กู้คืน 2)");
});

test("restoring a job whose title is free keeps the title", { skip }, async () => {
  const owner = await user("owner");
  const id = await create(owner, "Alpha");
  await trashSocJob(id);
  signedIn = await user("boss", "ADMIN");
  await restoreSocJob(id);
  assert.equal(await titleOf(id), "Alpha");
});
