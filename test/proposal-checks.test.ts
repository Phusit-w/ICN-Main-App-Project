// Checks of a Proposal's SOC Versions (proposal-build ticket 06): the first
// ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน on the current SOC Version makes that
// version's SOC job from the Proposal's SOC, TOR and live Datasheets (no copies
// of the last two), the step statuses follow the current version's job, a newer
// version or a replaced TOR leaves the old result as ต้องทำใหม่, and a Datasheet
// can't be removed under a running Runner. Driven through the actions, the
// upload routes and the SOC Runner routes, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildSocDocx, buildZip } from "@/test/docx-fixture";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";
import { newSocRunnerToken } from "@/lib/soc-runner-token";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: socRoute } = await import("@/app/api/proposals/[id]/soc-versions/route");
const { POST: torRoute } = await import("@/app/api/proposals/[id]/tor/route");
const { POST: datasheetRoute } = await import("@/app/api/proposals/[id]/datasheets/route");
const { GET: openDocumentRoute } = await import("@/app/api/soc/documents/[id]/route");
const { createProposalAction, removeProposalDatasheetAction, startProposalCheckAction } = await import("@/actions/proposal");
const { requestSocCheck } = await import("@/actions/socCheckRequests");
const { purgeProposal } = await import("@/actions/admin");
const { trashProposalAction } = await import("@/actions/proposal");
const { getProposalPage, listProposals, proposalStorageDir } = await import("@/lib/proposal");
const { jobEvidenceFiles } = await import("@/lib/soc-evidence");
const { uploadSocSkillPackage } = await import("@/lib/soc-skill-package");
const { POST: claimRoute } = await import("@/app/api/soc-runner/claim/route");
const { GET: documentRoute } = await import("@/app/api/soc-runner/requests/[id]/documents/[documentId]/route");
const { resolveStorageKey } = await import("@/lib/soc");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "proposal-checks-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const SOC_ROWS = [
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"],
  ["1", "ระบบกล้องวงจรปิด", "", ""],
  ["1.1", "กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", "8 ล้านพิกเซล", "Brochure หน้า 3"],
  ["2", "ระบบเครือข่าย", "", ""],
  ["2.1", "สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต", "48 พอร์ต", "Brochure หน้า 5"],
];
const SOC = () => buildSocDocx(SOC_ROWS);
const torPage = (days: number): TablePage => ({
  columns: [], rows: [],
  lines: ["1. ระบบกล้องวงจรปิด", "1.1 กล้องต้องมีความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", `1.2 กล้องต้องบันทึกภาพได้ไม่น้อยกว่า ${days} วัน`, "2. ระบบเครือข่าย", "2.1 สวิตช์ต้องมีพอร์ตไม่น้อยกว่า 24 พอร์ต"].map((text) => ({ text })),
});
const TOR = (days = 7) => buildTablePdf([torPage(days)]);
const DATASHEET = (label = "Datasheet") => buildTablePdf([{ columns: [], rows: [], lines: [{ text: label }] }]);
const SKILL = buildZip({ "tor-word-compliance-check/SKILL.md": "---\nname: tor-word-compliance-check\n---\n\n# skill\n" }, { deflate: true });

async function proposal(title = "งานตรวจ") {
  const owner = await prisma.user.create({ data: { username: `u-${title}`, displayName: "ผู้ใช้", passwordHash: "x", role: "USER", appAccess: ["soc"] } });
  signedIn = owner;
  const created = await createProposalAction(title);
  assert.ok(created.ok);
  return { owner, id: created.id, title };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function addSoc(id: string, bytes: Uint8Array = SOC()) {
  const form = new FormData();
  form.set("soc", new File([bytes as BlobPart], "SOC.docx"));
  const response = await socRoute(new Request("http://localhost/x", { method: "POST", body: form }), params(id));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
}

async function addTor(id: string, bytes: Uint8Array = TOR()) {
  const form = new FormData();
  form.set("tor", new File([bytes as BlobPart], "TOR.pdf"));
  const response = await torRoute(new Request("http://localhost/x", { method: "POST", body: form }), params(id));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
}

async function addDatasheets(id: string, names: string[]) {
  const form = new FormData();
  for (const name of names) {
    form.append("evidence", new File([DATASHEET(name) as BlobPart], name));
    form.append("evidencePath", name);
  }
  const response = await datasheetRoute(new Request("http://localhost/x", { method: "POST", body: form }), params(id));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
}

async function start(id: string, kind: "tor" | "evidence") {
  const result = await startProposalCheckAction(id, kind);
  assert.ok(result.ok, JSON.stringify(result));
  return result.jobId;
}

const stepsOf = async (id: string) => (await getProposalPage(id)).steps;
const jobFolder = (jobId: string) => path.join(storageRoot, jobId);

test("ตรวจหลักฐาน with only a SOC and Datasheets makes the version's job, titled '<Proposal> · ฉบับ N', and copies no Datasheet", { skip }, async () => {
  const { id, title } = await proposal();
  await addSoc(id);
  await addDatasheets(id, ["a.pdf", "b.pdf"]);

  const jobId = await start(id, "evidence");
  const job = await prisma.socJob.findUniqueOrThrow({ where: { id: jobId }, include: { documents: true, majorItems: true, socVersion: true } });
  assert.equal(job.title, `${title} · ฉบับ 1`);
  assert.equal(job.kind, "IMPORTED");
  assert.equal(job.proposalId, id);
  assert.equal(job.socVersion?.number, 1);
  assert.deepEqual(job.documents.map((d) => d.type), ["SOC"]);
  assert.deepEqual(job.majorItems.map((m) => m.key).sort(), ["1", "2"]);
  assert.equal((await readdir(jobFolder(jobId))).length, 1, "only the SOC is in the job's folder");

  // Starting again finds the same job; the Datasheets are the Proposal's live ones.
  assert.equal(await start(id, "evidence"), jobId);
  assert.equal(await prisma.socJob.count({ where: { proposalId: id } }), 1);
  assert.deepEqual((await jobEvidenceFiles(jobId)).map((f) => f.originalName), ["a.pdf", "b.pdf"]);
  await addDatasheets(id, ["c.pdf"]);
  assert.deepEqual((await jobEvidenceFiles(jobId)).map((f) => f.originalName), ["a.pdf", "b.pdf", "c.pdf"]);

  const steps = await stepsOf(id);
  assert.deepEqual([steps[5].status, steps[5].jobId], ["todo", jobId]);
});

test("starting a check needs a current SOC, and ตรวจ TOR needs the Proposal's TOR", { skip }, async () => {
  const { id } = await proposal("ว่าง");
  const noSoc = await startProposalCheckAction(id, "evidence");
  assert.ok(!noSoc.ok && /ยังไม่มี SOC/.test(noSoc.error));
  await addSoc(id);
  const noTor = await startProposalCheckAction(id, "tor");
  assert.ok(!noTor.ok && /ยังไม่มี TOR/.test(noTor.error));
  assert.equal(await prisma.socJob.count({ where: { proposalId: id } }), 0, "a refused start makes no job");
});

test("ตรวจ TOR ตรงต้นฉบับ attaches the Proposal's TOR file as it is and compares it; the step turns เสร็จ", { skip }, async () => {
  const { id } = await proposal("ตรวจ TOR");
  await addSoc(id);
  await addTor(id);
  assert.equal((await stepsOf(id))[4].status, "todo");

  const jobId = await start(id, "tor");
  const tor = await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } });
  const attached = await prisma.socDocument.findFirstOrThrow({ where: { jobId, type: "TOR_ORIGINAL" } });
  assert.equal(attached.storageKey, tor.storageKey, "the job points at the Proposal's TOR file");
  assert.equal(existsSync(path.join(jobFolder(jobId), path.basename(attached.storageKey))), false, "no copy in the job's folder");
  assert.equal((await prisma.socTorMatch.findUniqueOrThrow({ where: { jobId } })).state, "ready");
  const step = (await stepsOf(id))[4];
  assert.deepEqual([step.status, step.jobId], ["done", jobId]);

  // The same TOR started again is left alone.
  assert.equal(await start(id, "tor"), jobId);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "TOR_ORIGINAL" } }), 1);
});

test("a replaced TOR leaves the old TOR Match as ต้องทำใหม่ with its link, and its TOR file stays openable", { skip }, async () => {
  const { id } = await proposal("TOR ใหม่");
  await addSoc(id);
  await addTor(id, TOR(7));
  const jobId = await start(id, "tor");
  const old = await prisma.proposalTor.findUniqueOrThrow({ where: { proposalId: id } });

  await addTor(id, TOR(30));
  const step = (await stepsOf(id))[4];
  assert.deepEqual([step.status, step.staleJobId, step.jobId], ["stale", jobId, jobId]);
  assert.ok(existsSync(resolveStorageKey(old.storageKey)), "the old TOR is still cited by the TOR Match, so its file stays");

  // Starting again attaches the new TOR to the same job and the step is เสร็จ.
  assert.equal(await start(id, "tor"), jobId);
  assert.equal((await stepsOf(id))[4].status, "done");
  assert.equal(existsSync(resolveStorageKey(old.storageKey)), false, "nothing cites the old TOR any more");
});

test("a newer SOC Version starts both checks as ยังไม่ทำ and the older version's result is ต้องทำใหม่ with a link", { skip }, async () => {
  const { id, title } = await proposal("ฉบับใหม่");
  await addSoc(id);
  await addTor(id);
  const first = await start(id, "evidence");
  await start(id, "tor");
  await prisma.socMajorItem.updateMany({ where: { jobId: first }, data: { state: "checked" } });
  const done = await stepsOf(id);
  assert.deepEqual([done[4].status, done[5].status], ["done", "done"]);

  await addSoc(id);
  const fresh = await stepsOf(id);
  assert.deepEqual([fresh[4].status, fresh[5].status], ["stale", "stale"]);
  assert.deepEqual([fresh[4].staleJobId, fresh[5].staleJobId, fresh[5].jobId], [first, first, null]);

  const second = await start(id, "evidence");
  assert.notEqual(second, first);
  assert.equal((await prisma.socJob.findUniqueOrThrow({ where: { id: second } })).title, `${title} · ฉบับ 2`);
  const now = await stepsOf(id);
  assert.deepEqual([now[5].status, now[5].jobId, now[5].staleJobId], ["stale", second, first], "no work on version 2 yet");
  await prisma.socMajorItem.updateMany({ where: { jobId: second, key: "1" }, data: { state: "running" } });
  assert.equal((await stepsOf(id))[5].status, "doing");
  await prisma.socMajorItem.updateMany({ where: { jobId: second }, data: { state: "checked" } });
  assert.equal((await stepsOf(id))[5].status, "done");
  assert.equal((await listProposals())[0].progress.done, 2, "TOR and ตรวจหลักฐาน are done; ตรวจ TOR is stale; the rest not");
});

// ---- the SOC Runner ----

async function linkRunner(owner: Actor) {
  const token = newSocRunnerToken();
  await prisma.socRunnerLink.create({ data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), lastSeenAt: new Date(), runnerVersion: "99.0.0", claudeLogin: "logged_in" } });
  return token;
}

async function claim(token: string) {
  const response = await claimRoute(new Request("http://localhost/api/soc-runner/claim", { method: "POST", headers: { authorization: `Bearer ${token}` } }));
  return ((await response.json()) as { request: { id: string; documents: { id: string; type: string; name: string; url: string }[] } | null }).request;
}

async function withSkill() {
  const admin = await prisma.user.create({ data: { username: `admin-${Math.random()}`, displayName: "แอดมิน", passwordHash: "x", role: "ADMIN", appAccess: ["soc"] } });
  signedIn = admin;
  const uploaded = await uploadSocSkillPackage({ name: "tor-word-compliance-check.skill", bytes: SKILL, version: "v1" });
  assert.ok(uploaded.ok, JSON.stringify(uploaded));
}

test("the Runner's request lists the SOC and the Proposal's live Datasheets and downloads them; removal is refused while it runs", { skip }, async () => {
  const { owner, id } = await proposal("Runner");
  await addSoc(id);
  await addDatasheets(id, ["บทที่ 2/a.pdf"]);
  const jobId = await start(id, "evidence");
  const token = await linkRunner(owner);
  await withSkill();
  signedIn = owner;
  const item = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId, key: "1" } });
  assert.deepEqual(await requestSocCheck(jobId, item.id), { ok: true, requested: 1 });

  await addDatasheets(id, ["b.pdf"]); // added after the job was made
  const claimed = (await claim(token))!;
  assert.deepEqual(claimed.documents.map((d) => [d.type, d.name]).sort(), [["EVIDENCE", "b.pdf"], ["EVIDENCE", "บทที่ 2/a.pdf"], ["SOC", "SOC.docx"]].sort());
  const sheet = claimed.documents.find((d) => d.name === "บทที่ 2/a.pdf")!;
  const download = await documentRoute(new Request(`http://localhost${sheet.url}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id: claimed.id, documentId: sheet.id }) });
  assert.equal(download.status, 200);

  const datasheet = await prisma.proposalDatasheet.findFirstOrThrow({ where: { proposalId: id, originalName: "b.pdf" } });
  signedIn = owner;
  const refused = await removeProposalDatasheetAction(id, datasheet.id);
  assert.ok(!refused.ok && /SOC Runner กำลังตรวจ/.test(refused.error));
  assert.equal(await prisma.proposalDatasheet.count({ where: { proposalId: id } }), 2, "nothing was removed");
});

test("a Datasheet removed after a result exists stays openable from the review page but the Runner no longer gets it", { skip }, async () => {
  const { owner, id } = await proposal("ลบหลักฐาน");
  await addSoc(id);
  await addDatasheets(id, ["cited.pdf", "other.pdf"]);
  const jobId = await start(id, "evidence");
  await prisma.socCheckResult.create({
    data: {
      jobId, rowNumber: 2, item: "1.1", rowType: "spec", socText: "x", referenceText: "cited.pdf หน้า 1", referencePages: [1],
      aiReferenceCheck: "pass", aiHeadingTitleCheck: "pass", aiProductIdentity: "pass", aiContentRelevance: "pass", aiDetail: "-", aiConfidence: "high",
      finalReferenceCheck: "pass", finalHeadingTitleCheck: "pass", finalProductIdentity: "pass", finalContentRelevance: "pass", finalDetail: "-",
    },
  });
  const cited = await prisma.proposalDatasheet.findFirstOrThrow({ where: { proposalId: id, originalName: "cited.pdf" } });
  signedIn = owner;
  assert.deepEqual(await removeProposalDatasheetAction(id, cited.id), { ok: true });

  const row = await prisma.proposalDatasheet.findUniqueOrThrow({ where: { id: cited.id } });
  assert.ok(row.removedAt, "kept with removedAt");
  assert.ok(existsSync(resolveStorageKey(cited.storageKey)), "the file stays");
  assert.deepEqual((await getProposalPage(id)).datasheets.map((d) => d.originalName), ["other.pdf"], "off the Proposal's list at once");
  assert.deepEqual((await jobEvidenceFiles(jobId)).map((f) => f.originalName), ["other.pdf"], "not served to a Runner");
  assert.deepEqual((await jobEvidenceFiles(jobId, { removed: true })).map((f) => f.originalName), ["cited.pdf", "other.pdf"], "but the review page still lists it");
  const open = await openDocumentRoute(new Request("http://localhost/x"), params(cited.id));
  assert.equal(open.status, 200);
  assert.equal(open.headers.get("content-type"), "application/pdf");
});

test("purging the Proposal deletes its SOC jobs and their folders", { skip }, async () => {
  const { owner, id } = await proposal("ลบถาวร");
  await addSoc(id);
  await addTor(id);
  const jobId = await start(id, "tor");
  assert.ok(existsSync(jobFolder(jobId)));
  signedIn = owner;
  assert.deepEqual(await trashProposalAction(id), undefined);
  const admin = await prisma.user.create({ data: { username: "admin-purge", displayName: "แอดมิน", passwordHash: "x", role: "ADMIN", appAccess: ["soc"] } });
  signedIn = admin;
  await purgeProposal(id);
  assert.equal(await prisma.socJob.count({ where: { id: jobId } }), 0);
  assert.equal(existsSync(jobFolder(jobId)), false);
  assert.equal(existsSync(proposalStorageDir(id)), false);
});
