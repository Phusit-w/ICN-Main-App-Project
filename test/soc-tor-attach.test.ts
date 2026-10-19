// Attaching a TOR ต้นฉบับ to a job (tor-match ticket 03): attaching a text TOR ต้นฉบับ
// compares it with the SOC at once and stores the result; attaching another
// replaces it; a scanned TOR is refused; the datasheet check is never touched.
// Driven through the route, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import { buildXlsx } from "@/test/xlsx-fixture";
import { newSocRunnerToken } from "@/lib/soc-runner-token";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: torRoute } = await import("@/app/api/soc/jobs/[id]/tor/route");
const { POST: importRoute } = await import("@/app/api/soc/jobs/[id]/major-items/[itemId]/import/route");
const { requestSocCheck } = await import("@/actions/socCheckRequests");
const { createImportedSocJob } = await import("@/lib/soc");
const { torMatchView } = await import("@/lib/soc-tor");
const { TOR_IS_SCANNED } = await import("@/lib/soc-tor-read");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

type Row = Record<string, unknown>;
const SONNET_RUN = JSON.parse(readFileSync(new URL("./fixtures/soc/results_sonnet.json", import.meta.url), "utf8")) as { results: Row[] } & Row;
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");

const SOC_ROWS = [
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"],
  ["1", "ระบบกล้องวงจรปิด", null, null],
  ["1.1", "กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", "8 ล้านพิกเซล", "Brochure หน้า 3"],
  ["1.2", "กล้องต้องบันทึกภาพได้ไม่น้อยกว่า 7 วัน", "30 วัน", "Brochure หน้า 4"],
  ["2", "ระบบเครือข่าย", null, null],
  ["2.1", "สวิตช์ต้องมีพอร์ตไม่น้อยกว่า ๒๔ พอร์ต", "48 พอร์ต", "Brochure หน้า 5"],
];
const torPage = (days: number): TablePage => ({
  columns: [],
  rows: [],
  lines: [
    "1. ระบบกล้องวงจรปิด",
    "1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล",
    `1.2 กล้องต้องบันทึกภาพได้ไม่น้อยกว่า ${days} วัน`,
    "1.3 ต้องมีอุปกรณ์สำรองไฟฟ้าสำหรับกล้องทุกตัว",
    "2. ระบบเครือข่าย",
    "2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต",
  ].map((text) => ({ text })),
});

function user(username: string) {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role: "USER", appAccess: ["soc"] } });
}

async function job(name: string) {
  const owner = await user(name);
  signedIn = owner;
  const jobId = await createImportedSocJob(owner, { title: `TOR Match ${name}`, soc: { name: "SOC.xlsx", bytes: await buildXlsx([{ name: "SOC", rows: SOC_ROWS }]) }, evidence: [{ name: "Brochure.pdf", bytes: PDF }] });
  return { owner, jobId };
}

function attach(jobId: string, pdf: Uint8Array<ArrayBuffer>, name = "TOR.pdf") {
  const form = new FormData();
  form.set("tor", new File([pdf], name, { type: "application/pdf" }));
  return torRoute(new Request(`http://localhost/api/soc/jobs/${jobId}/tor`, { method: "POST", body: form }), { params: Promise.resolve({ id: jobId }) });
}

const lines = async (jobId: string) =>
  (await prisma.socTorMatchLine.findMany({ where: { match: { jobId } }, orderBy: { position: "asc" } })).map((l) => [l.socRow, l.item, l.outcome, l.torPage]);

test("attaching a text TOR compares it at once; another TOR replaces it and its result", { skip }, async () => {
  const { jobId } = await job("attach");
  const response = await attach(jobId, buildTablePdf([torPage(30)]), "TOR เดิม.pdf");
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));

  const first = await prisma.socDocument.findFirstOrThrow({ where: { jobId, type: "TOR_ORIGINAL" } });
  assert.deepEqual([first.originalName, first.pageCount], ["TOR เดิม.pdf", 1]);
  assert.deepEqual(await lines(jobId), [
    [1, "1", "ตรง", 1],
    [2, "1.1", "ตรง", 1],
    [3, "1.2", "ความหมายต่าง", 1], // 30 วัน in the TOR, 7 in the SOC
    [4, "2", "ตรง", 1],
    [5, "2.1", "ต่างแค่รูปแบบ", 1], // Thai digits
    [null, null, "ไม่พบใน SOC", 1], // 1.3 left out of the SOC
  ]);
  const view = await torMatchView(jobId);
  assert.equal(view?.state, "ready");
  assert.equal(view?.name, "TOR เดิม.pdf");
  assert.deepEqual(view?.counts, { "ตรง": 3, "ต่างแค่รูปแบบ": 1, "ความหมายต่าง": 1, "ไม่พบใน SOC": 1, "ไม่พบใน TOR": 0, "ยืนยันไม่ได้": 0 });
  assert.deepEqual(view?.warnings, []);
  // The issue list gets every line, ตรง included, in stored order with both texts.
  assert.deepEqual(view?.lines.map((l) => [l.socRow, l.outcome]), [[1, "ตรง"], [2, "ตรง"], [3, "ความหมายต่าง"], [4, "ตรง"], [5, "ต่างแค่รูปแบบ"], [null, "ไม่พบใน SOC"]]);
  const changedLine = view?.lines[2];
  assert.ok(changedLine?.socText && changedLine.torText && changedLine.torPage === 1);

  const replaced = await attach(jobId, buildTablePdf([torPage(7)]), "TOR ใหม่.pdf");
  assert.equal(replaced.status, 201);
  assert.equal(await prisma.socDocument.count({ where: { id: first.id } }), 0);
  assert.equal(existsSync(path.join(storageRoot, ...first.storageKey.split("/"))), false);
  assert.equal(await prisma.socTorMatch.count({ where: { jobId } }), 1);
  assert.equal((await lines(jobId))[2][2], "ตรง");
  assert.equal((await torMatchView(jobId))?.name, "TOR ใหม่.pdf");
  assert.deepEqual(
    (await prisma.socAuditEvent.findMany({ where: { jobId, action: { startsWith: "TOR_" } }, orderBy: { createdAt: "asc" } })).map((e) => e.action),
    ["TOR_ATTACHED", "TOR_REPLACED"],
  );
});

test("a TOR with no section for a major item warns and leaves its rows unconfirmed", { skip }, async () => {
  const { jobId } = await job("wrong-tor");
  const other: TablePage = { columns: [], rows: [], lines: [{ text: "1. ระบบกล้องวงจรปิด" }, { text: "1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล" }] };
  assert.equal((await attach(jobId, buildTablePdf([other]))).status, 201);
  const view = await torMatchView(jobId);
  assert.equal(view?.warnings.length, 1);
  assert.match(view!.warnings[0], /ข้อ 2/);
  assert.deepEqual((await lines(jobId)).filter(([row]) => row === 4 || row === 5).map(([, , outcome]) => outcome), ["ยืนยันไม่ได้", "ยืนยันไม่ได้"]);
});

test("a scanned TOR, or a job whose SOC is still being read, is refused and nothing is stored", { skip }, async () => {
  const { jobId } = await job("refused");
  const scanned = await attach(jobId, buildTablePdf([{ columns: [], rows: [], scanned: true }]));
  assert.equal(scanned.status, 400);
  assert.equal(((await scanned.json()) as { error: string }).error, TOR_IS_SCANNED);
  const notPdf = await attach(jobId, new TextEncoder().encode("not a pdf") as Uint8Array<ArrayBuffer>);
  assert.equal(notPdf.status, 400);

  await prisma.socJob.update({ where: { id: jobId }, data: { status: "READING" } });
  const reading = await attach(jobId, buildTablePdf([torPage(30)]));
  assert.equal(reading.status, 400);
  assert.match(((await reading.json()) as { error: string }).error, /อ่านตาราง SOC/);

  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "TOR_ORIGINAL" } }), 0);
  assert.equal(await prisma.socTorMatch.count({ where: { jobId } }), 0);
});

test("attaching and replacing a TOR leaves the datasheet check as it was", { skip }, async () => {
  const { owner, jobId } = await job("datasheet");
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex") } });
  assert.deepEqual(await requestSocCheck(jobId, items[0].id), { ok: true, requested: 1 });
  // Item 2 checked by a manual import.
  const content = SONNET_RUN.results.find((r) => r.row_type === "content_row") ?? SONNET_RUN.results[1];
  const form = new FormData();
  form.set("results", new File([JSON.stringify({ ...SONNET_RUN, results: [{ ...content, row: 4, item: "2" }, { ...content, row: 5, item: "2.1" }] })], "results.json"));
  form.set("skillVersion", "v1");
  form.set("model", "claude-cli:sonnet");
  const imported = await importRoute(new Request(`http://localhost/api/soc/jobs/${jobId}/major-items/${items[1].id}/import`, { method: "POST", body: form }), { params: Promise.resolve({ id: jobId, itemId: items[1].id }) });
  assert.equal(imported.status, 201, JSON.stringify(await imported.clone().json()));

  const snapshot = async () => ({
    items: await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } }),
    requests: await prisma.socCheckRequest.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } }),
    results: await prisma.socCheckResult.findMany({ where: { jobId }, orderBy: { rowNumber: "asc" } }),
    runs: await prisma.socCheckRun.findMany({ where: { jobId } }),
  });
  const before = await snapshot();
  assert.equal(before.results.length, 2);
  assert.equal((await attach(jobId, buildTablePdf([torPage(30)]))).status, 201);
  assert.equal((await attach(jobId, buildTablePdf([torPage(7)]))).status, 201);
  assert.deepEqual(await snapshot(), before);
});
