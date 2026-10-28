// SOC Builds of สร้าง SOC (soc-builder ticket 04): create a build from a text
// TOR, page ranges, a shared or uploaded template; download the draft; delete.
// Driven through the routes, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildSocDocx } from "@/test/docx-fixture";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import { readSocTable } from "@/lib/soc-table";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { GET: listRoute, POST: createRoute } = await import("@/app/api/soc/builds/route");
const { DELETE: deleteRoute } = await import("@/app/api/soc/builds/[id]/route");
const { GET: downloadRoute } = await import("@/app/api/soc/builds/[id]/download/route");
const { POST: addTemplateRoute } = await import("@/app/api/soc/templates/route");
const { resolveStorageKey } = await import("@/lib/soc");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const TEMPLATE = buildSocDocx([["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ"], ["", "", ""]]);
const torPage = (...lines: string[]): TablePage => ({ columns: [], rows: [], lines: lines.map((text) => ({ text })) });
// Three pages: ข้อ ๑ on page 1, ข้อ ๒ on page 2, a note with no item on page 3.
const TOR = buildTablePdf([
  torPage("1. ระบบกล้องวงจรปิด", "1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", "1.2 กล้องต้องบันทึกภาพได้ไม่น้อยกว่า 7 วัน"),
  torPage("2. ระบบเครือข่าย", "2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต"),
  torPage("3. หมายเหตุ", "3.1 ราคารวมภาษีมูลค่าเพิ่ม"),
]);

const user = (username: string, role: "USER" | "ADMIN" = "USER", appAccess = ["soc"]) =>
  prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role, appAccess } });

type Fields = { tor?: Uint8Array | null; torName?: string; pageRanges?: string; title?: string; templateId?: string; template?: Uint8Array; templateName?: string };
function create(fields: Fields = {}) {
  const form = new FormData();
  if (fields.tor !== null) form.set("tor", new File([Buffer.from(fields.tor ?? TOR)], fields.torName ?? "TOR-ตัวอย่าง.pdf", { type: "application/pdf" }));
  form.set("pageRanges", fields.pageRanges ?? "1-2");
  if (fields.title) form.set("title", fields.title);
  if (fields.templateId) form.set("templateId", fields.templateId);
  if (fields.template) form.set("template", new File([Buffer.from(fields.template)], fields.templateName ?? "template.docx"));
  return createRoute(new Request("http://test/api/soc/builds", { method: "POST", body: form }));
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const download = (id: string) => downloadRoute(new Request(`http://test/api/soc/builds/${id}/download`), ctx(id));
const remove = (id: string) => deleteRoute(new Request(`http://test/api/soc/builds/${id}`, { method: "DELETE" }), ctx(id));

async function sharedTemplate() {
  const form = new FormData();
  form.set("name", "แบบฟอร์มลูกค้า");
  form.set("file", new File([Buffer.from(TEMPLATE)], "template.docx"));
  return (await (await addTemplateRoute(new Request("http://test/api/soc/templates", { method: "POST", body: form }))).json()).id as string;
}

test("a build from a text TOR, chosen pages and an uploaded template gives a draft the SOC check reads back", { skip }, async () => {
  const anna = (signedIn = await user("anna"));
  const response = await create({ template: TEMPLATE });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, "READY");
  assert.equal(body.title, "TOR-ตัวอย่าง"); // the TOR file's name, without .pdf
  assert.equal(body.rowCount, 5);

  const file = await download(body.id);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("Content-Type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match(decodeURIComponent(file.headers.get("Content-Disposition") ?? ""), /SOC-TOR-ตัวอย่าง\.docx/);
  const rows = readSocTable(new Uint8Array(await file.arrayBuffer())).rows.slice(1);
  assert.deepEqual(rows.map((row) => [row.item, row.tor]), [
    ["1.", "ระบบกล้องวงจรปิด"], ["1.1", "กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล"], ["1.2", "กล้องต้องบันทึกภาพได้ไม่น้อยกว่า 7 วัน"],
    ["2.", "ระบบเครือข่าย"], ["2.1", "สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต"],
  ]);

  const stored = await prisma.socBuild.findUniqueOrThrow({ where: { id: body.id } });
  assert.equal(stored.ownerId, anna.id);
  assert.equal(stored.pageRanges, "1-2");
  assert.ok(stored.purgeAfter.getTime() > Date.now() + 29 * 24 * 3600 * 1000);
  for (const key of [stored.torStorageKey, stored.templateStorageKey, stored.outputStorageKey!]) assert.ok(existsSync(resolveStorageKey(key)));
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_BUILD_CREATED", entityId: body.id, actorId: anna.id } }), 1);
  assert.deepEqual((await (await listRoute()).json()).builds.map((b: { id: string }) => b.id), [body.id]);
});

test("a template from the shared list, a typed title (duplicates allowed) and page ranges with a single page", { skip }, async () => {
  signedIn = await user("anna");
  const templateId = await sharedTemplate();
  const first = await (await create({ templateId, title: "งานลูกค้า ก", pageRanges: "1, 3" })).json();
  const second = await (await create({ templateId, title: "งานลูกค้า ก", pageRanges: "๑-๒" })).json(); // Thai digits
  assert.equal(first.title, second.title);
  assert.equal(first.rowCount, 5); // page 1 (3 rows) + page 3 (heading 3. and item 3.1)
  assert.equal((await prisma.socBuild.findUniqueOrThrow({ where: { id: second.id } })).templateName, "แบบฟอร์มลูกค้า");
});

test("a bad range, a range past the last page, no range, a scanned or broken TOR and a refused template are refused before anything is kept", { skip }, async () => {
  signedIn = await user("anna");
  const kept = () => (existsSync(path.join(storageRoot, "builds")) ? readdirSync(path.join(storageRoot, "builds")).length : 0);
  const filesBefore = kept();
  const cases: [Fields, number, RegExp][] = [
    [{ template: TEMPLATE, pageRanges: "3-2" }, 400, /ไม่ถูกต้อง/],
    [{ template: TEMPLATE, pageRanges: "abc" }, 400, /ไม่ถูกต้อง/],
    [{ template: TEMPLATE, pageRanges: "2-9" }, 400, /เกินหน้าสุดท้ายของ TOR \(TOR มี 3 หน้า\)/],
    [{ template: TEMPLATE, pageRanges: "" }, 400, /กรุณาใส่ช่วงหน้า/],
    [{ template: buildSocDocx([["ลำดับ", "ข้อกำหนด TOR"]]) }, 400, /ไม่พบตาราง SOC ในเทมเพลต/],
    [{ template: new TextEncoder().encode("hello") }, 400, /Word \(\.docx\)/],
    [{ templateId: "no-such-template" }, 400, /ไม่พบเทมเพลต/],
    [{}, 400, /กรุณาเลือกเทมเพลต/],
    [{ template: TEMPLATE, tor: null }, 400, /กรุณาเลือกไฟล์ PDF ของ TOR/],
    [{ template: TEMPLATE, tor: new TextEncoder().encode("not a pdf") }, 400, /PDF/],
    [{ template: TEMPLATE, tor: buildTablePdf([1, 2, 3].map(() => ({ columns: [], rows: [], scanned: true }))) }, 400, /ไฟล์สแกน/],
    [{ template: TEMPLATE, pageRanges: "1", tor: buildTablePdf([torPage("ข้อความทั่วไป ไม่มีเลขข้อ")]) }, 400, /ไม่พบข้อที่มีเลขกำกับ/],
  ];
  for (const [fields, status, message] of cases) {
    const response = await create(fields);
    assert.equal(response.status, status, JSON.stringify(Object.keys(fields)));
    assert.match((await response.json()).error, message);
  }
  assert.equal(await prisma.socBuild.count(), 0);
  assert.equal(kept(), filesBefore);
});

test("deleting a build removes its record and files; the owner and an ADMIN may, another user may not reach it", { skip }, async () => {
  const anna = (signedIn = await user("anna"));
  const { id } = await (await create({ template: TEMPLATE })).json();
  const { torStorageKey } = await prisma.socBuild.findUniqueOrThrow({ where: { id } });

  signedIn = await user("bob");
  assert.equal((await download(id)).status, 404);
  assert.equal((await remove(id)).status, 404);
  assert.deepEqual((await (await listRoute()).json()).builds, []);
  assert.equal(await prisma.socBuild.count(), 1);

  signedIn = anna;
  assert.equal((await remove(id)).status, 200);
  assert.equal(await prisma.socBuild.count(), 0);
  assert.equal(existsSync(resolveStorageKey(torStorageKey)), false);
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_BUILD_DELETED", entityId: id } }), 1);
  assert.equal((await download(id)).status, 404);

  const again = await (await create({ template: TEMPLATE })).json();
  signedIn = await user("root", "ADMIN");
  assert.equal((await download(again.id)).status, 200);
  assert.equal((await remove(again.id)).status, 200);
});

test("without SOC access creating, listing, downloading and deleting are refused", { skip }, async () => {
  signedIn = await user("anna");
  const { id } = await (await create({ template: TEMPLATE })).json();
  signedIn = await user("carl", "USER", ["expense"]);
  assert.equal((await create({ template: TEMPLATE })).status, 403);
  assert.equal((await listRoute()).status, 403);
  assert.equal((await download(id)).status, 403);
  assert.equal((await remove(id)).status, 403);
  signedIn = null;
  assert.equal((await listRoute()).status, 401);
  assert.equal(await prisma.socBuild.count(), 1);
});
