// ค้นหาโครงการ's ส่งออก Excel (2026-10-29): one button that downloads exactly
// the cards on screen — the URL's search and filters, in the sort the user
// picked — as .xlsx, for anyone with Project Card access (view-only too),
// with every export in the Activity log. Driven through the download route
// with the signed-in user stubbed.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { parseSort } from "@/lib/project-card-sort";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }), redirect: () => { throw new Error("REDIRECT"); } } });

const { GET: exportRoute, POST: exportPicked } = await import("@/app/api/project-card/export/route");
const { default: ProjectCardPage } = await import("@/app/(app)/project-card/page");

const CERT = String.raw`\\192.168.99.1\PS\_BID\02 Work Certificate\PEA\PEA001.pdf`;

async function signIn(appAccess: string[]) {
  signedIn = await prisma.user.create({
    data: { username: "viewer", passwordHash: "x", displayName: "ผู้ดู", appAccess },
  });
}

async function seed() {
  await prisma.projectCard.createMany({
    data: [
      {
        projectCode: "PEA001", client: "PEA", projectName: "โครงการ A", descriptionTh: "ไทย A", descriptionEn: "English A",
        budgetAmount: 1_000_000, vatStatus: "included", budgetVerified: true, year: 2023, workTypes: [],
        certificatePath: CERT, certificateDate: new Date("2024-03-12T00:00:00Z"), budgetNote: "หมายเหตุ A",
      },
      { projectCode: "PEA002", client: "PEA (BBTEC)", projectName: "โครงการ B", descriptionTh: "", descriptionEn: "", budgetAmount: 5_000_000, year: 2021, workTypes: [] },
      { projectCode: "MEA001", client: "MEA", projectName: "โครงการ C", descriptionTh: "", descriptionEn: "", year: 2025, workTypes: [] },
    ],
  });
}

async function download(query: string) {
  return exportRoute(new Request(`http://localhost/api/project-card/export${query}`));
}

async function workbook(response: Response) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  return book;
}

const column = (sheet: ExcelJS.Worksheet, header: string) => {
  const headers = (sheet.getRow(1).values as unknown[]).slice(1);
  const index = headers.indexOf(header);
  assert.ok(index >= 0, `no column ${header}`);
  return (row: number) => sheet.getRow(row).getCell(index + 1).value;
};

test("a sort param is read back as the sort, anything else as the page's order", () => {
  assert.deepEqual(parseSort("budget:desc"), { key: "budget", dir: "desc" });
  for (const bad of ["", "budget", "budget:up", "toString:asc", null]) assert.equal(parseSort(bad), null, String(bad));
});

test("a view-only user downloads the filtered cards in the picked sort", { skip }, async () => {
  await signIn(["project-card"]);
  await seed();
  const response = await download("?client=PEA&sort=budget:desc");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /project-cards-\d{4}-\d{2}-\d{2}\.xlsx/);

  const book = await workbook(response);
  const sheet = book.getWorksheet("โครงการ");
  assert.ok(sheet);
  assert.equal(sheet.rowCount, 3);
  const code = column(sheet, "รหัสโครงการ");
  assert.deepEqual([code(2), code(3)], ["PEA002", "PEA001"]);
  assert.equal(column(sheet, "งบประมาณ (บาท)")(2), 5_000_000);
  assert.equal(column(sheet, "สถานะงบ")(3), "ยืนยันแล้ว");
  assert.equal(column(sheet, "VAT")(3), "รวม VAT");
  assert.equal(column(sheet, "รายละเอียด (อังกฤษ)")(3), "English A");
  assert.equal(column(sheet, "ไฟล์หนังสือรับรอง")(3), CERT);
  const certDate = column(sheet, "วันที่ลงหนังสือรับรอง");
  assert.equal((certDate(3) as Date).toISOString(), "2024-03-12T00:00:00.000Z");
  assert.equal(certDate(2), null);
  // Shown as a Buddhist-era date ("12 มี.ค. 2567") while staying a real date.
  assert.match(String(sheet.getRow(3).getCell(14).numFmt), /bbbb/);
  assert.equal(sheet.getRow(1).getCell(1).value, "รหัสโครงการ");
  assert.equal(sheet.columnCount, 17);

  const terms = book.getWorksheet("เงื่อนไข");
  assert.ok(terms);
  const text = terms.getSheetValues().flat().join(" ");
  assert.match(text, /ลูกค้า: PEA/);
  assert.match(text, /ผู้ดู/);
  // Named as เรียงตาม names it on screen.
  assert.match(text, /งบ มาก → น้อย/);

  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "PROJECT_CARDS_EXPORTED" } });
  assert.equal(audit.actorId, signedIn!.id);
  assert.match(audit.summary, /2 โครงการ/);
  assert.match(audit.summary, /ลูกค้า: PEA/);
});

test("no filter downloads every card, in the page's own order", { skip }, async () => {
  await signIn(["project-card"]);
  await seed();
  const sheet = (await workbook(await download(""))).getWorksheet("โครงการ")!;
  const code = column(sheet, "รหัสโครงการ");
  assert.deepEqual([code(2), code(3), code(4)], ["MEA001", "PEA001", "PEA002"]);
});

test("only a user with Project Card access may download", { skip }, async () => {
  signedIn = null;
  assert.equal((await download("")).status, 401);
  await signIn(["expense"]);
  assert.equal((await download("")).status, 403);
  assert.equal(await prisma.auditLog.count(), 0);
});

test("the page's ส่งออก Excel link carries the filters; with no cards it can't be pressed", { skip }, async () => {
  await signIn(["project-card"]);
  await seed();
  const html = renderToStaticMarkup(await ProjectCardPage({ searchParams: Promise.resolve({ client: "PEA" }) }));
  assert.match(html, /href="\/api\/project-card\/export\?client=PEA"/);
  const none = renderToStaticMarkup(await ProjectCardPage({ searchParams: Promise.resolve({ client: "NOPE" }) }));
  assert.doesNotMatch(none, /\/api\/project-card\/export/);
  assert.match(none, /<button[^>]*disabled[^>]*>ส่งออก Excel/);
});

// Ticked rows (2026-10-29): sent as form fields, since a long list of codes
// in the URL could pass IIS's 2,048-character query limit.
async function downloadPicked(query: string, codes: string[]) {
  const form = new FormData();
  for (const code of codes) form.append("code", code);
  return exportPicked(new Request(`http://localhost/api/project-card/export${query}`, { method: "POST", body: form }));
}

test("ticked cards download alone, in the picked sort, and the file says they were picked", { skip }, async () => {
  await signIn(["project-card"]);
  await seed();
  // MEA001 isn't in this search: a code outside it is ignored.
  const response = await downloadPicked("?client=PEA&sort=budget:asc", ["PEA002", "PEA001", "MEA001"]);
  assert.equal(response.status, 200);
  const book = await workbook(response);
  const code = column(book.getWorksheet("โครงการ")!, "รหัสโครงการ");
  assert.deepEqual([code(2), code(3), code(4)], ["PEA001", "PEA002", null]);

  const one = await workbook(await downloadPicked("?client=PEA", ["PEA002"]));
  const sheet = one.getWorksheet("โครงการ")!;
  assert.equal(sheet.rowCount, 2);
  assert.equal(column(sheet, "รหัสโครงการ")(2), "PEA002");
  const text = one.getWorksheet("เงื่อนไข")!.getSheetValues().flat().join(" ");
  assert.match(text, /เลือกเอง 1 จาก 2 โครงการ/);

  const audits = await prisma.auditLog.findMany({ where: { action: "PROJECT_CARDS_EXPORTED" }, orderBy: { createdAt: "asc" } });
  assert.equal(audits.length, 2);
  assert.match(audits[1].summary, /เลือกเอง 1 จาก 2/);
  assert.equal((audits[1].metadata as Record<string, unknown>).picked, 1);
});

test("a POST with nothing ticked downloads every card on screen; access is checked the same", { skip }, async () => {
  await signIn(["project-card"]);
  await seed();
  const sheet = (await workbook(await downloadPicked("?client=PEA", []))).getWorksheet("โครงการ")!;
  assert.equal(sheet.rowCount, 3);
  // Far more codes than any page shows is refused, never cut short silently.
  assert.equal((await downloadPicked("", Array.from({ length: 5001 }, (_, i) => `X${i}`))).status, 413);
  signedIn = null;
  assert.equal((await downloadPicked("", ["PEA001"])).status, 401);
});

test("the list offers a tick box per card and เลือกทั้งหมด", { skip }, async () => {
  await signIn(["project-card"]);
  await seed();
  const html = renderToStaticMarkup(await ProjectCardPage({ searchParams: Promise.resolve({ client: "PEA" }) }));
  assert.match(html, /aria-label="เลือกทั้งหมด"/);
  assert.match(html, /aria-label="เลือก PEA001"/);
  assert.match(html, /aria-label="เลือก PEA002"/);
});
