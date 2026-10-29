// Synonyms for Categories and Work Types (.scratch/question-search issue 01):
// kept by admins in Admin Center beside the labels, and used by the ordinary
// keyword search on ค้นหาโครงการ with the same matching rules as the labels.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }), redirect: () => { throw new Error("REDIRECT"); } } });

const { setProjectCardTermSynonyms, createProjectCardTerm, renameProjectCardTerm } = await import("@/actions/projectCardTerms");
const { default: ProjectCardPage } = await import("@/app/(app)/project-card/page");

async function signIn(role: "ADMIN" | "USER" = "ADMIN") {
  signedIn = await prisma.user.create({
    data: { username: `u-${role}`, passwordHash: "x", displayName: "ผู้ใช้", role, appAccess: ["project-card"] },
  });
}

async function seedTerms() {
  await prisma.projectCardTerm.createMany({
    data: [
      { kind: "category", value: "fiber-optic", en: "Fiber Optic", th: "เคเบิลใยแก้วนำแสง", sortOrder: 10 },
      { kind: "category", value: "data-center-it", en: "Data Center & IT", th: "ศูนย์ข้อมูลและไอที", sortOrder: 20 },
      { kind: "workType", value: "ma", en: "MA (Maintenance)", th: "บำรุงรักษา (MA)", sortOrder: 10 },
      { kind: "workType", value: "managed-services", en: "Managed Services", th: "บริการบริหารจัดการระบบ", sortOrder: 20 },
    ],
  });
  const term = (value: string) => prisma.projectCardTerm.findFirstOrThrow({ where: { value } });
  return { fiber: await term("fiber-optic"), dc: await term("data-center-it"), ma: await term("ma") };
}

async function seedCards() {
  await prisma.projectCard.createMany({
    data: [
      { projectCode: "C001", client: "PEA", projectName: "โครงการ A", descriptionTh: "", descriptionEn: "", category: "fiber-optic" },
      { projectCode: "C002", client: "PEA", projectName: "โครงการ B", descriptionTh: "", descriptionEn: "", category: "data-center-it", tags: ["fiber-optic"] },
      { projectCode: "C003", client: "NT", projectName: "โครงการ C", descriptionTh: "", descriptionEn: "", workTypes: ["ma"] },
      { projectCode: "C004", client: "NT", projectName: "โครงการ D", descriptionTh: "", descriptionEn: "", workTypes: ["managed-services"] },
    ],
  });
}

async function codesFor(q: string) {
  const html = renderToStaticMarkup(await ProjectCardPage({ searchParams: Promise.resolve({ q }) }));
  // Cards shown as nearby (test/project-card-nearby.test.ts) aren't matches.
  if (html.includes("ไม่พบโครงการที่ตรงทุกเงื่อนไข")) return [];
  return ["C001", "C002", "C003", "C004"].filter((code) => html.includes(code));
}

test("an admin sets, changes and removes an entry's synonyms", { skip }, async () => {
  await signIn();
  const { fiber } = await seedTerms();
  assert.deepEqual(await setProjectCardTermSynonyms(fiber.id, [" ไฟเบอร์ ", "fibre"]), { ok: true });
  assert.deepEqual((await prisma.projectCardTerm.findUniqueOrThrow({ where: { id: fiber.id } })).synonyms, ["ไฟเบอร์", "fibre"]);
  assert.deepEqual(await setProjectCardTermSynonyms(fiber.id, ["fiber"]), { ok: true });
  assert.deepEqual((await prisma.projectCardTerm.findUniqueOrThrow({ where: { id: fiber.id } })).synonyms, ["fiber"]);
  assert.deepEqual(await setProjectCardTermSynonyms(fiber.id, []), { ok: true });
  assert.deepEqual((await prisma.projectCardTerm.findUniqueOrThrow({ where: { id: fiber.id } })).synonyms, []);
  const audits = await prisma.auditLog.findMany({ where: { action: "PROJECT_CARD_TERM_SYNONYMS_CHANGED" } });
  assert.equal(audits.length, 3);
});

test("blank and duplicate synonyms are rejected and nothing is saved", { skip }, async () => {
  await signIn();
  const { fiber, dc } = await seedTerms();
  await prisma.projectCardTerm.update({ where: { id: dc.id }, data: { synonyms: ["datacenter"] } });
  for (const bad of [
    ["ไฟเบอร์", "  "],
    ["fibre", "Fibre"],
    ["fiber optic"], // its own English label
    ["ศูนย์ข้อมูลและไอที"], // another entry's Thai label
    ["DataCenter"], // another entry's synonym
  ]) {
    const result = await setProjectCardTermSynonyms(fiber.id, bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
  }
  assert.deepEqual((await prisma.projectCardTerm.findUniqueOrThrow({ where: { id: fiber.id } })).synonyms, []);
});

test("a new entry may not take another entry's synonym as its label", { skip }, async () => {
  await signIn();
  const { fiber } = await seedTerms();
  await prisma.projectCardTerm.update({ where: { id: fiber.id }, data: { synonyms: ["fibre"] } });
  const result = await createProjectCardTerm({ kind: "category", en: "Fibre", th: "ไฟเบอร์ใหม่" });
  assert.equal(result.ok, false);
  // Nor may an entry be renamed to one of its own synonyms.
  assert.equal((await renameProjectCardTerm(fiber.id, { en: "FIBRE", th: fiber.th })).ok, false);
  assert.equal((await prisma.projectCardTerm.findUniqueOrThrow({ where: { id: fiber.id } })).en, "Fiber Optic");
});

test("only an admin can change synonyms", { skip }, async () => {
  await signIn("USER");
  const { fiber } = await seedTerms();
  await assert.rejects(() => setProjectCardTermSynonyms(fiber.id, ["fibre"]));
  assert.deepEqual((await prisma.projectCardTerm.findUniqueOrThrow({ where: { id: fiber.id } })).synonyms, []);
});

test("the keyword search finds a card by a synonym of its Category, Tag or Work Type", { skip }, async () => {
  await signIn("USER");
  const { fiber, ma } = await seedTerms();
  await prisma.projectCardTerm.update({ where: { id: fiber.id }, data: { synonyms: ["ไฟเบอร์", "fibre"] } });
  await prisma.projectCardTerm.update({ where: { id: ma.id }, data: { synonyms: ["ma", "ซ่อมบำรุง", "maintenance"] } });
  await seedCards();

  assert.deepEqual(await codesFor("ไฟเบอร์"), ["C001", "C002"]); // Thai: anywhere
  assert.deepEqual(await codesFor("งานไฟเบอร์"), []); // …but the query must be within the synonym
  assert.deepEqual(await codesFor("FIBRE"), ["C001", "C002"]); // Latin: case-insensitive
  assert.deepEqual(await codesFor("fib"), ["C001", "C002"]); // Category: word prefix
  assert.deepEqual(await codesFor("ซ่อมบำรุง"), ["C003"]);
  assert.deepEqual(await codesFor("maint"), ["C003"]); // Work Type: prefix from 3 letters
  assert.deepEqual(await codesFor("ma"), ["C003"]); // 1–2 letters must be a whole word: not Managed Services
});

test("without synonyms the keyword search behaves as before", { skip }, async () => {
  await signIn("USER");
  await seedTerms();
  await seedCards();
  assert.deepEqual(await codesFor("ไฟเบอร์"), []);
  assert.deepEqual(await codesFor("ใยแก้ว"), ["C001", "C002"]);
  assert.deepEqual(await codesFor("fiber"), ["C001", "C002"]);
  assert.deepEqual(await codesFor("ma"), ["C003"]);
  assert.deepEqual(await codesFor("manag"), ["C004"]);
});
