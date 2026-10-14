// Ticket 08 local run setup, on the throwaway soc08-db only (DATABASE_URL on port 51261): a local test
// admin with a runner link (config for runner.py), the skill source with Image Row support as the
// current Skill Package, the MEA Y69 job from the short copies made for ticket 07, and a session
// cookie for the browser check.
//   DATABASE_URL=... node --env-file=.env --experimental-test-module-mocks --import <scratch>/loader.mjs <scratch>/setup08.ts <skill file>
import { mock } from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL?.includes(":51261/")) throw new Error("not the throwaway soc08-db");
const { prisma } = await import("@/lib/prisma");
const { newSocRunnerToken } = await import("@/lib/soc-runner-token");

const admin = await prisma.user.upsert({
  where: { username: "soc08test" }, update: {},
  create: { username: "soc08test", displayName: "SOC 08 test", passwordHash: "x", role: "ADMIN", appAccess: ["soc"] },
});
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => admin } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
const { uploadSocSkillPackage } = await import("@/lib/soc-skill-package");
const { createImportedSocJob } = await import("@/lib/soc");
const { createSessionToken } = await import("@/lib/auth");

const RUNNER_DIR = "C:/Phusit/soc08";
if (!(await prisma.socRunnerLink.count({ where: { userId: admin.id, revokedAt: null } }))) {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: admin.id, tokenHash: createHash("sha256").update(token).digest("hex") } });
  mkdirSync(RUNNER_DIR, { recursive: true });
  writeFileSync(`${RUNNER_DIR}/soc-runner.json`, JSON.stringify({ format: "soc-runner-config/1", serverUrl: "http://localhost:3100", token, username: admin.username }, null, 2));
  console.log("runner config:", `${RUNNER_DIR}/soc-runner.json`);
}

const VERSION = "2026-10-12-images-local";
if (!(await prisma.socSkillPackage.findUnique({ where: { version: VERSION } }))) {
  const uploaded = await uploadSocSkillPackage({ name: "tor-word-compliance-check.skill", bytes: new Uint8Array(readFileSync(process.argv[2])), version: VERSION });
  console.log("skill:", JSON.stringify(uploaded));
}

const files = (root: string): string[] => readdirSync(root).flatMap((name) => {
  const full = path.join(root, name);
  return statSync(full).isDirectory() ? files(full) : [full];
});
const TITLE = "TEST ticket 08 MEA Y69 Image Rows";
let job = await prisma.socJob.findFirst({ where: { title: TITLE, deletedAt: null } });
if (!job) {
  const catalog = "C:/Phusit/soc07/r17/inputs/catalog";
  const evidence = files(catalog).filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => ({ name: `catalog/${path.relative(catalog, f).split(path.sep).join("/")}`, bytes: new Uint8Array(readFileSync(f)) }));
  const id = await createImportedSocJob(admin, { title: TITLE, soc: { name: "MEA SOC.docx", bytes: new Uint8Array(readFileSync("C:/Phusit/soc07/r17/inputs/soc.docx")) }, evidence });
  job = await prisma.socJob.findUniqueOrThrow({ where: { id } });
  console.log("evidence files:", evidence.length);
}
const items = await prisma.socMajorItem.findMany({ where: { jobId: job.id }, orderBy: { position: "asc" } });
console.log("job:", job.id);
console.log("items:", items.map((m) => `${m.label}=${m.rowCount}${m.imageRowCount ? `/img${m.imageRowCount}` : ""}${m.skipped ? "(skip)" : ""}`).join(" "));
writeFileSync(`${RUNNER_DIR}/cookie.txt`, createSessionToken({ userId: admin.id, username: admin.username, displayName: admin.displayName, sessionVersion: admin.sessionVersion }));
await prisma.$disconnect();
