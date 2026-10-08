// Hosting versioned SOC skill packages (ADR 0008, ticket 11): an admin
// uploads a package, lists the versions and marks one current; the package
// the server keeps (and serves to SOC Runners) carries the headless step-0
// instruction. Driven through the lib functions and the admin routes with the
// signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildZip } from "@/test/docx-fixture";
import { readZip } from "@/lib/zip";
import { skillVersionStatus } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { prepareServedPackage, uploadSocSkillPackage, listSocSkillPackages, setCurrentSocSkillPackage, currentSocSkillPackage, HEADLESS_FILE } = await import("@/lib/soc-skill-package");
const { POST: uploadRoute } = await import("@/app/api/admin/soc-skills/route");
const { GET: downloadRoute } = await import("@/app/api/admin/soc-skills/[id]/route");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const SKILL_MD = "---\nname: \"tor-word-compliance-check\"\ndescription: \"ตรวจ TOR/SOC\"\n---\n\n# TOR/SOC Word Compliance Check\n\n0. **ก่อนเริ่มตรวจ**: ... ต้องแจ้งผู้ใช้ทันทีว่าเอกสารใดขาดหาย\n";
const SCRIPT = "print('append')\n";

function skillZip(root = "tor-word-compliance-check/", extra: Record<string, string> = {}) {
  return buildZip({ [`${root}SKILL.md`]: SKILL_MD, [`${root}scripts/append_results_to_docx.py`]: SCRIPT, ...extra }, { deflate: true });
}

const entryText = (zip: Uint8Array, name: string) => {
  const entry = readZip(zip).find((e) => e.name === name);
  return entry ? entry.data.toString("utf8") : undefined;
};

function user(username: string, role = "USER", appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess } });
}

function uploadRequest(bytes: Uint8Array, version = "", name = "tor-word-compliance-check.skill") {
  const form = new FormData();
  form.set("package", new File([Buffer.from(bytes)], name));
  form.set("version", version);
  return new Request("http://localhost/api/admin/soc-skills", { method: "POST", body: form });
}

// ---- The served package ---------------------------------------------------

test("the served package adds the headless step-0 instruction and keeps every other file", () => {
  const served = prepareServedPackage(skillZip());
  assert.equal(served.rootDir, "tor-word-compliance-check/");
  const headless = entryText(served.bytes, `tor-word-compliance-check/${HEADLESS_FILE}`);
  assert.ok(headless, "HEADLESS.md is in the package next to SKILL.md");
  assert.match(headless, /missing_documents\.json/);
  // The packet flow's page-by-page reading holds under the runner too (soc-evidence-packet 10).
  assert.match(headless, /evidence_packet[\s\S]*page_file/);
  assert.match(headless, /SOC_RUNNER_HEADLESS/);

  const skill = entryText(served.bytes, "tor-word-compliance-check/SKILL.md")!;
  assert.ok(skill.startsWith("---\nname: \"tor-word-compliance-check\""), "frontmatter stays first");
  assert.match(skill, new RegExp(HEADLESS_FILE.replace(".", "\\.")), "SKILL.md points to HEADLESS.md");
  assert.ok(skill.indexOf(HEADLESS_FILE) > skill.indexOf("\n---\n"), "the note is after the frontmatter");
  assert.ok(skill.includes("# TOR/SOC Word Compliance Check"), "the skill's own text is kept");
  assert.equal(entryText(served.bytes, "tor-word-compliance-check/scripts/append_results_to_docx.py"), SCRIPT);
});

test("preparing an already-served package changes nothing", () => {
  const once = prepareServedPackage(skillZip());
  const twice = prepareServedPackage(once.bytes);
  assert.deepEqual(readZip(twice.bytes).map((e) => [e.name, e.data.toString("utf8")]), readZip(once.bytes).map((e) => [e.name, e.data.toString("utf8")]));
});

test("a package with SKILL.md at the zip root is served with the instruction at the root", () => {
  const served = prepareServedPackage(skillZip(""));
  assert.equal(served.rootDir, "");
  assert.ok(entryText(served.bytes, HEADLESS_FILE));
});

test("a file that is not a skill package is refused", () => {
  assert.throws(() => prepareServedPackage(new TextEncoder().encode("not a zip")), /zip/);
  assert.throws(() => prepareServedPackage(buildZip({ "readme.txt": "x" })), /SKILL\.md/);
  assert.throws(() => prepareServedPackage(buildZip({ "a/SKILL.md": SKILL_MD, "b/SKILL.md": SKILL_MD })), /SKILL\.md/);
  assert.throws(() => prepareServedPackage(skillZip("skill/", { "skill/../../evil.py": "x" })), /ชื่อไฟล์/);
  assert.throws(() => prepareServedPackage(skillZip("skill/", { "/etc/evil": "x" })), /ชื่อไฟล์/);
});

test("a corrupt package (a file's bytes don't match its CRC) is refused", () => {
  const zip = buildZip({ "skill/SKILL.md": SKILL_MD });
  const corrupt = new Uint8Array(zip);
  corrupt[30 + "skill/SKILL.md".length] ^= 0xff; // first byte of the stored SKILL.md
  assert.throws(() => prepareServedPackage(corrupt), /zip/);
});

// ---- Upload, list, set-current -----------------------------------------------

test("the first upload becomes current; later uploads wait until an admin sets them", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  const v1 = await uploadSocSkillPackage({ name: "skill-v1.skill", bytes: skillZip(), version: "v1" });
  assert.ok(v1.ok, JSON.stringify(v1));
  assert.equal(v1.isCurrent, true);
  const v2 = await uploadSocSkillPackage({ name: "skill-v2.skill", bytes: skillZip("tor-word-compliance-check/", { "tor-word-compliance-check/references/new.md": "ใหม่" }), version: "v2" });
  assert.ok(v2.ok);
  assert.equal(v2.isCurrent, false);

  const list = await listSocSkillPackages();
  assert.deepEqual(list.map((p) => [p.version, p.isCurrent]), [["v2", false], ["v1", true]]);
  assert.equal(list[0].uploadedByName, "admin");
  assert.equal((await currentSocSkillPackage())?.version, "v1");
});

test("setting a version current leaves exactly one current, and is audited", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  await uploadSocSkillPackage({ name: "a.skill", bytes: skillZip(), version: "v1" });
  const v2 = await uploadSocSkillPackage({ name: "b.skill", bytes: skillZip(), version: "v2" });
  assert.ok(v2.ok);

  assert.deepEqual(await setCurrentSocSkillPackage(v2.id), { ok: true });
  let list = await listSocSkillPackages();
  assert.deepEqual(list.filter((p) => p.isCurrent).map((p) => p.version), ["v2"]);
  assert.equal((await currentSocSkillPackage())?.version, "v2");

  const v1 = list.find((p) => p.version === "v1")!;
  assert.deepEqual(await setCurrentSocSkillPackage(v1.id), { ok: true });
  list = await listSocSkillPackages();
  assert.deepEqual(list.filter((p) => p.isCurrent).map((p) => p.version), ["v1"]);

  const audit = await prisma.auditLog.findMany({ where: { action: "SOC_SKILL_SET_CURRENT" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(audit.map((a) => (a.metadata as { version: string }).version), ["v2", "v1"]);
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_SKILL_UPLOADED" } }), 2);
});

test("setting an unknown package current is refused and changes nothing", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  await uploadSocSkillPackage({ name: "a.skill", bytes: skillZip(), version: "v1" });
  const result = await setCurrentSocSkillPackage("no-such-id");
  assert.equal(result.ok, false);
  assert.equal((await currentSocSkillPackage())?.version, "v1");
});

test("a version already uploaded is refused", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  await uploadSocSkillPackage({ name: "a.skill", bytes: skillZip(), version: "v1" });
  const again = await uploadSocSkillPackage({ name: "b.skill", bytes: skillZip(), version: "v1" });
  assert.equal(again.ok, false);
  assert.equal(await prisma.socSkillPackage.count(), 1);
});

test("a blank version is named after the uploaded file's sha256", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  const bytes = skillZip();
  const uploaded = await uploadSocSkillPackage({ name: "a.skill", bytes, version: " " });
  assert.ok(uploaded.ok);
  assert.equal(uploaded.version, `sha256:${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`);
});

test("the stored package is the served one, with the headless instruction", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  const uploaded = await uploadSocSkillPackage({ name: "a.skill", bytes: skillZip(), version: "v1" });
  assert.ok(uploaded.ok);
  const response = await downloadRoute(new Request(`http://localhost/api/admin/soc-skills/${uploaded.id}`), { params: Promise.resolve({ id: uploaded.id }) });
  assert.equal(response.status, 200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(entryText(bytes, `tor-word-compliance-check/${HEADLESS_FILE}`));
  const stored = await prisma.socSkillPackage.findUniqueOrThrow({ where: { id: uploaded.id } });
  assert.equal(stored.checksum, createHash("sha256").update(bytes).digest("hex"));
});

// ---- Access -------------------------------------------------------------------

test("only ADMIN may upload, list, set current or download", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  const uploaded = await uploadSocSkillPackage({ name: "a.skill", bytes: skillZip(), version: "v1" });
  assert.ok(uploaded.ok);

  signedIn = await user("reviewer", "USER", ["soc"]);
  await assert.rejects(uploadSocSkillPackage({ name: "b.skill", bytes: skillZip(), version: "v2" }), /FORBIDDEN/);
  await assert.rejects(listSocSkillPackages(), /FORBIDDEN/);
  await assert.rejects(setCurrentSocSkillPackage(uploaded.id), /FORBIDDEN/);
  assert.equal((await uploadRoute(uploadRequest(skillZip(), "v3"))).status, 403);
  assert.equal((await downloadRoute(new Request("http://localhost/"), { params: Promise.resolve({ id: uploaded.id }) })).status, 403);
  assert.equal(await prisma.socSkillPackage.count(), 1);

  signedIn = null;
  assert.equal((await uploadRoute(uploadRequest(skillZip(), "v4"))).status, 401);
  assert.equal((await downloadRoute(new Request("http://localhost/"), { params: Promise.resolve({ id: uploaded.id }) })).status, 401);
});

test("the upload route stores a package for ADMIN and explains a bad one", { skip }, async () => {
  signedIn = await user("admin", "ADMIN");
  const created = await uploadRoute(uploadRequest(skillZip(), "v1"));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).version, "v1");

  const bad = await uploadRoute(uploadRequest(buildZip({ "readme.txt": "x" }), "v2"));
  assert.equal(bad.status, 422);
  assert.match((await bad.json()).error, /SKILL\.md/);
  assert.equal(await prisma.socSkillPackage.count(), 1);
});

// ---- Major items vs the current version ------------------------------------------

test("a major item's skill version is compared with the current one by upload order", () => {
  const packages = [
    { version: "v1", createdAt: new Date("2026-10-01") },
    { version: "v2", createdAt: new Date("2026-10-02") },
    { version: "v3", createdAt: new Date("2026-10-03") },
  ];
  assert.equal(skillVersionStatus("v2", packages, "v2"), "current");
  assert.equal(skillVersionStatus("v1", packages, "v2"), "older");
  assert.equal(skillVersionStatus("v3", packages, "v2"), "newer");
  assert.equal(skillVersionStatus("sha256:abc", packages, "v2"), "unhosted");
  assert.equal(skillVersionStatus(null, packages, "v2"), null);
  assert.equal(skillVersionStatus("v1", [], null), null);
});
