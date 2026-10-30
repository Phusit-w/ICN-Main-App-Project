// กรอกอ้างอิง state of a Proposal (proposal-build 08), seam A: a run on the
// current SOC Version keeps its suggestions, decisions are kept per row so the
// user can work in passes, "รับทั้งหมดที่พบจากเลขข้อกำกับ" accepts the certain
// rows only, and the step shows กำลังทำ while a suggested row is undecided.
// Driven through the actions, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
const { getReferenceFill, createReferenceFillVersion, FILL_BAD_PAGES, FILL_NO_DATASHEETS, FILL_NOTHING_ACCEPTED, FILL_SOC_MOVED_ON } = await import("@/lib/proposal-reference-fill");
const { createReferenceFillVersionAction } = await import("@/actions/proposal");
const { readSocTable } = await import("@/lib/soc-table");
const { resolveStorageKey } = await import("@/lib/soc");

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
const CAMERA = () => pdf([["Overview"], ["5.1 Resolution 3840 x 2160 pixels"], ["Accessories"], ["Max 1920 x 1080 resolution mode"]]);
const POWER = () => pdf([["Input voltage 220 V 50 Hz power supply"]]);

async function proposal(title: string, { datasheets = true, soc = true, socBytes = SOC }: { datasheets?: boolean; soc?: boolean; socBytes?: () => Uint8Array } = {}) {
  const owner = await prisma.user.create({ data: { username: `u-${title}`, displayName: "ผู้ใช้", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  signedIn = owner;
  const created = await createProposalAction(title);
  assert.ok(created.ok);
  if (soc) await attachSocVersion(owner, { id: created.id, title }, { name: "soc.docx", bytes: socBytes() });
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

// ---- สร้างฉบับ SOC ใหม่ (proposal-build 09)

const currentRefs = async (id: string) => {
  const version = await prisma.socVersion.findFirstOrThrow({ where: { proposalId: id, state: "ready" }, orderBy: { number: "desc" } });
  const table = readSocTable(new Uint8Array(await readFile(resolveStorageKey(version.storageKey!))));
  return { version, refs: table.rows.map((row) => [row.item, row.reference] as const) };
};

test("สร้างฉบับ SOC ใหม่ writes the accepted rows in แบบไทย into a new version and leaves the rest empty", { skip }, async () => {
  const { id } = await proposal("งานเขียนไทย");
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  await acceptFillFromLabelsAction(id, runId); // 5.1, by its label
  const result = await createReferenceFillVersionAction(id, runId, "thai");
  assert.deepEqual(result, { ok: true, versionNumber: 2, written: 1 });
  const { version, refs } = await currentRefs(id);
  assert.equal(version.source, "reference_fill");
  assert.deepEqual(refs.slice(1).filter(([, reference]) => reference), [["5.1", "เอกสารส่วนที่ 2 Camera หน้า 2"]]);
  assert.equal((await prisma.proposal.findUniqueOrThrow({ where: { id } })).referenceStyle, "thai");
  assert.equal(await stepStatus(id), "done", "a reference_fill version is current");
  assert.equal(await getReferenceFill(id), null, "the run belonged to the old version");
});

test("แบบอังกฤษ writes 'Citation Name, page N' and a title-only row only gets its page", { skip }, async () => {
  const socWithTitle = () => buildSocDocx([HEADER, ["5", "ระบบ", "", ""], ["5.1", "กล้อง 3840 x 2160 pixels", "", ""], ["5.2", "รองรับ 1920 x 1080 resolution", "", "Camera"]]);
  const { id } = await proposal("งานเขียนอังกฤษ", { socBytes: socWithTitle });
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  assert.deepEqual((await getReferenceFill(id))!.rows.map((row) => [row.item, row.kind]), [["5.1", "empty"], ["5.2", "title_only"]]);
  await decideReferenceFillRowAction(id, runId, 3, { status: "accepted", choice: 0 });
  await decideReferenceFillRowAction(id, runId, 4, { status: "accepted", choice: 0 });
  assert.equal((await getReferenceFill(id))!.style, "thai", "no page words in the SOC yet, so the TOR's language decides");
  assert.deepEqual(await createReferenceFillVersionAction(id, runId, "english"), { ok: true, versionNumber: 2, written: 2 });
  assert.deepEqual((await currentRefs(id)).refs.slice(1), [["5", ""], ["5.1", "Camera, page 2"], ["5.2", "Camera, page 4"]]);
  assert.equal((await prisma.proposal.findUniqueOrThrow({ where: { id } })).referenceStyle, "english");
});

test("a title-only row in แบบไทย gets 'หน้า N' on a new line, its title kept", { skip }, async () => {
  const socWithTitle = () => buildSocDocx([HEADER, ["5", "ระบบ", "", ""], ["5.2", "รองรับ 1920 x 1080 resolution", "", "Camera"]]);
  const { id } = await proposal("งานต่อท้าย", { socBytes: socWithTitle });
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  await decideReferenceFillRowAction(id, runId, 3, { status: "accepted", choice: 0 });
  assert.equal((await createReferenceFillVersionAction(id, runId, "thai")).ok, true);
  assert.deepEqual((await currentRefs(id)).refs.slice(2), [["5.2", "Camera หน้า 4"]]);
});

test("the read-back guard blocks the whole write and lists the rows; nothing is stored", { skip }, async () => {
  const { id } = await proposal("งานบล็อก");
  await addProposalDatasheets(id, [{ name: "บทที่ 2/Camera copy.pdf", bytes: CAMERA() }]);
  await prisma.proposalDatasheet.updateMany({ where: { proposalId: id, originalName: { endsWith: "copy.pdf" } }, data: { citationName: "Camera" } });
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  await decideReferenceFillRowAction(id, runId, 3, { status: "accepted", choice: 0 }); // the label is on two files now, so not a certain row
  // Both files are called "Camera": "Camera, page 2" would name either.
  const refused = await createReferenceFillVersionAction(id, runId, "english");
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.problems?.length === 1 && /^5\.1: .*2 ไฟล์/.test(refused.problems[0]), JSON.stringify(refused));
  assert.equal(await prisma.socVersion.count({ where: { proposalId: id } }), 1);
  assert.equal((await prisma.proposal.findUniqueOrThrow({ where: { id } })).referenceStyle, null);
});

test("nothing accepted, or a SOC that moved on since the run, is refused in Thai", { skip }, async () => {
  const { owner, id } = await proposal("งานปฏิเสธ");
  const { runId } = (await startReferenceFillAction(id)) as { runId: string };
  assert.deepEqual(await createReferenceFillVersionAction(id, runId, "thai"), { ok: false, error: FILL_NOTHING_ACCEPTED });
  await decideReferenceFillRowAction(id, runId, 3, { status: "rejected" });
  assert.deepEqual(await createReferenceFillVersionAction(id, runId, "thai"), { ok: false, error: FILL_NOTHING_ACCEPTED }, "ไม่รับ writes nothing");
  await decideReferenceFillRowAction(id, runId, 3, { status: "accepted", choice: 0 });
  await attachSocVersion(owner, { id, title: "งานปฏิเสธ" }, { name: "soc2.docx", bytes: SOC() });
  assert.deepEqual(await createReferenceFillVersionAction(id, runId, "thai"), { ok: false, error: FILL_SOC_MOVED_ON });
  await assert.rejects(createReferenceFillVersion(id, runId, "klingon" as "thai"));
});
