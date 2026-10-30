// The AI step of กรอกอ้างอิง (proposal-build 10), seam B: ให้ Claude หาอ้างอิง
// queues one Check Request of kind "reference_fill" for the ไม่พบ rows of one
// major item on the SOC Runner queue (claim, cancel, failure as a check), and
// the runner's suggestions are stored in the run's rows as source "ai" beside
// the code step's. Driven through the actions and the runner routes with the
// signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildSocDocx } from "@/test/docx-fixture";
import { buildTablePdf } from "@/test/pdf-table-fixture";
import { buildZip } from "@/test/docx-fixture";
import { newSocRunnerToken } from "@/lib/soc-runner-token";
import { SOC_RUNNER_FOR_REFERENCE_FILL } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => { /* no cache in tests */ } } });

const { createProposalAction, startReferenceFillAction, requestReferenceFillAiAction, decideReferenceFillRowAction, acceptFillFromLabelsAction } = await import("@/actions/proposal");
const { cancelSocCheckRequest } = await import("@/actions/socCheckRequests");
const { attachSocVersion } = await import("@/lib/proposal-soc");
const { addProposalDatasheets } = await import("@/lib/proposal-datasheet");
const { getReferenceFill } = await import("@/lib/proposal-reference-fill");
const { parseReferenceFillResults, AI_FILL_NO_ROWS, AI_FILL_OPEN } = await import("@/lib/reference-fill-ai");
const { uploadSocSkillPackage } = await import("@/lib/soc-skill-package");
const { POST: claimRoute } = await import("@/app/api/soc-runner/claim/route");
const { GET: documentRoute } = await import("@/app/api/soc-runner/requests/[id]/documents/[documentId]/route");
const { POST: submitRoute } = await import("@/app/api/soc-runner/requests/[id]/submit/route");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const SKILL = buildZip({ "tor-word-compliance-check/SKILL.md": "---\nname: tor-word-compliance-check\n---\n\n# skill\n" }, { deflate: true });
// 5.1 is found by its label; 5.3 and 5.4 are ไม่พบ in major item 5; 6.1 is ไม่พบ in major item 6.
const SOC = () => buildSocDocx([
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"],
  ["5", "ระบบกล้อง", "", ""],
  ["5.1", "กล้องความละเอียด 4K ไม่น้อยกว่า 3840 x 2160 pixels", "", ""],
  ["5.3", "Gigabit Ethernet port with PoE", "", ""],
  ["5.4", "Operating temperature minus 10 to 50 Celsius", "", ""],
  ["6", "ระบบบันทึก", "", ""],
  ["6.1", "Storage capacity 8 TB RAID 5", "", ""],
]);
const pdf = (pages: string[][]) => buildTablePdf(pages.map((lines) => ({ columns: [], rows: [], lines: lines.map((text) => ({ text })) })));
const CAMERA = () => pdf([["Overview"], ["5.1 Resolution 3840 x 2160 pixels"], ["Network: 1 x GbE RJ45, PoE 802.3af"], ["Environment: -10 C to 50 C"]]);

type Setup = Awaited<ReturnType<typeof setup>>;
async function user(username: string, role: "USER" | "ADMIN" = "USER") {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role, appAccess: ["soc"] } });
}

async function linkRunner(owner: Actor, runnerVersion = SOC_RUNNER_FOR_REFERENCE_FILL) {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), lastSeenAt: new Date(), runnerVersion, claudeLogin: "logged_in" } });
  return token;
}

async function setup(name: string, { runner = true }: { runner?: boolean } = {}) {
  const admin = await user(`admin-${name}`, "ADMIN");
  signedIn = admin;
  assert.ok((await uploadSocSkillPackage({ name: "tor-word-compliance-check.skill", bytes: SKILL, version: "v-fill" })).ok);
  const owner = await user(name);
  signedIn = owner;
  const created = await createProposalAction(`Fill ${name}`);
  assert.ok(created.ok);
  await attachSocVersion(owner, { id: created.id, title: `Fill ${name}` }, { name: "soc.docx", bytes: SOC() });
  await addProposalDatasheets(created.id, [{ name: "บทที่ 2/Camera.pdf", bytes: CAMERA() }]);
  const started = await startReferenceFillAction(created.id);
  assert.ok(started.ok);
  return { owner, proposalId: created.id, runId: started.runId, token: runner ? await linkRunner(owner) : null };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

type Claimed = { id: string; kind: string; needsRunner: string; skill: { url: string } | null; rows: { row: number; item: string; tor: string; kind: string; majorItem: string | null }[] | null; documents: { id: string; url: string; name: string }[] };
async function claim(token: string) {
  const response = await claimRoute(new Request("http://localhost/api/soc-runner/claim", { method: "POST", headers: auth(token) }));
  return ((await response.json()) as { request: Claimed | null }).request;
}

function submit(token: string, requestId: string, results: unknown) {
  const form = new FormData();
  form.set("results", new File([JSON.stringify(results)], "reference-fill.json", { type: "application/json" }));
  form.set("model", "claude-cli:sonnet");
  return submitRoute(new Request(`http://localhost/api/soc-runner/requests/${requestId}/submit`, { method: "POST", headers: auth(token), body: form }), params({ id: requestId }));
}

const rowsOf = async (proposalId: string) => (await getReferenceFill(proposalId))!.rows;
const only = async (s: Setup, item: string) => (await rowsOf(s.proposalId)).find((row) => row.item === item)!;

// ---- Claude's answer (pure) ----------------------------------------------------

test("an answer must cover every asked row once, with known documents, pages in the file and a snippet", () => {
  const pages = new Map([["d1", 4]]);
  const good = { row: 4, suggestions: [{ document_id: "d1", page: 3, snippet: "  1 x GbE   RJ45 " }] };
  assert.deepEqual(parseReferenceFillResults({ rows: [good, { row: 5, suggestions: [] }] }, [4, 5], pages),
    { ok: true, rows: [{ row: 4, suggestions: [{ datasheetId: "d1", page: 3, snippet: "1 x GbE RJ45" }] }, { row: 5, suggestions: [] }] });

  const errors = (results: unknown) => { const parsed = parseReferenceFillResults(results, [4, 5], pages); return parsed.ok ? [] : parsed.errors; };
  const empty = { row: 5, suggestions: [] };
  assert.match(errors({ rows: [good] }).join(), /แถว 5 ไม่มีในผล/);
  assert.match(errors({ rows: [good, empty, { row: 9, suggestions: [] }] }).join(), /แถว 9 ไม่ได้อยู่ในคำขอ/);
  assert.match(errors({ rows: [good, good, empty] }).join(), /ซ้ำ/);
  assert.match(errors({ rows: [{ row: 4, suggestions: [{ document_id: "zzz", page: 1, snippet: "x" }] }, empty] }).join(), /ไม่รู้จักเอกสาร zzz/);
  assert.match(errors({ rows: [{ row: 4, suggestions: [{ document_id: "d1", page: 5, snippet: "x" }] }, empty] }).join(), /หน้า 5 ไม่อยู่ในไฟล์ \(มี 4 หน้า\)/);
  assert.match(errors({ rows: [{ row: 4, suggestions: [{ document_id: "d1", page: 0, snippet: "x" }] }, empty] }).join(), /หน้า 0/);
  assert.match(errors({ rows: [{ row: 4, suggestions: [{ document_id: "d1", page: 2, snippet: " " }] }, empty] }).join(), /snippet/);
  const many = [1, 2, 3, 4].map((page) => ({ document_id: "d1", page, snippet: "x" }));
  assert.match(errors({ rows: [{ row: 4, suggestions: many }, empty] }).join(), /ไม่เกิน 3/);
  assert.match(errors([{ row: 4 }]).join(), /rows/);
});

// ---- Request kind on the queue ---------------------------------------------------

test("ให้ Claude หาอ้างอิง queues the undecided ไม่พบ rows of one major item; one open request per item; a too-old runner is not handed it", { skip }, async () => {
  const s = await setup("queue");
  const none = (await rowsOf(s.proposalId)).filter((row) => !row.suggestions.length);
  assert.deepEqual(none.map((row) => [row.item, row.majorItem]), [["5.3", "5"], ["5.4", "5"], ["6.1", "6"]]);

  // 5.4 was decided by hand: only 5.3 goes to Claude.
  assert.ok((await decideReferenceFillRowAction(s.proposalId, s.runId, none[1].position, { status: "rejected" })).ok);
  assert.deepEqual(await requestReferenceFillAiAction(s.proposalId, s.runId, "5", false), { ok: true, rows: 1 });
  assert.deepEqual(await requestReferenceFillAiAction(s.proposalId, s.runId, "5", false), { ok: false, error: AI_FILL_OPEN });
  assert.deepEqual(await requestReferenceFillAiAction(s.proposalId, s.runId, "9", false), { ok: false, error: AI_FILL_NO_ROWS });

  const request = await prisma.socCheckRequest.findFirstOrThrow({ where: { kind: "reference_fill" } });
  assert.deepEqual([request.majorItemId, request.majorItemKey, request.rowNumbers, request.waiting, request.requestedById], [null, "5", [none[0].position], false, s.owner.id]);
  const view = (await getReferenceFill(s.proposalId))!.aiRequests;
  assert.equal(view["5"].state, "requested");
  assert.equal(view["5"].jobId, request.jobId);

  // A runner older than the kind is handed nothing; the new one gets rows, Datasheets and skill.
  await prisma.socRunnerLink.updateMany({ where: { userId: s.owner.id }, data: { runnerVersion: "0.8.0" } });
  assert.equal(await claim(s.token!), null);
  await prisma.socRunnerLink.updateMany({ where: { userId: s.owner.id }, data: { runnerVersion: SOC_RUNNER_FOR_REFERENCE_FILL } });
  const claimed = (await claim(s.token!))!;
  assert.equal(claimed.kind, "reference_fill");
  assert.equal(claimed.needsRunner, SOC_RUNNER_FOR_REFERENCE_FILL);
  assert.deepEqual(claimed.rows!.map((row) => [row.row, row.item, row.kind, row.majorItem]), [[none[0].position, "5.3", "empty", "5"]]);
  assert.ok(claimed.skill);
  assert.deepEqual(claimed.documents.map((d) => d.name), ["บทที่ 2/Camera.pdf"]);
  const file = await documentRoute(new Request(`http://localhost${claimed.documents[0].url}`, { headers: auth(s.token!) }), params({ id: claimed.id, documentId: claimed.documents[0].id }));
  assert.equal(file.status, 200);
  assert.equal((await file.arrayBuffer()).byteLength, CAMERA().byteLength);
});

test("no runner → it waits in รอคนรับ; asking again after cancel works; a moved-on SOC refuses", { skip }, async () => {
  const s = await setup("pool", { runner: false });
  assert.deepEqual(await requestReferenceFillAiAction(s.proposalId, s.runId, "6", false), { ok: true, rows: 1 });
  const request = await prisma.socCheckRequest.findFirstOrThrow({ where: { kind: "reference_fill" } });
  assert.equal(request.waiting, true);

  assert.ok((await cancelSocCheckRequest(request.jobId, request.id)).ok);
  assert.equal((await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } })).state, "cancelled");
  assert.deepEqual(await requestReferenceFillAiAction(s.proposalId, s.runId, "6", true), { ok: true, rows: 1 });

  await attachSocVersion(s.owner, { id: s.proposalId, title: "Fill pool" }, { name: "soc2.docx", bytes: SOC() });
  const moved = await requestReferenceFillAiAction(s.proposalId, s.runId, "6", true);
  assert.equal(moved.ok, false);
});

// ---- The runner's answer ---------------------------------------------------------

test("the answer lands in the rows as AI suggestions beside the code step's; rows with none stay ไม่พบ", { skip }, async () => {
  const s = await setup("answer");
  const [five3, five4] = [await only(s, "5.3"), await only(s, "5.4")];
  assert.ok((await requestReferenceFillAiAction(s.proposalId, s.runId, "5", false)).ok);
  const claimed = (await claim(s.token!))!;
  const sheet = claimed.documents[0].id;

  const before = await getReferenceFill(s.proposalId);
  const response = await submit(s.token!, claimed.id, { rows: [
    { row: five3.position, suggestions: [{ document_id: sheet, page: 3, snippet: "Network: 1 x GbE RJ45, PoE 802.3af" }, { document_id: sheet, page: 2, snippet: "5.1 Resolution" }] },
    { row: five4.position, suggestions: [] },
  ] });
  assert.equal(response.status, 201);
  assert.equal((await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: claimed.id } })).state, "done");

  const after = (await getReferenceFill(s.proposalId))!;
  const found = after.rows.find((row) => row.item === "5.3")!;
  assert.deepEqual(found.suggestions.map((x) => [x.page, x.source, x.documentName]), [[3, "ai", "Camera"], [2, "ai", "Camera"]]);
  assert.equal(found.certain, false, "an AI suggestion is never accepted in bulk");
  assert.equal(after.rows.find((row) => row.item === "5.4")!.suggestions.length, 0);
  assert.equal(after.found, before!.found + 1);
  assert.equal(after.certainUndecided, before!.certainUndecided, "รับทั้งหมดที่พบจากเลขข้อกำกับ still takes label rows only");
  assert.equal(after.aiRequests["5"].state, "done");

  // Decided like any suggestion; accept-by-label leaves it alone.
  assert.equal((await acceptFillFromLabelsAction(s.proposalId, s.runId)).ok, true);
  assert.equal((await only(s, "5.3")).decision, null);
  assert.ok((await decideReferenceFillRowAction(s.proposalId, s.runId, found.position, { status: "accepted", choice: 0 })).ok);
  assert.equal((await only(s, "5.3")).decision?.status, "accepted");
});

test("a malformed answer (unknown file, page past the end, a missing row) is rejected, stores nothing and fails the request", { skip }, async () => {
  const s = await setup("bad");
  const five3 = await only(s, "5.3");
  const cases: [string, (sheet: string) => unknown, RegExp][] = [
    ["page out of range", (sheet) => ({ rows: [{ row: five3.position, suggestions: [{ document_id: sheet, page: 99, snippet: "x" }] }, ...others(five3.position)] }), /หน้า 99 ไม่อยู่ในไฟล์/],
    ["unknown file", () => ({ rows: [{ row: five3.position, suggestions: [{ document_id: "nope", page: 1, snippet: "x" }] }, ...others(five3.position)] }), /ไม่รู้จักเอกสาร nope/],
    ["a missing row", () => ({ rows: [] }), /ไม่มีในผล/],
  ];
  const others = (except: number) => [{ row: except + 1, suggestions: [] }];
  for (const [label, answer, expected] of cases) {
    assert.ok((await requestReferenceFillAiAction(s.proposalId, s.runId, "5", false)).ok, label);
    const claimed = (await claim(s.token!))!;
    // 5.3 and 5.4 are both asked: add the second row to the cases that name it.
    const rows = (answer(claimed.documents[0].id) as { rows: { row: number }[] });
    const asked = claimed.rows!.map((r) => r.row);
    for (const position of asked) if (position !== five3.position && !rows.rows.some((r) => r.row === position) && label !== "a missing row") (rows.rows as unknown[]).push({ row: position, suggestions: [] });
    const response = await submit(s.token!, claimed.id, rows);
    const body = (await response.json()) as { errors?: string[]; error?: string };
    assert.notEqual(response.status, 200, label);
    assert.match(JSON.stringify(body), expected, label);
    const request = await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: claimed.id } });
    assert.equal(request.state, "failed", label);
    assert.match(request.failureReason ?? "", expected, label);
    assert.equal((await rowsOf(s.proposalId)).filter((row) => row.suggestions.some((x) => x.source === "ai")).length, 0, `${label}: nothing stored`);
  }
});
