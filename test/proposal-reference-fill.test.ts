// กรอกอ้างอิง state of a Proposal (proposal-build 08), seam A: a run on the
// current SOC Version keeps its suggestions, decisions are kept per row so the
// user can work in passes, "รับทั้งหมดที่พบจากเลขข้อกำกับ" accepts the certain
// rows only, and the step shows กำลังทำ while a suggested row is undecided.
// Driven through the actions, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildSocDocx } from "@/test/docx-fixture";
import { buildTablePdf } from "@/test/pdf-table-fixture";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { createProposalAction, startReferenceFillAction, decideReferenceFillRowAction, acceptFillFromLabelsAction } = await import("@/actions/proposal");
const { getProposalPage } = await import("@/lib/proposal");
const { attachSocVersion } = await import("@/lib/proposal-soc");
const { addProposalDatasheets } = await import("@/lib/proposal-datasheet");
const { getReferenceFill, FILL_BAD_PAGES, FILL_NO_DATASHEETS } = await import("@/lib/proposal-reference-fill");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "proposal-fill-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"];
const SOC = () => buildSocDocx([
  HEADER,
  ["5", "ระบบกล้อง", "", ""],
  ["5.1", "กล้องความละเอียด 4K ไม่น้อยกว่า 3840 x 2160 pixels", "", ""],
  ["5.2", "Power supply 220 V 50 Hz input voltage", "", ""],
  ["5.3", "ฟีเจอร์ที่ไม่มีใน Datasheet ใดเลย", "", ""],
]);
const pdf = (pages: string[][]) => buildTablePdf(pages.map((lines) => ({ columns: [], rows: [], lines: lines.map((text) => ({ text })) })));
const CAMERA = () => pdf([["Overview"], ["5.1 Resolution 3840 x 2160 pixels"]]);
const POWER = () => pdf([["Input voltage 220 V 50 Hz power supply"]]);

async function proposal(title: string, { datasheets = true, soc = true } = {}) {
  const owner = await prisma.user.create({ data: { username: `u-${title}`, displayName: "ผู้ใช้", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  signedIn = owner;
  const created = await createProposalAction(title);
  assert.ok(created.ok);
  if (soc) await attachSocVersion(owner, { id: created.id, title }, { name: "soc.docx", bytes: SOC() });
  if (datasheets) await addProposalDatasheets(created.id, [{ name: "บทที่ 2/Camera.pdf", bytes: CAMERA() }, { name: "บทที่ 2/Power.pdf", bytes: POWER() }]);
  return { owner, id: created.id };
}

const stepStatus = async (id: string) => (await getProposalPage(id)).steps[3].status;

test("a run keeps the code step's suggestions and counts found / not found", { skip }, async () => {
  const { id } = await proposal("งานค้นหา");
  assert.equal(await stepStatus(id), "todo");
  const started = await startReferenceFillAction(id);
  assert.deepEqual(started, { ok: true, runId: (started as { runId: string }).runId, found: 2, notFound: 1 });
  const view = (await getReferenceFill(id))!;
  assert.equal(view.versionNumber, 1);
  assert.deepEqual([view.found, view.notFound, view.undecided, view.certainUndecided], [2, 1, 2, 1]);
  assert.deepEqual(view.rows.map((row) => [row.item, row.suggestions[0]?.documentName ?? null, row.suggestions[0]?.page ?? null]), [["5.1", "Camera", 2], ["5.2", "Power", 1], ["5.3", null, null]]);
  assert.equal(await stepStatus(id), "doing", "undecided suggestions remain");
});

test("รับ / แก้ / ไม่รับ are kept per row, can be taken back, and the step is done with them when none is left", { skip }, async () => {
  const { id } = await proposal("งานตัดสิน");
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  assert.deepEqual(await decideReferenceFillRowAction(id, runId, 3, { status: "accepted", choice: 0 }), { ok: true });
  assert.deepEqual((await getReferenceFill(id))!.rows[0].decision, { status: "accepted", choice: 0, datasheetId: null, pages: null });
  assert.equal((await getReferenceFill(id))!.undecided, 1);

  const power = (await prisma.proposalDatasheet.findFirstOrThrow({ where: { proposalId: id, originalName: { endsWith: "Power.pdf" } } })).id;
  await decideReferenceFillRowAction(id, runId, 4, { status: "edited", datasheetId: power, pages: "3,6 12–13" });
  const edited = (await getReferenceFill(id))!.rows[1].decision;
  assert.deepEqual([edited?.status, edited?.datasheetId, edited?.pages], ["edited", power, "3, 6, 12-13"]);
  assert.equal((await getReferenceFill(id))!.undecided, 0);
  assert.equal(await stepStatus(id), "todo", "nothing left to decide");

  await decideReferenceFillRowAction(id, runId, 3, { status: "rejected" });
  assert.equal((await getReferenceFill(id))!.rows[0].decision?.status, "rejected");
  await decideReferenceFillRowAction(id, runId, 3, { status: "undecided" });
  assert.equal((await getReferenceFill(id))!.rows[0].decision, null);
  assert.equal((await getReferenceFill(id))!.undecided, 1);
});

test("a row can be edited by hand even when nothing was found; bad pages and unknown choices are refused", { skip }, async () => {
  const { id } = await proposal("งานแก้เอง");
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  const camera = (await prisma.proposalDatasheet.findFirstOrThrow({ where: { proposalId: id, originalName: { endsWith: "Camera.pdf" } } })).id;
  assert.deepEqual(await decideReferenceFillRowAction(id, runId, 5, { status: "edited", datasheetId: camera, pages: "2" }), { ok: true });
  assert.deepEqual(await decideReferenceFillRowAction(id, runId, 5, { status: "edited", datasheetId: camera, pages: "0" }), { ok: false, error: FILL_BAD_PAGES });
  assert.deepEqual(await decideReferenceFillRowAction(id, runId, 5, { status: "edited", datasheetId: camera, pages: "9-3" }), { ok: false, error: FILL_BAD_PAGES });
  const accepted = async (...args: Parameters<typeof decideReferenceFillRowAction>) => (await decideReferenceFillRowAction(...args)).ok;
  assert.equal(await accepted(id, runId, 5, { status: "accepted", choice: 0 }), false, "ไม่พบ has nothing to accept");
  assert.equal(await accepted(id, runId, 3, { status: "accepted", choice: 7 }), false);
  assert.equal(await accepted(id, runId, 99, { status: "rejected" }), false);
  const other = await proposal("งานอื่น");
  assert.equal(await accepted(other.id, runId, 3, { status: "rejected" }), false, "a run of another Proposal");
});

test("รับทั้งหมดที่พบจากเลขข้อกำกับ accepts the certain rows only and leaves decided ones alone", { skip }, async () => {
  const { id } = await proposal("งานรับทั้งหมด");
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  assert.deepEqual(await acceptFillFromLabelsAction(id, runId), { ok: true, accepted: 1 });
  const view = (await getReferenceFill(id))!;
  assert.deepEqual(view.rows.map((row) => row.decision?.status ?? null), ["accepted", null, null], "the value-matched and the not-found rows stay undecided");
  assert.deepEqual(await acceptFillFromLabelsAction(id, runId), { ok: true, accepted: 0 });
});

test("a new run replaces the old one on the page; a new SOC Version has no run yet", { skip }, async () => {
  const { owner, id } = await proposal("งานใหม่");
  const first = (await startReferenceFillAction(id)) as { runId: string };
  const second = (await startReferenceFillAction(id)) as { runId: string };
  assert.notEqual(first.runId, second.runId);
  assert.equal((await getReferenceFill(id))!.runId, second.runId);
  await attachSocVersion(owner, { id, title: "งานใหม่" }, { name: "soc2.docx", bytes: SOC() });
  assert.equal(await getReferenceFill(id), null);
});

test("it needs a SOC and Datasheets, and says so in Thai", { skip }, async () => {
  const noSheets = await proposal("ไม่มี Datasheet", { datasheets: false });
  assert.deepEqual(await startReferenceFillAction(noSheets.id), { ok: false, error: FILL_NO_DATASHEETS });
  const noSoc = await proposal("ไม่มี SOC", { soc: false });
  const result = await startReferenceFillAction(noSoc.id);
  assert.equal(result.ok, false);
});
