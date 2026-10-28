// The shared SOC Template list of สร้าง SOC (soc-builder ticket 03): add (a
// template the builder can't fill is refused with its message), list, delete
// by the one who added it or an ADMIN, SOC access required. Driven through the
// routes, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

const { GET: listRoute, POST: addRoute } = await import("@/app/api/soc/templates/route");
const { DELETE: deleteRoute } = await import("@/app/api/soc/templates/[id]/route");
const { resolveStorageKey } = await import("@/lib/soc");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const VALID = buildSocDocx([["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ"], ["", "", ""]]);
const NO_HEADER = buildSocDocx([["a", "b"], ["", ""]]);

const user = (username: string, role: "USER" | "ADMIN" = "USER", appAccess = ["soc"]) =>
  prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role, appAccess } });

function add(name: string, bytes: Uint8Array, fileName = "template.docx") {
  const form = new FormData();
  form.set("name", name);
  form.set("file", new File([Buffer.from(bytes)], fileName));
  return addRoute(new Request("http://test/api/soc/templates", { method: "POST", body: form }));
}
const remove = (id: string) => deleteRoute(new Request(`http://test/api/soc/templates/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

test("a valid template is added, kept on disk and listed with who added it", { skip }, async () => {
  signedIn = await user("anna");
  const response = await add("แบบฟอร์ม กฟน.", VALID);
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const row = await prisma.socTemplate.findUniqueOrThrow({ where: { id } });
  assert.equal(row.addedById, signedIn.id);
  assert.ok(existsSync(resolveStorageKey(row.storageKey)));
  signedIn = await user("bob");
  const { templates } = await (await listRoute()).json();
  assert.deepEqual(templates.map((t: { name: string; addedByName: string }) => [t.name, t.addedByName]), [["แบบฟอร์ม กฟน.", "คุณ anna"]]);
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_TEMPLATE_ADDED", entityId: id } }), 1);
});

test("a template the builder can't fill is refused with the problem named, and nothing is kept", { skip }, async () => {
  signedIn = await user("anna");
  const response = await add("ผิด", NO_HEADER);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /ไม่พบตาราง SOC ในเทมเพลต/);
  assert.equal(await prisma.socTemplate.count(), 0);
  assert.equal((await add("ไม่ใช่ Word", new TextEncoder().encode("hello"))).status, 400);
  assert.equal((await add("ชื่อไฟล์ผิด", VALID, "template.xlsx")).status, 400);
  assert.equal((await add("   ", VALID)).status, 400);
});

test("the one who added a template deletes it, with its file; another user may not", { skip }, async () => {
  const anna = await user("anna");
  signedIn = anna;
  const { id } = await (await add("A", VALID)).json();
  const key = (await prisma.socTemplate.findUniqueOrThrow({ where: { id } })).storageKey;
  signedIn = await user("bob");
  assert.equal((await remove(id)).status, 403);
  assert.equal(await prisma.socTemplate.count(), 1);
  signedIn = anna;
  assert.equal((await remove(id)).status, 200);
  assert.equal(await prisma.socTemplate.count(), 0);
  assert.equal(existsSync(resolveStorageKey(key)), false);
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_TEMPLATE_DELETED", entityId: id } }), 1);
  assert.equal((await remove(id)).status, 404);
});

test("an ADMIN deletes any template", { skip }, async () => {
  signedIn = await user("anna");
  const { id } = await (await add("A", VALID)).json();
  signedIn = await user("root", "ADMIN");
  assert.equal((await remove(id)).status, 200);
  assert.equal(await prisma.socTemplate.count(), 0);
});

test("without SOC access the list, add and delete are refused", { skip }, async () => {
  signedIn = await user("anna");
  const { id } = await (await add("A", VALID)).json();
  signedIn = await user("carl", "USER", ["expense"]);
  assert.equal((await listRoute()).status, 403);
  assert.equal((await add("B", VALID)).status, 403);
  assert.equal((await remove(id)).status, 403);
  assert.equal(await prisma.socTemplate.count(), 1);
  signedIn = null;
  assert.equal((await listRoute()).status, 401);
});
