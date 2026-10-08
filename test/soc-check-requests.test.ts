// Check Requests and the SOC Runner API (ADR 0008, ticket 13, seam 2): a user
// asks for a check of a major item (or the whole SOC); only their own SOC
// Runner may claim it, oldest first, download the files and the pinned skill,
// report its state and submit results through the ticket 05 import. A claim
// whose runner goes quiet returns to `requested`. Driven through the server
// actions and the runner routes with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx, buildZip } from "@/test/docx-fixture";
import { majorItemKey } from "@/lib/soc-major-items";
import { newSocRunnerToken } from "@/lib/soc-runner-token";
import { majorItemStateText, SOC_CHECK_REQUEST_STALE_MS, type SocCheckRequestView } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { requestSocCheck, requestAllSocChecks, requestSocRowRechecks, cancelSocCheckRequest, continueSocCheckWithoutMissing, setSocMajorItemSkipped } = await import("@/actions/socCheckRequests");
const { createImportedSocJob, listSocJobs } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");
const { uploadSocSkillPackage, setCurrentSocSkillPackage } = await import("@/lib/soc-skill-package");
const { majorItemRequestViews } = await import("@/lib/soc-check-requests");
const { POST: claimRoute } = await import("@/app/api/soc-runner/claim/route");
const { GET: documentRoute } = await import("@/app/api/soc-runner/requests/[id]/documents/[documentId]/route");
const { GET: skillRoute } = await import("@/app/api/soc-runner/requests/[id]/skill/route");
const { POST: reportRoute } = await import("@/app/api/soc-runner/requests/[id]/report/route");
const { POST: submitRoute } = await import("@/app/api/soc-runner/requests/[id]/submit/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

type Row = Record<string, unknown>;
type RunFile = { mode: string; options: string[]; results: Row[] } & Record<string, unknown>;

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/soc/${name}`, import.meta.url)));
const SOC_DEMO = fixture("SOC_Demo.docx");
const SONNET_RUN = JSON.parse(new TextDecoder().decode(fixture("results_sonnet.json"))) as RunFile;
const SOC_CHECK = buildDocx("<w:p><w:r><w:t>ผลการตรวจสอบ SOC</w:t></w:r></w:p>");
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");
const SKILL = buildZip({ "tor-word-compliance-check/SKILL.md": "---\nname: tor-word-compliance-check\n---\n\n# skill\n" }, { deflate: true });

function runFor(key: string): RunFile {
  const copy = structuredClone(SONNET_RUN);
  copy.results = copy.results.filter((row) => majorItemKey(String(row.item)) === key);
  return copy;
}

function user(username: string, role = "USER", appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role, appAccess } });
}

// A Runner Link for `owner`, seen just now; returns its token.
async function linkRunner(owner: Actor, claudeLogin = "logged_in") {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({
    data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), lastSeenAt: new Date(), runnerVersion: "0.1.0", claudeLogin },
  });
  return token;
}

async function uploadSkill(version: string) {
  signedIn = await prisma.user.findFirst({ where: { role: "ADMIN" } }) ?? await user(`admin-${version}`, "ADMIN");
  const uploaded = await uploadSocSkillPackage({ name: "tor-word-compliance-check.skill", bytes: SKILL, version });
  assert.ok(uploaded.ok, JSON.stringify(uploaded));
  return uploaded;
}

async function setup() {
  const alice = await user("alice");
  const bob = await user("bob");
  const jobId = await createImportedSocJob(alice, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "Datasheet_Demo.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  await uploadSkill("v1");
  return { alice, bob, jobId, items, item1: items.find((m) => m.key === "1")! };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const at = (requestId: string) => `http://localhost/api/soc-runner/requests/${requestId}`;
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

type Claimed = { id: string; job: { id: string }; majorItem: { id: string; key: string; label: string }; acknowledgedMissing: string[]; rows: { row: number; item: string }[]; skill: { version: string; url: string } | null; documents: { id: string; type: string; name: string; url: string }[] };

async function claim(token: string) {
  const response = await claimRoute(new Request("http://localhost/api/soc-runner/claim", { method: "POST", headers: auth(token) }));
  return { status: response.status, body: (await response.json()) as { request: Claimed | null; error?: string; message?: string } };
}

function download(token: string, url: string) {
  const [, requestId, kind, documentId] = /requests\/([^/]+)\/(documents|skill)\/?(.*)$/.exec(url)!;
  const request = new Request(`http://localhost${url}`, { headers: auth(token) });
  return kind === "skill" ? skillRoute(request, params({ id: requestId })) : documentRoute(request, params({ id: requestId, documentId }));
}

function report(token: string, requestId: string, body: unknown) {
  return reportRoute(new Request(`${at(requestId)}/report`, { method: "POST", headers: { ...auth(token), "content-type": "application/json" }, body: JSON.stringify(body) }), params({ id: requestId }));
}

function submit(token: string, requestId: string, results: unknown, fields: { skillVersion?: string; model?: string } = {}) {
  const form = new FormData();
  form.set("results", new File([JSON.stringify(results)], "results.json", { type: "application/json" }));
  form.set("socCheck", new File([SOC_CHECK], "SOC_Check-ข้อ1.docx"));
  form.set("model", fields.model ?? "claude-cli:sonnet");
  if (fields.skillVersion) form.set("skillVersion", fields.skillVersion);
  return submitRoute(new Request(`${at(requestId)}/submit`, { method: "POST", headers: auth(token), body: form }), params({ id: requestId }));
}

function heartbeat(token: string, claudeLogin = "logged_in") {
  return heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", { method: "POST", headers: { ...auth(token), "content-type": "application/json" }, body: JSON.stringify({ runnerVersion: "0.1.0", claudeLogin }) }));
}

const itemState = async (id: string) => (await prisma.socMajorItem.findUniqueOrThrow({ where: { id } })).state;

// ---- Requesting and cancelling ------------------------------------------------

test("ตรวจ creates a Check Request owned by the clicking user, audited, and the item shows requested", { skip }, async () => {
  const { bob, jobId, item1 } = await setup();
  signedIn = bob; // any soc user may request on any imported job
  const result = await requestSocCheck(jobId, item1.id);
  assert.deepEqual(result, { ok: true, requested: 1 });

  const requests = await prisma.socCheckRequest.findMany();
  assert.equal(requests.length, 1);
  assert.deepEqual([requests[0].requestedById, requests[0].state, requests[0].priorState, requests[0].majorItemId], [bob.id, "requested", "not_checked", item1.id]);
  assert.equal(await itemState(item1.id), "requested");
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "CHECK_REQUESTED", actorId: bob.id } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_CHECK_REQUESTED", actorId: bob.id, entityId: jobId } }), 1);

  // A second click while it is open is refused.
  const again = await requestSocCheck(jobId, item1.id);
  assert.equal(again.ok, false);
  assert.equal(await prisma.socCheckRequest.count(), 1);
});

test("ตรวจทั้งชุด queues every unchecked major item, and claims follow them oldest first", { skip }, async () => {
  const { alice, jobId, items, item1 } = await setup();
  assert.ok(items.length >= 2, "SOC_Demo has several major items");
  const token = await linkRunner(alice);
  signedIn = alice;
  // One item is already checked (manually): ตรวจทั้งชุด leaves it alone.
  const imported = await importLocalCheckRun(alice, { jobId, majorItemId: item1.id, results: runFor("1"), socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: { skillVersion: "v0", model: "m", source: "manual" } });
  assert.ok(imported.ok);

  const result = await requestAllSocChecks(jobId);
  assert.deepEqual(result, { ok: true, requested: items.length - 1 });
  assert.equal(await itemState(item1.id), "checked");

  const order: string[] = [];
  for (let i = 0; i < items.length - 1; i += 1) {
    const { body } = await claim(token);
    assert.ok(body.request);
    order.push(body.request.majorItem.id);
    // Items without rows in the fixture are rejected, which closes them as failed.
    await submit(token, body.request.id, runFor(body.request.majorItem.key));
  }
  assert.deepEqual(order, items.filter((m) => m.id !== item1.id).map((m) => m.id));
  assert.equal((await claim(token)).body.request, null);
});

test("ไม่ต้องตรวจ: a skipped item is left out of ตรวจทั้งชุด and progress, can't be requested, and switches back", { skip }, async () => {
  const { alice, jobId, items, item1 } = await setup();
  signedIn = alice;
  assert.deepEqual(await setSocMajorItemSkipped(jobId, item1.id, true), { ok: true });
  const audit = await prisma.socAuditEvent.findFirst({ where: { jobId, action: "MAJOR_ITEM_SKIPPED" } });
  assert.equal((audit?.detail as { majorItem?: string } | null)?.majorItem, item1.label);

  const refused = await requestSocCheck(jobId, item1.id);
  assert.equal(refused.ok, false);
  assert.match(!refused.ok ? refused.error : "", /ไม่ต้องตรวจ/);
  const manual = await importLocalCheckRun(alice, { jobId, majorItemId: item1.id, results: runFor("1"), socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: { skillVersion: "v0", model: "m", source: "manual" } });
  assert.equal(manual.ok, false);
  assert.deepEqual(await requestAllSocChecks(jobId), { ok: true, requested: items.length - 1 });
  assert.equal(await itemState(item1.id), "not_checked");
  const listed = (await listSocJobs(alice)).find((job) => job.id === jobId);
  assert.equal(listed?.majorItemProgress?.total, items.length - 1);

  // An item with an open request can't be set aside; it has to finish or be cancelled first.
  const other = items.find((m) => m.id !== item1.id)!;
  const busy = await setSocMajorItemSkipped(jobId, other.id, true);
  assert.equal(busy.ok, false);

  assert.deepEqual(await setSocMajorItemSkipped(jobId, item1.id, false), { ok: true });
  assert.deepEqual(await requestSocCheck(jobId, item1.id), { ok: true, requested: 1 });
});

test("claims are oldest first across jobs", { skip }, async () => {
  const { alice, jobId, items } = await setup();
  const token = await linkRunner(alice);
  const otherJob = await createImportedSocJob(alice, { title: "Second", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "a.pdf", bytes: PDF }] });
  const otherItem = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId: otherJob, key: "1" } });
  signedIn = alice;
  await requestSocCheck(otherJob, otherItem.id);
  await requestSocCheck(jobId, items[1].id);
  await requestSocCheck(jobId, items[0].id);
  const first = await claim(token);
  assert.equal(first.body.request?.majorItem.id, otherItem.id);
});

test("a request can be cancelled before it is claimed, by its requester or ADMIN only", { skip }, async () => {
  const { alice, bob, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  const request = await prisma.socCheckRequest.findFirstOrThrow();

  signedIn = bob;
  await assert.rejects(cancelSocCheckRequest(jobId, request.id), /FORBIDDEN/);
  signedIn = alice;
  assert.deepEqual(await cancelSocCheckRequest(jobId, request.id), { ok: true });
  assert.equal((await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } })).state, "cancelled");
  assert.equal(await itemState(item1.id), "not_checked");
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_CHECK_REQUEST_CANCELLED" } }), 1);
  assert.equal((await claim(token)).body.request, null, "a cancelled request is never claimed");

  // Once claimed, it can't be cancelled.
  await requestSocCheck(jobId, item1.id);
  const second = (await claim(token)).body.request!;
  const admin = await user("boss", "ADMIN");
  signedIn = admin;
  const refused = await cancelSocCheckRequest(jobId, second.id);
  assert.equal(refused.ok, false);
  assert.equal(await itemState(item1.id), "running");
});

test("a re-check over rows with a Final Decision warns, and the agreed rows are replaced by the runner's import", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  assert.ok((await importLocalCheckRun(alice, { jobId, majorItemId: item1.id, results: runFor("1"), socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: { skillVersion: "v0", model: "m", source: "manual" } })).ok);
  const decided = await prisma.socCheckResult.findFirstOrThrow({ where: { majorItemId: item1.id }, orderBy: { rowNumber: "asc" } });
  await prisma.socCheckResult.update({ where: { id: decided.id }, data: { reviewedAt: new Date(), reviewedById: alice.id } });

  const warned = await requestSocCheck(jobId, item1.id);
  assert.equal(warned.ok, false);
  assert.deepEqual(!warned.ok && warned.confirmedRows, [{ rowNumber: decided.rowNumber, item: decided.item }]);
  assert.equal(await prisma.socCheckRequest.count(), 0);

  assert.deepEqual(await requestSocCheck(jobId, item1.id, [decided.rowNumber]), { ok: true, requested: 1 });
  const claimed = (await claim(token)).body.request!;
  assert.equal((await submit(token, claimed.id, runFor("1"))).status, 201);
  assert.equal(await prisma.socCheckResult.count({ where: { majorItemId: item1.id, reviewedAt: { not: null } } }), 0);
});

test("rows picked on the review page are re-checked alone: one request per major item, the runner is told the rows, only they are replaced", { skip }, async () => {
  const { alice, jobId, items, item1 } = await setup();
  const item2 = items.find((m) => m.key === "2")!;
  const token = await linkRunner(alice);
  signedIn = alice;
  for (const [item, key] of [[item1, "1"], [item2, "2"]] as const) {
    assert.ok((await importLocalCheckRun(alice, { jobId, majorItemId: item.id, results: runFor(key), socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: { skillVersion: "v0", model: "m", source: "manual" } })).ok);
  }
  const content = { NOT: { rowType: { endsWith: "heading_row" } } };
  const rows1 = await prisma.socCheckResult.findMany({ where: { majorItemId: item1.id, ...content }, orderBy: { rowNumber: "asc" } });
  const row2 = await prisma.socCheckResult.findFirstOrThrow({ where: { majorItemId: item2.id, ...content }, orderBy: { rowNumber: "asc" } });
  // A settled row the reviewer picks is replaced: picking it is the agreement.
  await prisma.socCheckResult.update({ where: { id: rows1[1].id }, data: { finalDecision: "compliant", reviewedAt: new Date(), reviewedById: alice.id } });

  assert.deepEqual(await requestSocRowRechecks(jobId, [rows1[3].id, rows1[1].id, row2.id]), { ok: true, requested: 2 });
  const requests = await prisma.socCheckRequest.findMany({ orderBy: { createdAt: "asc" } });
  assert.deepEqual(requests.map((r) => [r.majorItemId, r.rowNumbers, r.replaceConfirmed]), [
    [item1.id, [rows1[1].rowNumber, rows1[3].rowNumber], [rows1[1].rowNumber]],
    [item2.id, [row2.rowNumber], []],
  ]);
  assert.equal(await itemState(item1.id), "requested");
  const again = await requestSocRowRechecks(jobId, [rows1[0].id]);
  assert.ok(!again.ok && /มีคำขอตรวจที่ยังไม่เสร็จ/.test(again.error));

  const claimed = (await claim(token)).body.request!;
  assert.deepEqual(claimed.rows, [rows1[1], rows1[3]].map((r) => ({ row: r.rowNumber, item: r.item })));
  // A runner that checks the whole item anyway still touches only the picked rows.
  const rerun = runFor("1");
  for (const row of rerun.results) row.detail = "ตรวจซ้ำ";
  const response = await submit(token, claimed.id, rerun);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  assert.equal(((await response.json()) as { rowCount: number }).rowCount, 2);
  const after = await prisma.socCheckResult.findMany({ where: { majorItemId: item1.id }, orderBy: { rowNumber: "asc" } });
  assert.equal(after.length, (await prisma.socCheckResult.count({ where: { majorItemId: item1.id } })));
  assert.deepEqual(after.filter((r) => r.aiDetail === "ตรวจซ้ำ").map((r) => r.rowNumber), [rows1[1].rowNumber, rows1[3].rowNumber]);
  assert.equal(after.find((r) => r.rowNumber === rows1[1].rowNumber)!.reviewedAt, null);
  assert.equal(after.length, runFor("1").results.length, "the other rows are kept");
  assert.equal(await itemState(item1.id), "checked");

  // Results without any picked row can't pass.
  const second = (await claim(token)).body.request!;
  assert.equal(second.majorItem.id, item2.id);
  const without = runFor("2");
  without.results = without.results.filter((r) => r.row !== row2.rowNumber);
  const rejected = await submit(token, second.id, without);
  assert.equal(rejected.status, 422);
  assert.equal((await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: second.id } })).state, "failed");
});

test("picking nothing, a heading row or a row of another job is refused", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  signedIn = alice;
  assert.ok((await importLocalCheckRun(alice, { jobId, majorItemId: item1.id, results: runFor("1"), socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK }, run: { skillVersion: "v0", model: "m", source: "manual" } })).ok);
  const heading = await prisma.socCheckResult.findFirstOrThrow({ where: { majorItemId: item1.id, rowType: { endsWith: "heading_row" } } });
  for (const ids of [[], [heading.id], ["not-a-row"]]) {
    const refused = await requestSocRowRechecks(jobId, ids);
    assert.equal(refused.ok, false, JSON.stringify(ids));
  }
  assert.equal(await prisma.socCheckRequest.count(), 0);
});

// ---- Isolation ------------------------------------------------------------------

test("a token for user A can never claim, download, report on or submit user B's request", { skip }, async () => {
  const { alice, bob, jobId, item1 } = await setup();
  const aliceToken = await linkRunner(alice);
  const bobToken = await linkRunner(bob);
  signedIn = bob;
  await requestSocCheck(jobId, item1.id);

  assert.equal((await claim(aliceToken)).body.request, null, "A's runner sees nothing to do");
  const bobs = (await claim(bobToken)).body.request!;
  assert.ok(bobs);

  for (const url of [bobs.skill!.url, ...bobs.documents.map((d) => d.url)]) {
    assert.equal((await download(aliceToken, url)).status, 404, url);
  }
  assert.equal((await report(aliceToken, bobs.id, { state: "failed", reason: "x" })).status, 404);
  assert.equal((await submit(aliceToken, bobs.id, runFor("1"))).status, 404);

  const request = await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: bobs.id } });
  assert.equal(request.state, "running");
  assert.equal(await prisma.socCheckResult.count(), 0);
  assert.equal(await itemState(item1.id), "running");
});

test("a revoked or unknown token is refused, and a replaced link can't touch its old claim", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  const claimed = (await claim(token)).body.request!;

  await prisma.socRunnerLink.updateMany({ data: { revokedAt: new Date(), revokeReason: "admin" } });
  assert.equal((await claim(token)).status, 401);
  assert.equal((await report(token, claimed.id, { state: "running" })).status, 401);
  assert.equal((await download(token, claimed.documents[0].url)).status, 401);
  assert.equal((await claim(newSocRunnerToken())).status, 401);

  // A new link of the same user doesn't run the old claim.
  const fresh = await linkRunner(alice);
  assert.equal((await report(fresh, claimed.id, { state: "running" })).status, 409);
});

// ---- Claim and download ---------------------------------------------------------

test("a claim hands over the job's SOC, evidence and the current skill, pinned for the request", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  const claimed = (await claim(token)).body.request!;
  assert.equal(claimed.job.id, jobId);
  assert.deepEqual([claimed.majorItem.id, claimed.majorItem.key, claimed.majorItem.label], [item1.id, "1", item1.label]);
  assert.deepEqual(claimed.acknowledgedMissing, []);
  assert.deepEqual(claimed.documents.map((d) => [d.type, d.name]), [["SOC", "SOC_Demo.docx"], ["EVIDENCE", "Datasheet_Demo.pdf"]]);
  assert.equal(claimed.skill?.version, "v1");
  assert.equal(await itemState(item1.id), "running");

  const pdf = await download(token, claimed.documents[1].url);
  assert.equal(pdf.status, 200);
  assert.deepEqual(new Uint8Array(await pdf.arrayBuffer()), PDF);

  // A newer current skill doesn't change what this request runs with.
  const v2 = await uploadSkill("v2");
  assert.ok(v2.ok && (await setCurrentSocSkillPackage(v2.id)).ok);
  const skill = await download(token, claimed.skill!.url);
  assert.equal(skill.status, 200);
  assert.equal(skill.headers.get("x-soc-skill-version"), "v1");

  // Asking again (e.g. the runner restarted) returns the same request.
  assert.equal((await claim(token)).body.request?.id, claimed.id);
});

test("with work waiting but no current skill, the claim says so and takes nothing", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  await prisma.socCurrentSkill.deleteMany();
  const token = await linkRunner(alice);
  signedIn = alice;
  assert.equal((await claim(token)).body.request, null, "nothing to do is not an error");
  await requestSocCheck(jobId, item1.id);
  const { status, body } = await claim(token);
  assert.equal(status, 409);
  assert.equal(body.error, "NO_SKILL_PACKAGE");
  assert.match(body.message ?? "", /ยังไม่มี skill/);
  assert.equal(await itemState(item1.id), "requested");
});

// ---- Reports ----------------------------------------------------------------------

test("each state report moves the major item to the right state", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  const fresh = async () => {
    const item = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item1.id } });
    if (!["not_checked", "failed", "needs_documents", "checked"].includes(item.state)) throw new Error(`unexpected ${item.state}`);
    assert.ok((await requestSocCheck(jobId, item1.id)).ok);
    return (await claim(token)).body.request!;
  };

  let request = await fresh();
  assert.equal((await report(token, request.id, { state: "running", progress: "ตรวจแล้ว 3/7 แถว" })).status, 200);
  assert.equal((await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } })).progressNote, "ตรวจแล้ว 3/7 แถว");
  assert.equal(await itemState(item1.id), "running");

  assert.equal((await report(token, request.id, { state: "needs_documents", missingDocuments: ["Datasheet Core Switch"] })).status, 200);
  const item = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item1.id } });
  assert.deepEqual([item.state, item.missingDocuments], ["needs_documents", ["Datasheet Core Switch"]]);
  assert.equal((await report(token, request.id, { state: "running" })).status, 409, "a closed request takes no more reports");

  request = await fresh();
  assert.equal((await report(token, request.id, { state: "failed", reason: "Claude CLI exited with code 1" })).status, 200);
  assert.equal(await itemState(item1.id), "failed");
  assert.equal((await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } })).failureReason, "Claude CLI exited with code 1");

  request = await fresh();
  const resumeAt = new Date(Date.now() + 60 * 60 * 1000);
  assert.equal((await report(token, request.id, { state: "paused_quota", resumeAt: resumeAt.toISOString() })).status, 200);
  assert.equal(await itemState(item1.id), "paused_quota");
  assert.equal((await claim(token)).body.request, null, "not before the resume time");
  await prisma.socCheckRequest.update({ where: { id: request.id }, data: { resumeAt: new Date(Date.now() - 1000) } });
  assert.equal((await claim(token)).body.request?.id, request.id, "claimed again after it");
  assert.equal(await itemState(item1.id), "running");

  assert.equal((await report(token, request.id, { state: "needs_login" })).status, 200);
  assert.equal(await itemState(item1.id), "needs_login");
  assert.equal((await claim(token)).body.request, null, "claims wait for a Claude login");
  assert.equal((await heartbeat(token, "logged_in")).status, 200);
  assert.equal((await claim(token)).body.request?.id, request.id);

  const audited = await prisma.socAuditEvent.findMany({ where: { jobId, action: "CHECK_REQUEST_REPORTED" } });
  assert.deepEqual(audited.map((e) => (e.detail as { state: string }).state).sort(), ["failed", "needs_documents", "needs_login", "paused_quota"]);
});

test("[ตรวจต่อโดยไม่มีไฟล์นี้] re-issues the request acknowledging the missing documents, and the checked item keeps the banner", { skip }, async () => {
  const { alice, jobId, item1, items } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  assert.equal((await continueSocCheckWithoutMissing(jobId, item1.id)).ok, false, "only an item that stopped for missing documents");

  await requestSocCheck(jobId, item1.id);
  let request = (await claim(token)).body.request!;
  await report(token, request.id, { state: "needs_documents", missingDocuments: ["Datasheet Core Switch"] });
  assert.ok((await continueSocCheckWithoutMissing(jobId, item1.id)).ok);
  const reissued = await prisma.socCheckRequest.findFirstOrThrow({ where: { majorItemId: item1.id, state: "requested" } });
  assert.deepEqual([reissued.requestedById, reissued.acknowledgedMissing], [alice.id, ["Datasheet Core Switch"]]);
  const audit = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "CHECK_REQUESTED", detail: { path: ["checkRequestId"], equals: reissued.id } } });
  assert.deepEqual((audit.detail as { acknowledgedMissing: string[] }).acknowledgedMissing, ["Datasheet Core Switch"]);

  // The skill finds one more; acknowledging it keeps the first one too.
  request = (await claim(token)).body.request!;
  assert.deepEqual(request.acknowledgedMissing, ["Datasheet Core Switch"]);
  await report(token, request.id, { state: "needs_documents", missingDocuments: ["Catalog กล้อง"] });
  assert.ok((await continueSocCheckWithoutMissing(jobId, item1.id)).ok);
  request = (await claim(token)).body.request!;
  assert.deepEqual(request.acknowledgedMissing, ["Datasheet Core Switch", "Catalog กล้อง"]);

  assert.equal((await submit(token, request.id, runFor("1"))).status, 201);
  const item = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item1.id } });
  assert.deepEqual([item.state, item.missingDocuments], ["checked", ["Datasheet Core Switch", "Catalog กล้อง"]]);
  assert.deepEqual(majorItemStateText({ state: item.state, missingDocuments: item.missingDocuments as string[] }, alice.id),
    { label: "ตรวจแล้ว", detail: "ตรวจโดยไม่มีไฟล์: Datasheet Core Switch, Catalog กล้อง" });

  // An ordinary ตรวจ after uploading the file acknowledges nothing.
  await requestSocCheck(jobId, items[1].id);
  request = (await claim(token)).body.request!;
  await report(token, request.id, { state: "needs_documents", missingDocuments: ["Catalog B"] });
  assert.ok((await requestSocCheck(jobId, items[1].id)).ok);
  assert.deepEqual((await claim(token)).body.request?.acknowledgedMissing, []);
});

test("a malformed report is refused and records nothing", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  const request = (await claim(token)).body.request!;
  for (const body of [{}, { state: "done" }, { state: "failed" }, { state: "paused_quota" }, { state: "paused_quota", resumeAt: "soon" }, { state: "needs_documents", missingDocuments: [] }, { state: "running", progress: 5 }]) {
    assert.equal((await report(token, request.id, body)).status, 400, JSON.stringify(body));
  }
  assert.equal(await itemState(item1.id), "running");
});

// ---- Submit ---------------------------------------------------------------------

test("submit goes through the import: rows stored as a runner run, the request done", { skip }, async () => {
  const { alice, bob, jobId, item1 } = await setup();
  const token = await linkRunner(bob);
  signedIn = bob;
  await requestSocCheck(jobId, item1.id);
  const request = (await claim(token)).body.request!;

  const response = await submit(token, request.id, runFor("1"));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const body = (await response.json()) as { runId: string; rowCount: number };
  assert.equal(body.rowCount, 7);

  const item = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item1.id } });
  assert.deepEqual([item.state, item.runSource, item.ranById, item.requestedById, item.skillVersion, item.model], ["checked", "runner", bob.id, bob.id, "v1", "claude-cli:sonnet"]);
  const done = await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.deepEqual([done.state, done.runId], ["done", body.runId]);
  const run = await prisma.socCheckRun.findUniqueOrThrow({ where: { id: body.runId } });
  assert.deepEqual([run.source, run.importedById], ["runner", bob.id]);
  assert.equal(await prisma.socCheckResult.count({ where: { runId: body.runId } }), 7);
  assert.ok(alice); // the job's owner isn't involved
});

test("invalid results are rejected exactly like a manual upload, nothing is written, and the request fails", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  const request = (await claim(token)).body.request!;
  const bad = { ...runFor("1"), mode: "standard" };

  const manual = await importLocalCheckRun(alice, { jobId, majorItemId: item1.id, results: bad, socCheck: { name: "x.docx", bytes: SOC_CHECK }, run: { skillVersion: "v1", model: "claude-cli:sonnet", source: "runner" } });
  const response = await submit(token, request.id, bad);
  assert.equal(response.status, 422);
  const body = (await response.json()) as { errors: string[] };
  assert.ok(!manual.ok);
  // The same validation messages (the manual call also gets "a request is open").
  for (const error of body.errors) assert.ok(manual.errors.includes(error), error);
  assert.ok(body.errors.some((e) => e.includes("full_audit")));

  assert.equal(await prisma.socCheckResult.count(), 0);
  assert.equal(await prisma.socCheckRun.count(), 0);
  const failed = await prisma.socCheckRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(failed.state, "failed");
  assert.match(failed.failureReason ?? "", /full_audit/);
  assert.equal(await itemState(item1.id), "failed");
});

test("a manual import is refused while a Check Request is open on the item", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  const manual = await importLocalCheckRun(alice, { jobId, majorItemId: item1.id, results: runFor("1"), socCheck: { name: "x.docx", bytes: SOC_CHECK }, run: { skillVersion: "v1", model: "m", source: "manual" } });
  assert.equal(manual.ok, false);
  assert.match(!manual.ok ? manual.errors.join() : "", /ยกเลิกคำขอก่อนนำเข้าผลด้วยมือ/);
  assert.equal(await itemState(item1.id), "requested");
});

// ---- Stale claims ---------------------------------------------------------------

test("a claim whose runner stops sending heartbeats returns to requested; heartbeats keep it", { skip }, async () => {
  const { alice, jobId, item1 } = await setup();
  const token = await linkRunner(alice);
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  const request = (await claim(token)).body.request!;
  const old = new Date(Date.now() - SOC_CHECK_REQUEST_STALE_MS - 1000);

  // A heartbeat refreshes the claim.
  await prisma.socCheckRequest.update({ where: { id: request.id }, data: { lastSeenAt: old } });
  assert.equal((await heartbeat(token)).status, 200);
  assert.equal((await claim(token)).body.request?.id, request.id);
  assert.equal(await itemState(item1.id), "running");

  // Quiet for too long: back to requested, and the next claim takes it again.
  await prisma.socCheckRequest.update({ where: { id: request.id }, data: { lastSeenAt: old } });
  const otherRunner = await linkRunner(alice); // e.g. reinstalled: the old link is gone
  await prisma.socRunnerLink.updateMany({ where: { tokenHash: createHash("sha256").update(token).digest("hex") }, data: { revokedAt: new Date(), revokeReason: "replaced" } });
  const again = await claim(otherRunner);
  assert.equal(again.body.request?.id, request.id);
  const released = await prisma.socAuditEvent.count({ where: { jobId, action: "CHECK_REQUEST_RELEASED" } });
  assert.equal(released, 1);
  assert.equal((await submit(otherRunner, request.id, runFor("1"))).status, 201);
});

// ---- What the major item shows ----------------------------------------------------

const view = (overrides: Partial<SocCheckRequestView> = {}): SocCheckRequestView => ({
  id: "r", state: "requested", requestedById: "me", requestedByName: "สมชาย", runnerState: "online", progressNote: null, resumeAt: null, rowCount: 0, ...overrides,
});

test("every major item state shows in Thai, with รอเครื่องของคุณเปิด when the requester's runner is off", () => {
  const text = (state: string, request: SocCheckRequestView | null, extra: { missingDocuments?: string[]; failureReason?: string } = {}, viewer = "me") => majorItemStateText({ state, request, ...extra }, viewer);
  assert.deepEqual(text("not_checked", null), { label: "ยังไม่ตรวจ", detail: null });
  assert.deepEqual(text("requested", view({ runnerState: "offline" })), { label: "รอเครื่องของคุณเปิด", detail: null });
  assert.deepEqual(text("requested", view({ runnerState: "never_seen" })), { label: "รอเครื่องของคุณเปิด", detail: null });
  assert.deepEqual(text("requested", view({ runnerState: null })), { label: "รอเครื่องของคุณเปิด", detail: "คุณยังไม่ได้เชื่อม SOC Runner" });
  assert.deepEqual(text("requested", view({ runnerState: "offline" }), {}, "someone-else"), { label: "รอเครื่องของ สมชายเปิด", detail: null });
  assert.deepEqual(text("requested", view()), { label: "รอคิวตรวจ", detail: "บนเครื่องของคุณ" });
  assert.deepEqual(text("running", view({ state: "running", progressNote: "ตรวจแล้ว 3/7 แถว" })), { label: "กำลังตรวจ", detail: "ตรวจแล้ว 3/7 แถว" });
  assert.deepEqual(text("paused_quota", view({ state: "paused_quota", resumeAt: "2026-10-06T07:30:00.000Z" })), { label: "หยุดชั่วคราว", detail: "จะตรวจต่อประมาณ 14:30" });
  assert.deepEqual(text("needs_login", view({ state: "needs_login" })), { label: "รอเข้าสู่ระบบ Claude", detail: "SOC Runner บนเครื่องของคุณต้องเข้าสู่ระบบ Claude ใหม่: เปิดโปรแกรม claude แล้วพิมพ์ /login แล้วจะตรวจต่อเอง" });
  assert.deepEqual(text("needs_documents", null, { missingDocuments: ["A.pdf", "B.pdf"] }), { label: "ขาดเอกสาร", detail: "ไม่มีไฟล์: A.pdf, B.pdf" });
  assert.deepEqual(text("failed", null, { failureReason: "Claude CLI ล้มเหลว" }), { label: "ตรวจไม่สำเร็จ", detail: "Claude CLI ล้มเหลว" });
  assert.deepEqual(text("checked", null), { label: "ตรวจแล้ว", detail: null });
  assert.deepEqual(text("checked", null, { missingDocuments: ["A.pdf"] }), { label: "ตรวจแล้ว", detail: "ตรวจโดยไม่มีไฟล์: A.pdf" });
  assert.deepEqual(text("paused_quota", view({ state: "paused_quota", resumeAt: null })), { label: "หยุดชั่วคราว", detail: "รอโควตา Claude กลับมา" });
});

test("the job page sees the requester's runner state on the open request", { skip }, async () => {
  const { alice, bob, jobId, item1, items } = await setup();
  await linkRunner(alice);
  signedIn = bob;
  await requestSocCheck(jobId, items[1].id); // bob never linked a runner
  signedIn = alice;
  await requestSocCheck(jobId, item1.id);
  await prisma.socRunnerLink.updateMany({ data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) } });

  const views = await majorItemRequestViews(jobId);
  assert.equal(views.get(item1.id)?.request?.runnerState, "offline");
  assert.equal(views.get(item1.id)?.request?.requestedByName, "คุณ alice");
  assert.equal(views.get(items[1].id)?.request?.runnerState, null);
  const shown = majorItemStateText({ state: "requested", request: views.get(item1.id)?.request }, alice.id);
  assert.equal(shown.label, "รอเครื่องของคุณเปิด");
});
