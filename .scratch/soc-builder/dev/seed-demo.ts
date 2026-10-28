// DEV ONLY: a login on a scratch database for the browser check of สร้าง SOC.
// Run with SCRATCH_DATABASE_URL set to the scratch DB (never pilot-db or prod):
//   node --import ./test/register.mjs .scratch/soc-builder/dev/seed-demo.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { hashPassword } from "@/lib/auth";

const url = process.env.SCRATCH_DATABASE_URL;
if (!url || !url.includes(":51821/")) throw new Error("SCRATCH_DATABASE_URL must be the scratch DB on port 51821");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
await prisma.user.upsert({
  where: { username: "demo" },
  update: {},
  create: { username: "demo", displayName: "ผู้ทดสอบ", passwordHash: hashPassword("demo-pass-1"), role: "ADMIN", appAccess: ["soc", "expense", "project-card-edit"] },
});
console.log("demo user ready: demo / demo-pass-1");
await prisma.$disconnect();
