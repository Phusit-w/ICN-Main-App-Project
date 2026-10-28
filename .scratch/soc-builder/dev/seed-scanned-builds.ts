// DEV ONLY: four scanned builds in the scratch DB (port 51821) in each read state, to look at the pages. Nothing is sent to any OCR.
// Run with SCRATCH_DATABASE_URL set: node --import ./test/register.mjs .scratch/soc-builder/dev/seed-scanned-builds.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const url = process.env.SCRATCH_DATABASE_URL;
if (!url || !url.includes(":51821/")) throw new Error("SCRATCH_DATABASE_URL must be the scratch DB on port 51821");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
const owner = await prisma.user.findUniqueOrThrow({ where: { username: "demo" } });
const states = [
  { title: "สแกน รอคิว", status: "QUEUED", stage: "รอคิวที่ 2", pagesDone: 0, errorMessage: null },
  { title: "สแกน กำลังอ่าน", status: "READING", stage: "กำลังอ่าน TOR หน้า 12/27", pagesDone: 12, errorMessage: null },
  { title: "สแกน อ่านไม่สำเร็จ", status: "FAILED", stage: null, pagesDone: 12, errorMessage: 'เกิดข้อผิดพลาดระหว่างอ่าน TOR · หน้าที่อ่านแล้วยังเก็บไว้ กด "อ่านต่อ" เมื่อพร้อม' },
  { title: "สแกน ยกเลิกแล้ว", status: "CANCELLED", stage: null, pagesDone: 5, errorMessage: 'ยกเลิกการอ่าน TOR แล้ว หน้าที่อ่านแล้วยังเก็บไว้ กด "อ่านต่อ" เมื่อพร้อม' },
];
for (const [i, state] of states.entries()) {
  const key = `builds/seed-scanned-${i}`;
  await prisma.socBuild.upsert({
    where: { torStorageKey: `${key}/tor.pdf` },
    update: { ...state },
    create: { ...state, ownerId: owner.id, scanned: true, pageRanges: "13-39", pageRangeList: [[13, 39]], pagesTotal: 27, torName: "TOR สแกน.pdf", torStorageKey: `${key}/tor.pdf`, templateName: "Template.docx", templateStorageKey: `${key}/t.docx`, purgeAfter: new Date(Date.now() + 30 * 864e5) },
  });
}
console.log("seeded", states.length);
await prisma.$disconnect();
