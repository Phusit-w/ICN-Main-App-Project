// The Claude step of TOR Match (tor-match ticket 07): ส่งให้ Claude ตัดสิน sends
// the lines code could not settle as one Check Request of kind "tor_judge" on
// the SOC Runner queue (claim, heartbeat, cancel, failure as a check), and the
// runner's answer is stored beside each line's code outcome (seam 4). Driven
// through the server actions and the runner routes with the signed-in user
// stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import { buildXlsx } from "@/test/xlsx-fixture";
import { buildZip } from "@/test/docx-fixture";
import { newSocRunnerToken } from "@/lib/soc-runner-token";
import { SOC_CHECK_REQUEST_STALE_MS, SOC_RUNNER_FOR_TOR_JUDGE } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { requestSocTorJudge, requestSocCheck, cancelSocCheckRequest } = await import("@/actions/socCheckRequests");
const { POST: torRoute } = await import("@/app/api/soc/jobs/[id]/tor/route");
const { createImportedSocJob } = await import("@/lib/soc");
const { torMatchView } = await import("@/lib/soc-tor");
const { parseTorJudgeResults } = await import("@/lib/soc-tor-judge");
const { uploadSocSkillPackage } = await import("@/lib/soc-skill-package");
const { POST: claimRoute } = await import("@/app/api/soc-runner/claim/route");
const { GET: documentRoute } = await import("@/app/api/soc-runner/requests/[id]/documents/[documentId]/route");
const { POST: reportRoute } = await import("@/app/api/soc-runner/requests/[id]/report/route");
const { POST: submitRoute } = await import("@/app/api/soc-runner/requests/[id]/submit/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");
const SKILL = buildZip({ "tor-word-compliance-check/SKILL.md": "---\nname: tor-word-compliance-check\n---\n\n# skill\n" }, { deflate: true });
const SOC_ROWS = [
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"],
  ["1", "ระบบกล้องวงจรปิด", null, null],
  ["1.1", "กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", "8 ล้านพิกเซล", "Brochure หน้า 3"],
  ["1.2", "กล้องต้องบันทึกภาพได้ไม่น้อยกว่า 7 วัน", "30 วัน", "Brochure หน้า 4"],
  ["2", "ระบบเครือข่าย", null, null],
  ["2.1", "สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต", "48 พอร์ต", "Brochure หน้า 5"],
];
// 1.2 and 2.1 differ in a number: two ความหมายต่าง lines go to Claude.
const TOR: TablePage = {
  columns: [], rows: [],
  lines: [
    "1. ระบบกล้องวงจรปิด",
    "1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล",
    "1.2 กล้องต้องบันทึกภาพได้ไม่น้อยกว่า 30 วัน",
    "2. ระบบเครือข่าย",
    "2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 48 พอร์ต",
  ].map((text) => ({ text })),
};

function user(username: string) {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role: "USER", appAccess: ["soc"] } });
}

async function linkRunner(owner: Actor, runnerVersion = SOC_RUNNER_FOR_TOR_JUDGE) {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), lastSeenAt: new Date(), runnerVersion, claudeLogin: "logged_in" } });
  return token;
}

function attach(jobId: string, page: TablePage = TOR) {
  const form = new FormData();
  form.set("tor", new File([buildTablePdf([page])], "TOR.pdf", { type: "application/pdf" }));
  return torRoute(new Request(`http://localhost/api/soc/jobs/${jobId}/tor`, { method: "POST", body: form }), { params: Promise.resolve({ id: jobId }) });
}

async function setup(name: string) {
  const owner = await user(name);
  signedIn = await prisma.user.create({ data: { username: `admin-${name}`, displayName: "admin", passwordHash: "x", role: "ADMIN", appAccess: ["soc"] } });
  assert.ok((await uploadSocSkillPackage({ name: "tor-word-compliance-check.skill", bytes: SKILL, version: "v-judge" })).ok);
  signedIn = owner;
  const jobId = await createImportedSocJob(owner, { title: `TOR Judge ${name}`, soc: { name: "SOC.xlsx", bytes: await buildXlsx([{ name: "SOC", rows: SOC_ROWS }]) }, evidence: [{ name: "Brochure.pdf", bytes: PDF }] });
  assert.equal((await attach(jobId)).status, 201);
  return { owner, jobId, token: await linkRunner(owner) };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const at = (requestId: string) => `http://localhost/api/soc-runner/requests/${requestId}`;
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

type JudgeLine = { line: number; outcome: string; item: string | null; socRow: number | null; socText: string | null; torText: string | null; torPage: number | null; image: boolean };
type Claimed = { id: string; kind: string; needsRunner: string; skill: { url: string } | null; tor: { scanned: boolean; document: { id: string; url: string } } | null; lines: JudgeLine[] };

async function claim(token: string) {
  const response = await claimRoute(new Request("http://localhost/api/soc-runner/claim", { method: "POST", headers: auth(token) }));
  return ((await response.json()) as { request: Claimed | null }).request;
}

function report(token: string, requestId: string, body: unknown) {
  return reportRoute(new Request(`${at(requestId)}/report`, { method: "POST", headers: { ...auth(token), "content-type": "application/json" }, body: JSON.stringify(body) }), params({ id: requestId }));
}

function submit(token: string, requestId: string, results: unknown) {
  const form = new FormData();
  form.set("results", new File([JSON.stringify(results)], "tor-judge.json", { type: "application/json" }));
  form.set("model", "claude-cli:sonnet");
  return submitRoute(new Request(`${at(requestId)}/submit`, { method: "POST", headers: auth(token), body: form }), params({ id: requestId }));
}

const answer = (lines: JudgeLine[], outcome = "ต่างแค่รูปแบบ") => ({ lines: lines.map((l) => ({ line: l.line, outcome, reason: `บรรทัด ${l.line}: OCR อ่านเลขผิด` })) });
const stored = async (jobId: string) =>
  (await prisma.socTorMatchLine.findMany({ where: { match: { jobId } }, orderBy: { position: "asc" } })).map((l) => [l.item, l.outcome, l.claudeOutcome, l.claudeReason]);

// ---- Claude's answer (pure) ----------------------------------------------------

test("an answer must judge every asked line once, with a known outcome and a reason", () => {
  const ok = parseTorJudgeResults({ lines: [{ line: 2, outcome: "ตรง", reason: " OCR อ่าน ๘ เป็น 8 " }, { line: 5, outcome: "ความหมายต่าง", reason: "8 core กับ 12 core" }] }, [2, 5]);
  assert.deepEqual(ok, { ok: true, lines: [{ line: 2, outcome: "ตรง", reason: "OCR อ่าน ๘ เป็น 8" }, { line: 5, outcome: "ความหมายต่าง", reason: "8 core กับ 12 core" }] });

  const errors = (results: unknown) => { const parsed = parseTorJudgeResults(results, [2, 5]); return parsed.ok ? [] : parsed.errors; };
  assert.match(errors({ lines: [{ line: 2, outcome: "ผ่าน", reason: "x" }, { line: 5, outcome: "ตรง", reason: "x" }] }).join(), /outcome "ผ่าน"/);
  assert.match(errors({ lines: [{ line: 2, outcome: "ไม่พบใน SOC", reason: "x" }, { line: 5, outcome: "ตรง", reason: "x" }] }).join(), /outcome/, "only the four judge outcomes");
  assert.match(errors({ lines: [{ line: 2, outcome: "ตรง", reason: "x" }] }).join(), /ไม่มีผลของบรรทัด 5/);
  assert.match(errors({ lines: [{ line: 2, outcome: "ตรง", reason: "x" }, { line: 5, outcome: "ตรง", reason: "x" }, { line: 9, outcome: "ตรง", reason: "x" }] }).join(), /บรรทัด 9 ไม่ได้อยู่ในคำขอ/);
  assert.match(errors({ lines: [{ line: 2, outcome: "ตรง", reason: "x" }, { line: 2, outcome: "ตรง", reason: "x" }, { line: 5, outcome: "ตรง", reason: "x" }] }).join(), /ซ้ำ/);
  assert.match(errors({ lines: [{ line: 2, outcome: "ตรง", reason: " " }, { line: 5, outcome: "ตรง", reason: "x" }] }).join(), /reason/);
  assert.match(errors([{ line: 2 }]).join(), /lines/);
});

// ---- Request kind on the queue ---------------------------------------------------

test("ส่งให้ Claude ตัดสิน queues one tor_judge request of the leftover lines; only a new enough runner claims it", { skip }, async () => {
  const { owner, jobId, token } = await setup("claim");
  const view = await torMatchView(jobId);
  assert.equal(view?.judgeable, 2);
  assert.equal(view?.judge, null);

  assert.deepEqual(await requestSocTorJudge(jobId), { ok: true, lines: 2 });
  assert.equal((await requestSocTorJudge(jobId)).ok, false, "one open request per TOR Match");
  const request = await prisma.socCheckRequest.findFirstOrThrow({ where: { jobId } });
  assert.deepEqual([request.kind, request.majorItemId, request.requestedById, request.torLineIds.length], ["tor_judge", null, owner.id, 2]);
  assert.equal((await torMatchView(jobId))?.judge?.state, "requested");

  // A runner older than SOC_RUNNER_FOR_TOR_JUDGE is not handed its user's request.
  const old = await user("old");
  const oldToken = await linkRunner(old, "0.7.0");
  signedIn = old;
  const oldJob = await createImportedSocJob(old, { title: "old runner", soc: { name: "SOC.xlsx", bytes: await buildXlsx([{ name: "SOC", rows: SOC_ROWS }]) }, evidence: [] });
  assert.equal((await attach(oldJob)).status, 201);
  assert.equal((await requestSocTorJudge(oldJob)).ok, true);
  assert.equal(await claim(oldToken), null);
  assert.equal((await torMatchView(oldJob))?.judge?.runnerTooOld, "tor_judge");

  const claimed = await claim(token);
  assert.ok(claimed);
  assert.deepEqual([claimed.id, claimed.kind, claimed.needsRunner, Boolean(claimed.skill)], [request.id, "tor_judge", SOC_RUNNER_FOR_TOR_JUDGE, true]);
  assert.deepEqual(claimed.lines.map((l) => [l.item, l.outcome, l.torPage, l.image]), [["1.2", "ความหมายต่าง", 1, false], ["2.1", "ความหมายต่าง", 1, false]]);
  assert.match(claimed.lines[0].socText ?? "", /7 วัน/);
  assert.match(claimed.lines[0].torText ?? "", /30 วัน/);
  assert.equal(claimed.tor?.scanned, false);
  // The TOR ต้นฉบับ downloads; the job's other files don't.
  const tor = await documentRoute(new Request(`http://localhost${claimed.tor!.document.url}`, { headers: auth(token) }), params({ id: claimed.id, documentId: claimed.tor!.document.id }));
  assert.equal(tor.status, 200);
  const evidence = await prisma.socDocument.findFirstOrThrow({ where: { jobId, type: "EVIDENCE" } });
  assert.equal((await documentRoute(new Request("http://localhost/x", { headers: auth(token) }), params({ id: claimed.id, documentId: evidence.id }))).status, 404);
  // No major item moved.
  assert.deepEqual([...new Set((await prisma.socMajorItem.findMany({ where: { jobId } })).map((m) => m.state))], ["not_checked"]);
});

test("a TOR on a scanned TOR or a picture page sends that page as an image", { skip }, async () => {
  const { jobId, token } = await setup("image");
  const match = await prisma.socTorMatch.findUniqueOrThrow({ where: { jobId } });
  await prisma.socTorMatch.update({ where: { id: match.id }, data: { pages: [{ text: "", picture: true }] } });
  await requestSocTorJudge(jobId);
  assert.deepEqual((await claim(token))?.lines.map((l) => l.image), [true, true], "a picture page of a text TOR");

  await prisma.socTorMatch.update({ where: { id: match.id }, data: { pages: [{ text: "", picture: false }], scanned: true } });
  const claimed = await claim(token); // the same running request, handed back
  assert.deepEqual([claimed?.tor?.scanned, claimed?.lines.map((l) => l.image)], [true, [true, true]]);
});

test("valid results are stored beside the code outcome and close the request; bad ones are rejected and fail it", { skip }, async () => {
  const { jobId, token } = await setup("import");
  await requestSocTorJudge(jobId);
  let claimed = (await claim(token))!;
  assert.equal((await report(token, claimed.id, { state: "running", progress: "Claude กำลังตัดสิน 2 บรรทัด" })).status, 200);
  assert.equal((await torMatchView(jobId))?.judge?.progressNote, "Claude กำลังตัดสิน 2 บรรทัด");

  // Unknown outcome: rejected, nothing stored, the request fails with the reason.
  const bad = await submit(token, claimed.id, { lines: claimed.lines.map((l) => ({ line: l.line, outcome: "ผ่าน", reason: "x" })) });
  assert.equal(bad.status, 422);
  assert.match(((await bad.json()) as { errors: string[] }).errors.join(), /outcome "ผ่าน"/);
  assert.deepEqual((await stored(jobId)).filter((l) => l[2] !== null), []);
  const failed = await torMatchView(jobId);
  assert.equal(failed?.judge?.state, "failed");
  assert.match(failed?.judge?.failureReason ?? "", /ไม่ผ่านการตรวจสอบ/);

  // Missing a line, then an extra line: rejected too.
  for (const results of [{ lines: answer(claimed.lines).lines.slice(1) }, { lines: [...answer(claimed.lines).lines, { line: 99, outcome: "ตรง", reason: "x" }] }]) {
    await requestSocTorJudge(jobId);
    claimed = (await claim(token))!;
    assert.equal((await submit(token, claimed.id, results)).status, 422);
  }

  await requestSocTorJudge(jobId);
  claimed = (await claim(token))!;
  const ok = await submit(token, claimed.id, answer(claimed.lines));
  assert.equal(ok.status, 201, JSON.stringify(await ok.clone().json()));
  assert.deepEqual(await stored(jobId), [
    ["1", "ตรง", null, null],
    ["1.1", "ตรง", null, null],
    ["1.2", "ความหมายต่าง", "ต่างแค่รูปแบบ", "บรรทัด 2: OCR อ่านเลขผิด"],
    ["2", "ตรง", null, null],
    ["2.1", "ความหมายต่าง", "ต่างแค่รูปแบบ", "บรรทัด 4: OCR อ่านเลขผิด"],
  ]);
  const done = await torMatchView(jobId);
  assert.equal(done?.judge?.state, "done");
  assert.deepEqual(done?.counts?.["ความหมายต่าง"], 2, "the code counts stay");
  assert.equal(await claim(token), null);
});

test("a tor_judge request is cancelled, paused, released and failed like a check, and replacing the TOR cancels it", { skip }, async () => {
  const { owner, jobId, token } = await setup("states");
  await requestSocTorJudge(jobId);
  let request = await prisma.socCheckRequest.findFirstOrThrow({ where: { jobId, state: "requested" } });
  assert.deepEqual(await cancelSocCheckRequest(jobId, request.id), { ok: true });
  const beat = await heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", { method: "POST", headers: { ...auth(token), "content-type": "application/json" }, body: JSON.stringify({ runnerVersion: SOC_RUNNER_FOR_TOR_JUDGE, claudeLogin: "logged_in" }) }));
  assert.ok(((await beat.json()) as { cancelled: string[] }).cancelled.includes(request.id));

  // Quota pause: waits for its resume time, then the same runner claims it again.
  await requestSocTorJudge(jobId);
  let claimed = (await claim(token))!;
  assert.equal((await report(token, claimed.id, { state: "paused_quota", resumeAt: new Date(Date.now() + 60_000).toISOString() })).status, 200);
  assert.equal(await claim(token), null);
  await prisma.socCheckRequest.update({ where: { id: claimed.id }, data: { resumeAt: new Date(Date.now() - 1000) } });
  assert.equal((await claim(token))?.id, claimed.id);

  // A quiet runner: the claim goes back to requested and is handed out again.
  await prisma.socCheckRequest.update({ where: { id: claimed.id }, data: { lastSeenAt: new Date(Date.now() - SOC_CHECK_REQUEST_STALE_MS - 1000) } });
  const otherLink = await linkRunner(owner);
  assert.equal((await claim(otherLink))?.id, claimed.id);

  assert.equal((await report(otherLink, claimed.id, { state: "failed", reason: "Claude CLI exited with code 1" })).status, 200);
  request = await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: claimed.id } });
  assert.deepEqual([request.state, request.failureReason], ["failed", "Claude CLI exited with code 1"]);
  assert.deepEqual([...new Set((await prisma.socMajorItem.findMany({ where: { jobId } })).map((m) => m.state))], ["not_checked"]);

  // Replacing the TOR ต้นฉบับ cancels an open one; the runner is told at its heartbeat.
  await requestSocTorJudge(jobId);
  claimed = (await claim(otherLink))!;
  assert.equal((await attach(jobId)).status, 201);
  assert.equal((await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: claimed.id } })).state, "cancelled");
  assert.equal((await submit(otherLink, claimed.id, answer(claimed.lines))).status, 409);
  assert.equal((await torMatchView(jobId))?.judge, null, "the new TOR Match has no Claude step yet");
});

test("a tor_judge request and a major item check share the queue in request order", { skip }, async () => {
  const { jobId, token } = await setup("order");
  await requestSocTorJudge(jobId);
  const item = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId }, orderBy: { position: "asc" } });
  assert.deepEqual(await requestSocCheck(jobId, item.id), { ok: true, requested: 1 });
  const first = (await claim(token))!;
  assert.equal(first.kind, "tor_judge");
  assert.equal((await submit(token, first.id, answer(first.lines))).status, 201);
  const second = (await claim(token)) as unknown as { kind: string; majorItem: { id: string } };
  assert.deepEqual([second.kind, second.majorItem.id], ["check", item.id]);
});
