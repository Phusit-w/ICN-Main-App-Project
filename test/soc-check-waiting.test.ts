// รอคนรับ (ADR 0013, proposal-build ticket 07, seam B): a user without a SOC
// Runner (or who asks for it) sends a Check Request to the team; nobody holds
// it until a teammate with a Runner takes it by their own explicit click, and
// from then on only that taker's Runner may claim it. A taker whose Runner goes
// quiet puts it back. The asker may cancel before the run; the import records
// asker and taker. Driven through the server actions and the runner routes
// with the signed-in user stubbed (prior art: soc-check-requests.test.ts).
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
import { majorItemStateText, SOC_CHECK_REQUEST_STALE_MS } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { requestSocCheck, requestAllSocChecks, cancelSocCheckRequest, takeSocCheckRequests } = await import("@/actions/socCheckRequests");
const { createImportedSocJob } = await import("@/lib/soc");
const { uploadSocSkillPackage } = await import("@/lib/soc-skill-package");
const { majorItemRequestViews, waitingCheckRequests, releaseStaleCheckRequests } = await import("@/lib/soc-check-requests");
const { waitingCheckRequestCount } = await import("@/lib/soc-request-pool");
const { POST: claimRoute } = await import("@/app/api/soc-runner/claim/route");
const { GET: documentRoute } = await import("@/app/api/soc-runner/requests/[id]/documents/[documentId]/route");
const { POST: submitRoute } = await import("@/app/api/soc-runner/requests/[id]/submit/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-waiting-"));
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

const user = (username: string, role = "USER") => prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role, appAccess: ["soc"] } });

async function linkRunner(owner: Actor) {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), lastSeenAt: new Date(), runnerVersion: "99.0.0", claudeLogin: "logged_in" } });
  return token;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const at = (requestId: string) => `http://localhost/api/soc-runner/requests/${requestId}`;
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function claim(token: string) {
  const response = await claimRoute(new Request("http://localhost/api/soc-runner/claim", { method: "POST", headers: auth(token) }));
  return ((await response.json()) as { request: { id: string; job: { id: string }; majorItem: { key: string }; documents: { id: string; type: string }[] } | null }).request;
}

function submit(token: string, requestId: string, results: unknown) {
  const form = new FormData();
  form.set("results", new File([JSON.stringify(results)], "results.json", { type: "application/json" }));
  form.set("socCheck", new File([SOC_CHECK], "SOC_Check-ข้อ1.docx"));
  form.set("model", "claude-cli:sonnet");
  return submitRoute(new Request(`${at(requestId)}/submit`, { method: "POST", headers: auth(token), body: form }), params({ id: requestId }));
}

const itemState = async (id: string) => (await prisma.socMajorItem.findUniqueOrThrow({ where: { id } })).state;
const requestOf = (itemId: string) => prisma.socCheckRequest.findFirstOrThrow({ where: { majorItemId: itemId }, orderBy: { createdAt: "desc" } });

async function setup() {
  const asker = await user("asker");
  const helper = await user("helper");
  const jobId = await createImportedSocJob(asker, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "Datasheet_Demo.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  signedIn = await user("admin-skill", "ADMIN");
  const uploaded = await uploadSocSkillPackage({ name: "tor-word-compliance-check.skill", bytes: SKILL, version: "v1" });
  assert.ok(uploaded.ok, JSON.stringify(uploaded));
  return { asker, helper, jobId, items, item1: items.find((m) => m.key === "1")! };
}

test("a user without a Runner sends the request to รอคนรับ: nobody holds it, not even a teammate's Runner", { skip }, async () => {
  const { asker, helper, jobId, item1 } = await setup();
  const helperToken = await linkRunner(helper);
  signedIn = asker;
  assert.deepEqual(await requestSocCheck(jobId, item1.id), { ok: true, requested: 1 });
  const request = await requestOf(item1.id);
  assert.deepEqual([request.waiting, request.takerId, request.state], [true, null, "requested"]);
  assert.equal(await itemState(item1.id), "requested");

  assert.equal(await claim(helperToken), null, "a waiting request is claimed by no Runner until taken");
  const view = (await majorItemRequestViews(jobId)).get(item1.id)!.request!;
  assert.deepEqual([view.waiting, view.takerName], [true, null]);
  assert.equal(majorItemStateText({ state: "requested", request: view }, asker.id).label, "รอคนรับ");
  assert.equal(await waitingCheckRequestCount(), 1);
  const [listed] = await waitingCheckRequests();
  assert.deepEqual([listed.id, listed.step, listed.item, listed.askerName, listed.rowCount], [request.id, "ตรวจหลักฐาน", `ข้อ ${item1.label}`, asker.displayName, 0]);
});

test("a user with a Runner runs it on their own Runner; 'ขอให้คนอื่นตรวจแทน' sends it to รอคนรับ instead", { skip }, async () => {
  const { asker, jobId, items, item1 } = await setup();
  const token = await linkRunner(asker);
  signedIn = asker;
  await requestSocCheck(jobId, item1.id);
  assert.equal((await requestOf(item1.id)).waiting, false);
  assert.equal((await claim(token))?.majorItem.key, "1", "unchanged: the asker's own Runner takes it");

  const item2 = items.find((m) => m.key !== "1" && !m.skipped)!;
  await requestSocCheck(jobId, item2.id, [], true);
  assert.equal((await requestOf(item2.id)).waiting, true);
  assert.equal((await claim(token))?.majorItem.key, "1", "still the first, which this Runner already runs");
  await prisma.socCheckRequest.updateMany({ where: { majorItemId: item1.id }, data: { state: "done", finishedAt: new Date() } });
  assert.equal(await claim(token), null, "its own waiting request is not claimable without taking it");
});

test("taking needs the confirm and an online Runner of the taker; then only the taker's Runner claims it", { skip }, async () => {
  const { asker, helper, jobId, item1 } = await setup();
  const other = await user("other");
  const askerToken = await linkRunner(asker);
  const helperToken = await linkRunner(helper);
  const otherToken = await linkRunner(other);
  signedIn = asker;
  await requestSocCheck(jobId, item1.id, [], true);
  const request = await requestOf(item1.id);

  signedIn = helper;
  const refused = await takeSocCheckRequests({ requestId: request.id }, false);
  assert.ok(!refused.ok && /ยืนยัน/.test(refused.error));
  assert.equal((await requestOf(item1.id)).takerId, null, "no confirm, no take");

  const noRunner = await user("no-runner");
  signedIn = noRunner;
  const refusedNoRunner = await takeSocCheckRequests({ requestId: request.id }, true);
  assert.ok(!refusedNoRunner.ok && /เชื่อม SOC Runner/.test(refusedNoRunner.error));

  await prisma.socRunnerLink.updateMany({ where: { userId: other.id }, data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) } });
  signedIn = other;
  const offline = await takeSocCheckRequests({ requestId: request.id }, true);
  assert.ok(!offline.ok && /ยังไม่ออนไลน์/.test(offline.error));

  signedIn = helper;
  assert.deepEqual(await takeSocCheckRequests({ requestId: request.id }, true), { ok: true, taken: 1 });
  const taken = await requestOf(item1.id);
  assert.deepEqual([taken.takerId, taken.waiting, taken.state], [helper.id, true, "requested"]);
  assert.equal(await waitingCheckRequestCount(), 0, "off the open list once taken");
  const again = await takeSocCheckRequests({ requestId: request.id }, true);
  assert.ok(!again.ok, "a request is taken once");

  const view = (await majorItemRequestViews(jobId)).get(item1.id)!.request!;
  assert.equal(majorItemStateText({ state: "requested", request: view }, asker.id).label, `${helper.displayName} รับแล้ว`);

  assert.equal(await claim(askerToken), null, "the asker's own Runner may not claim a request sent away");
  assert.equal(await claim(otherToken), null, "nor may a third Runner");
  const claimed = (await claim(helperToken))!;
  assert.equal(claimed.job.id, jobId);
  assert.equal(await itemState(item1.id), "running");

  // Only the taker's Runner downloads its files.
  const download = (token: string) => documentRoute(new Request(`${at(claimed.id)}/documents/${claimed.documents[0].id}`, { headers: auth(token) }), params({ id: claimed.id, documentId: claimed.documents[0].id }));
  assert.equal((await download(helperToken)).status, 200);
  assert.equal((await download(askerToken)).status, 404);
});

test("the import records who asked and who ran it", { skip }, async () => {
  const { asker, helper, jobId, item1 } = await setup();
  const helperToken = await linkRunner(helper);
  signedIn = asker;
  await requestSocCheck(jobId, item1.id);
  signedIn = helper;
  await takeSocCheckRequests({ requestId: (await requestOf(item1.id)).id }, true);
  const claimed = (await claim(helperToken))!;
  const response = await submit(helperToken, claimed.id, runFor("1"));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const item = await prisma.socMajorItem.findUniqueOrThrow({ where: { id: item1.id } });
  assert.deepEqual([item.state, item.requestedById, item.ranById], ["checked", asker.id, helper.id]);
});

test("รับทั้งชุด takes every waiting request of the job at once", { skip }, async () => {
  const { asker, helper, jobId } = await setup();
  const helperToken = await linkRunner(helper);
  signedIn = asker;
  const all = await requestAllSocChecks(jobId);
  assert.ok(all.ok && all.requested > 1);
  assert.equal(await prisma.socCheckRequest.count({ where: { jobId, waiting: true } }), all.requested);

  signedIn = helper;
  assert.deepEqual(await takeSocCheckRequests({ jobId }, true), { ok: true, taken: all.requested });
  assert.equal(await prisma.socCheckRequest.count({ where: { jobId, takerId: helper.id } }), all.requested);
  assert.ok(await claim(helperToken));
});

test("a taker whose Runner goes quiet puts the request back in รอคนรับ; it has no expiry", { skip }, async () => {
  const { asker, helper, jobId, item1 } = await setup();
  const helperToken = await linkRunner(helper);
  signedIn = asker;
  await requestSocCheck(jobId, item1.id);
  signedIn = helper;
  await takeSocCheckRequests({ requestId: (await requestOf(item1.id)).id }, true);
  await claim(helperToken);
  assert.equal(await itemState(item1.id), "running");

  const quiet = new Date(Date.now() - SOC_CHECK_REQUEST_STALE_MS - 1000);
  await prisma.socCheckRequest.updateMany({ where: { majorItemId: item1.id }, data: { lastSeenAt: quiet, createdAt: new Date(Date.now() - 30 * 86400000) } });
  assert.equal(await releaseStaleCheckRequests(), 1);
  const back = await requestOf(item1.id);
  assert.deepEqual([back.state, back.takerId, back.waiting, back.claimedByLinkId], ["requested", null, true, null]);
  assert.equal(await itemState(item1.id), "requested");
  assert.equal(await waitingCheckRequestCount(), 1, "a month on, it still waits");

  // Taken but never claimed by the taker's Runner: it returns too.
  signedIn = helper;
  await takeSocCheckRequests({ requestId: back.id }, true);
  await prisma.socCheckRequest.update({ where: { id: back.id }, data: { takenAt: quiet } });
  await releaseStaleCheckRequests();
  assert.equal((await requestOf(item1.id)).takerId, null);
});

test("the asker (or an ADMIN) cancels before the run; another user may not; a stopped taker's heartbeat gets the id", { skip }, async () => {
  const { asker, helper, jobId, item1 } = await setup();
  const helperToken = await linkRunner(helper);
  signedIn = asker;
  await requestSocCheck(jobId, item1.id);
  const request = await requestOf(item1.id);
  signedIn = helper;
  await takeSocCheckRequests({ requestId: request.id }, true);

  const bystander = await user("bystander");
  signedIn = bystander;
  await assert.rejects(() => cancelSocCheckRequest(jobId, request.id), /FORBIDDEN/);

  signedIn = asker;
  assert.deepEqual(await cancelSocCheckRequest(jobId, request.id), { ok: true });
  assert.equal(await itemState(item1.id), "not_checked");
  assert.equal(await claim(helperToken), null, "a cancelled request is not run");
  const beat = await heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", { method: "POST", headers: { ...auth(helperToken), "content-type": "application/json" }, body: JSON.stringify({ runnerVersion: "0.1.0", claudeLogin: "logged_in" }) }));
  assert.deepEqual(((await beat.json()) as { cancelled: string[] }).cancelled, [request.id], "the taker's Runner is told to forget it");
});

test("the Proposal page lists what it sent to รอคนรับ, with the taker once taken, and the asker cancels from there", { skip }, async () => {
  const { asker, helper, jobId, item1 } = await setup();
  const helperToken = await linkRunner(helper);
  const proposal = await prisma.proposal.create({ data: { title: "งานรอคนรับ", creatorId: asker.id } });
  await prisma.socJob.update({ where: { id: jobId }, data: { proposalId: proposal.id } });
  const { getProposalPage } = await import("@/lib/proposal");
  signedIn = asker;
  await requestSocCheck(jobId, item1.id);
  let page = await getProposalPage(proposal.id);
  assert.deepEqual(page.waiting.map((w) => [w.step, w.item, w.takerName, w.askerName]), [["ตรวจหลักฐาน", `ข้อ ${item1.label}`, null, asker.displayName]]);
  assert.equal((await waitingCheckRequests())[0].proposalTitle, "งานรอคนรับ");

  signedIn = helper;
  await takeSocCheckRequests({ requestId: page.waiting[0].id }, true);
  assert.ok(await claim(helperToken));
  signedIn = asker;
  page = await getProposalPage(proposal.id);
  assert.deepEqual(page.waiting.map((w) => [w.takerName, w.state]), [[helper.displayName, "running"]]);
  assert.deepEqual(await cancelSocCheckRequest(jobId, page.waiting[0].id), { ok: true });
  assert.deepEqual((await getProposalPage(proposal.id)).waiting, []);
});
