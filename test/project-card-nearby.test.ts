// Nearby cards on ค้นหาโครงการ: when no card meets every condition, the page
// shows the cards of the first looser search that finds some, says what was
// loosened, and links to that search — for the ordinary search and Question
// Search alike, without asking the model.
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

const { default: ProjectCardPage } = await import("@/app/(app)/project-card/page");

async function seed() {
  signedIn = await prisma.user.create({
    data: { username: "viewer", passwordHash: "x", displayName: "ผู้ค้น", appAccess: ["project-card"] },
  });
  const card = (projectCode: string, client: string, projectName: string, millions: number, year: number) => ({
    projectCode, client, projectName, descriptionTh: "", descriptionEn: "", budgetAmount: millions * 1_000_000, year,
  });
  await prisma.projectCard.createMany({
    data: [
      card("CAT025", "CAT", "โครงการ USO พร้อมเครื่องคอมพิวเตอร์ประจำศูนย์", 2427, 2023),
      card("WW003", "TRUE", "ปรับปรุงศูนย์ข้อมูล server True IDC", 156, 2021),
      card("PEA001", "PEA", "ขายสายเคเบิลใยแก้วนำแสง", 47, 2024),
    ],
  });
}

async function pageHtml(searchParams: Record<string, string>) {
  return renderToStaticMarkup(await ProjectCardPage({ searchParams: Promise.resolve(searchParams) }));
}

const NEARBY = /ไม่พบโครงการที่ตรงทุกเงื่อนไข/;

test("a keyword that finds nothing is shortened word by word; the other filters stay", { skip }, async () => {
  await seed();
  const html = await pageHtml({ q: "คอมพิวเตอร์แม่ข่าย", budgetMin: "350" });
  assert.match(html, NEARBY);
  assert.match(html, /คำค้น &quot;คอมพิวเตอร์&quot; แทน &quot;คอมพิวเตอร์แม่ข่าย&quot;/);
  assert.match(html, /เครื่องคอมพิวเตอร์ประจำศูนย์/);
  // The budget filter was kept: WW003 (156 ล้าน) isn't near enough.
  assert.doesNotMatch(html, /True IDC/);
  const link = /href="(\/project-card\?[^"]*)"[^>]*>ค้นด้วยเงื่อนไขนี้/.exec(html);
  assert.ok(link, "links to the looser search");
  const params = new URLSearchParams(link[1].replaceAll("&amp;", "&").split("?")[1]);
  assert.equal(params.get("q"), "คอมพิวเตอร์");
  assert.equal(params.get("budgetMin"), "350");
});

test("a word inside the keyword is tried too; Thai fragments and split codes are not", { skip }, async () => {
  await seed();
  await prisma.projectCard.create({
    data: { projectCode: "NT001", client: "NT", projectName: "ขยายเครือข่าย", descriptionTh: "", descriptionEn: "", budgetAmount: 500_000_000, year: 2022 },
  });
  // "คอมพิวเตอร์" sits between "ระบบ" and "แม่ข่าย".
  const middle = await pageHtml({ q: "ระบบคอมพิวเตอร์แม่ข่าย", budgetMin: "350" });
  assert.match(middle, /คำค้น &quot;คอมพิวเตอร์&quot;/);
  assert.match(middle, /เครื่องคอมพิวเตอร์ประจำศูนย์/);
  // "ข่าย" alone would bring in every เครือข่าย card.
  assert.doesNotMatch(await pageHtml({ q: "แม่ข่าย" }), /ขยายเครือข่าย/);
  // "CAT-025" isn't cut into "CAT", which would list every CAT card.
  assert.doesNotMatch(await pageHtml({ q: "CAT-025" }), /ไม่พบโครงการที่ตรงทุกเงื่อนไข/);
});

test("then the year, budget and certificate-age filters in use are let go, keeping the keyword", { skip }, async () => {
  await seed();
  const html = await pageHtml({ q: "server", budgetMin: "1000", yearFrom: "2024" });
  assert.match(html, NEARBY);
  assert.match(html, /ไม่จำกัดปี \/ งบ/);
  assert.doesNotMatch(html, /อายุหนังสือรับรอง/);
  assert.match(html, /True IDC/);
  assert.doesNotMatch(html, /ประจำศูนย์/);
});

test("last, the keyword is let go, keeping the client, Category and Work Type", { skip }, async () => {
  await seed();
  const html = await pageHtml({ q: "OLT", client: "PEA" });
  assert.match(html, NEARBY);
  assert.match(html, /ไม่ใช้คำค้น &quot;OLT&quot;/);
  assert.match(html, /ขายสายเคเบิลใยแก้วนำแสง/);
  // And with the budget too, when keeping it finds nothing.
  const both = await pageHtml({ q: "OLT", client: "PEA", budgetMin: "100" });
  assert.match(both, /ไม่ใช้คำค้น &quot;OLT&quot; · ไม่จำกัดงบ/);
  assert.match(both, /ขายสายเคเบิลใยแก้วนำแสง/);
});

test("nothing nearby is shown when cards match, or when nothing is near", { skip }, async () => {
  await seed();
  const exact = await pageHtml({ q: "คอมพิวเตอร์" });
  assert.doesNotMatch(exact, NEARBY);
  assert.match(exact, /พบ 1 โครงการ/);
  // Only a keyword, and no part of it finds anything: letting it go would
  // list every card, which isn't "near".
  const none = await pageHtml({ q: "ดาวเทียมวงโคจร" });
  assert.doesNotMatch(none, NEARBY);
  assert.match(none, /ไม่พบโครงการที่ค้นหา/);
  // Letting go of the only filter would list every card too.
  assert.doesNotMatch(await pageHtml({ yearFrom: "2030" }), NEARBY);
});
