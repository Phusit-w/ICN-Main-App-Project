// Imported SOC Check (ADR 0008, ticket 04): creating one from an upload, its
// major items and progress, and who may open it and add evidence. Driven
// through the HTTP route handlers, with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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

const { POST: createJob } = await import("@/app/api/soc/jobs/route");
const { POST: addEvidence } = await import("@/app/api/soc/jobs/[id]/evidence/route");
const { DELETE: deleteDocument } = await import("@/app/api/soc/documents/[id]/route");
const { authorizeSocJob, listSocJobs } = await import("@/lib/soc");
const { trashSocJob } = await import("@/actions/soc");
const { purgeSocJob } = await import("@/actions/admin");
const { purgeExpiredSocJobs } = await import("@/lib/soc-trash");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const SOC = buildSocDocx([
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"],
  ["๑.", "ระบบเฝ้าระวัง", "", ""],
  ["๑.๑", "กล้อง", "CASRI", "หน้า 3"],
  ["๒.", "ระบบแจ้งเตือน", "", ""],
  ["๒.๑", "เรดาร์", "X", "หน้า 5"],
  ["๓.๑", "ซอฟต์แวร์", "Y", "หน้า 9"],
]);
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");

function user(username: string, appAccess: string[] = ["soc"], role = "USER") {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess } });
}

function upload(fields: { title?: string; soc?: Uint8Array<ArrayBuffer>; evidence?: { name: string; bytes: Uint8Array<ArrayBuffer> }[] }) {
  const form = new FormData();
  if (fields.title !== undefined) form.set("title", fields.title);
  if (fields.soc) form.set("soc", new File([fields.soc], "SOC ภาคผนวก ก.docx"));
  for (const file of fields.evidence ?? []) form.append("evidence", new File([file.bytes], file.name));
  return new Request("http://localhost/api/soc/jobs", { method: "POST", body: form });
}

async function createImported(owner: Actor) {
  signedIn = owner;
  const response = await createJob(upload({ title: "Udon CASRI", soc: SOC, evidence: [{ name: "CASRI.pdf", bytes: PDF }] }));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return ((await response.json()) as { id: string }).id;
}

function postEvidence(jobId: string, files: { name: string; bytes: Uint8Array<ArrayBuffer>; path?: string }[]) {
  const form = new FormData();
  for (const file of files) {
    form.append("evidence", new File([file.bytes], file.name));
    form.append("evidencePath", file.path ?? "");
  }
  return addEvidence(new Request(`http://localhost/api/soc/jobs/${jobId}/evidence`, { method: "POST", body: form }), { params: Promise.resolve({ id: jobId }) });
}

test("creating an Imported SOC Check stores the files and one not_checked major item per ข้อใหญ่, in order", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);

  const job = await prisma.socJob.findUniqueOrThrow({ where: { id: jobId }, include: { documents: true, majorItems: { orderBy: { position: "asc" } } } });
  assert.equal(job.kind, "IMPORTED");
  assert.equal(job.status, "NEEDS_REVIEW");
  assert.equal(job.ownerId, owner.id);
  const daysToExpiry = (job.expiresAt.getTime() - Date.now()) / 86400000;
  assert.ok(daysToExpiry > 89 && daysToExpiry <= 90);
  assert.deepEqual(job.documents.map((d) => d.type).sort(), ["EVIDENCE", "SOC"]);
  for (const doc of job.documents) assert.ok(existsSync(path.join(storageRoot, ...doc.storageKey.split("/"))));
  assert.deepEqual(
    job.majorItems.map((m) => [m.position, m.key, m.label, m.title, m.state]),
    [[1, "1", "๑", "ระบบเฝ้าระวัง", "not_checked"], [2, "2", "๒", "ระบบแจ้งเตือน", "not_checked"], [3, "3", "๓", null, "not_checked"]],
  );

  const socEvents = await prisma.socAuditEvent.findMany({ where: { jobId } });
  assert.deepEqual(socEvents.map((e) => [e.action, e.actorId]), [["JOB_CREATED", owner.id]]);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: jobId } });
  assert.equal(log.action, "SOC_CREATED");
  assert.deepEqual(log.metadata, { kind: "IMPORTED", evidenceCount: 1, majorItemCount: 3 });
});

// ข้อ ๒ has 1 + 31 + 31 = 63 rows: over 60, so it is split.
const bullets = (title: string, count: number) => Array.from({ length: count }, (_, i) => [`${i + 1})`, `${title} ${i + 1}`, "", ""]);
const LARGE_SOC = buildSocDocx([
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"],
  ["๑.", "ระบบเฝ้าระวัง", "", ""],
  ["๑.๑", "กล้อง", "CASRI", "หน้า 3"],
  ["๒.", "ระบบ RFID", "", ""],
  ["๒.๑", "เครื่องอ่าน", "", ""], ...bullets("เครื่องอ่าน", 30),
  ["๒.๒", "เครื่องพิมพ์", "", ""], ...bullets("เครื่องพิมพ์", 30),
  ["๓.", "การฝึกอบรม", "", ""], ...bullets("อบรม", 70), // over 60 with no sub-section: kept whole
]);

test("a major item over 60 rows becomes one major item per sub-section, grouped under it; the items beside it start as ไม่ต้องตรวจ", { skip }, async () => {
  signedIn = await user("owner");
  const response = await createJob(upload({ title: "MOF RFID", soc: LARGE_SOC, evidence: [{ name: "a.pdf", bytes: PDF }] }));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const jobId = ((await response.json()) as { id: string }).id;
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  assert.deepEqual(
    items.map((m) => [m.position, m.key, m.label, m.title, m.rowCount, m.groupLabel, m.groupTitle, m.state, m.skipped]),
    [
      [1, "1", "๑", "ระบบเฝ้าระวัง", 2, null, null, "not_checked", true],
      [2, "2.1", "๒.๑", "เครื่องอ่าน", 32, "๒", "ระบบ RFID", "not_checked", false],
      [3, "2.2", "๒.๒", "เครื่องพิมพ์", 31, "๒", "ระบบ RFID", "not_checked", false],
      [4, "3", "๓", "การฝึกอบรม", 71, null, null, "not_checked", true],
    ],
  );
});

test("a SOC with no item numbers is rejected and nothing is kept", { skip }, async () => {
  signedIn = await user("owner");
  const storedBefore = await readdir(storageRoot);
  const response = await createJob(upload({ title: "x", soc: buildSocDocx([["ลำดับ", "ข้อกำหนด"], ["", "ข้อความ"]]), evidence: [{ name: "a.pdf", bytes: PDF }] }));
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /ข้อใหญ่/);
  assert.equal(await prisma.socJob.count(), 0);
  assert.deepEqual(await readdir(storageRoot), storedBefore);
});

test("a user without soc access can't create a job", { skip }, async () => {
  signedIn = await user("expense-only", ["expense"]);
  const response = await createJob(upload({ title: "x", soc: SOC, evidence: [{ name: "a.pdf", bytes: PDF }] }));
  assert.equal(response.status, 403);
  assert.equal(await prisma.socJob.count(), 0);
});

test("any soc user sees an imported job on the list with progress 0/N; a legacy check job stays owner-only", { skip }, async () => {
  const owner = await user("owner");
  const colleague = await user("colleague");
  const jobId = await createImported(owner);
  const legacy = await prisma.socJob.create({ data: { title: "legacy", ownerId: owner.id, expiresAt: new Date(Date.now() + 86400000) } });

  const seen = await listSocJobs(colleague);
  assert.deepEqual(seen.map((j) => [j.id, j.majorItemProgress]), [[jobId, { checked: 0, total: 3, percent: 0 }]]);

  const ownerSees = await listSocJobs(owner);
  assert.deepEqual(ownerSees.map((j) => j.id).sort(), [jobId, legacy.id].sort());
  assert.equal(ownerSees.find((j) => j.id === legacy.id)?.majorItemProgress, null);

  signedIn = colleague;
  await assert.doesNotReject(authorizeSocJob(jobId));
  await assert.rejects(authorizeSocJob(legacy.id), /NOT_FOUND/);
});

test("another soc user can add an evidence PDF to an imported job, and it is audited", { skip }, async () => {
  const owner = await user("owner");
  const colleague = await user("colleague");
  const jobId = await createImported(owner);

  signedIn = colleague;
  const response = await postEvidence(jobId, [{ name: "Section 3.2 Datasheet.pdf", bytes: PDF }]);
  assert.equal(response.status, 201);

  const evidence = await prisma.socDocument.findMany({ where: { jobId, type: "EVIDENCE" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(evidence.map((d) => d.originalName), ["CASRI.pdf", "Section 3.2 Datasheet.pdf"]);
  assert.ok(existsSync(path.join(storageRoot, ...evidence[1].storageKey.split("/"))));

  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "EVIDENCE_ADDED" } });
  assert.equal(event.actorId, colleague.id);
  assert.deepEqual(event.detail, { documentIds: [evidence[1].id], names: ["Section 3.2 Datasheet.pdf"] });
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: jobId, action: "SOC_EVIDENCE_ADDED" } });
  assert.equal(log.actorId, colleague.id);
});

test("evidence picked as a folder keeps its sub-folders in the name, and can't climb out of the job", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);
  const response = await postEvidence(jobId, [
    { name: "tc22.pdf", bytes: PDF, path: "บทที่ 2/2.5 เครื่องอ่าน_ok (P)/1.เครื่องอ่าน/tc22.pdf" },
    { name: "rfd40.pdf", bytes: PDF, path: "../../2.อุปกรณ์เสริม/rfd40.pdf" },
    { name: "plain.pdf", bytes: PDF },
  ]);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const evidence = await prisma.socDocument.findMany({ where: { jobId, type: "EVIDENCE" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(evidence.map((d) => d.originalName).sort(), [
    "2.อุปกรณ์เสริม/rfd40.pdf", "CASRI.pdf", "plain.pdf", "บทที่ 2/2.5 เครื่องอ่าน_ok (P)/1.เครื่องอ่าน/tc22.pdf",
  ].sort());
});

test("a user without soc access can neither open an imported job nor add evidence", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);

  signedIn = await user("expense-only", ["expense"]);
  await assert.rejects(authorizeSocJob(jobId), /FORBIDDEN/);
  const response = await postEvidence(jobId, [{ name: "x.pdf", bytes: PDF }]);
  assert.equal(response.status, 403);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "EVIDENCE" } }), 1);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "EVIDENCE_ADDED" } }), 0);
});

test("adding evidence to someone else's legacy check job is refused", { skip }, async () => {
  const owner = await user("owner");
  const legacy = await prisma.socJob.create({ data: { title: "legacy", ownerId: owner.id, expiresAt: new Date(Date.now() + 86400000) } });
  signedIn = await user("colleague");
  const response = await postEvidence(legacy.id, [{ name: "x.pdf", bytes: PDF }]);
  assert.equal(response.status, 404);
  assert.equal(await prisma.socDocument.count(), 0);
});

test("evidence can't be added to a legacy check job, even by its owner", { skip }, async () => {
  const owner = await user("owner");
  const legacy = await prisma.socJob.create({ data: { title: "legacy", ownerId: owner.id, status: "PROCESSING", expiresAt: new Date(Date.now() + 86400000) } });
  signedIn = owner;
  const response = await postEvidence(legacy.id, [{ name: "x.pdf", bytes: PDF }]);
  assert.equal(response.status, 400);
  assert.equal(await prisma.socDocument.count(), 0);
});

test("evidence that isn't a PDF is rejected and nothing is added", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);
  const response = await postEvidence(jobId, [{ name: "notes.pdf", bytes: new TextEncoder().encode("hello") }]);
  assert.equal(response.status, 400);
  assert.equal(await prisma.socDocument.count({ where: { jobId, type: "EVIDENCE" } }), 1);
});

function removeDocument(documentId: string) {
  return deleteDocument(new Request(`http://localhost/api/soc/documents/${documentId}`, { method: "DELETE" }), { params: Promise.resolve({ id: documentId }) });
}

test("another soc user can remove an evidence PDF after upload: its row and file go, and it is audited", { skip }, async () => {
  const owner = await user("owner");
  const colleague = await user("colleague");
  const jobId = await createImported(owner);
  const evidence = await prisma.socDocument.findFirstOrThrow({ where: { jobId, type: "EVIDENCE" } });
  const file = path.join(storageRoot, ...evidence.storageKey.split("/"));

  signedIn = colleague;
  const response = await removeDocument(evidence.id);
  assert.equal(response.status, 204);
  assert.equal(await prisma.socDocument.count({ where: { id: evidence.id } }), 0);
  assert.equal(existsSync(file), false);
  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "EVIDENCE_REMOVED" } });
  assert.equal(event.actorId, colleague.id);
  assert.deepEqual(event.detail, { documentId: evidence.id, name: "CASRI.pdf" });
  assert.equal(await prisma.auditLog.count({ where: { entityId: jobId, action: "SOC_EVIDENCE_REMOVED", actorId: colleague.id } }), 1);
});

test("the SOC itself can't be removed, nor evidence by a user without soc access", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);
  const soc = await prisma.socDocument.findFirstOrThrow({ where: { jobId, type: "SOC" } });
  const evidence = await prisma.socDocument.findFirstOrThrow({ where: { jobId, type: "EVIDENCE" } });

  assert.equal((await removeDocument(soc.id)).status, 400);
  signedIn = await user("expense-only", ["expense"]);
  assert.equal((await removeDocument(evidence.id)).status, 403);
  assert.equal(await prisma.socDocument.count({ where: { jobId } }), 2);
});

test("evidence can't be removed while a SOC Runner is checking the job", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);
  const evidence = await prisma.socDocument.findFirstOrThrow({ where: { jobId, type: "EVIDENCE" } });
  const item = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId } });
  await prisma.socCheckRequest.create({ data: { jobId, majorItemId: item.id, requestedById: owner.id, state: "running", priorState: "not_checked" } });

  const response = await removeDocument(evidence.id);
  assert.equal(response.status, 400);
  assert.match(((await response.json()) as { error: string }).error, /กำลังตรวจ/);
  assert.equal(await prisma.socDocument.count({ where: { id: evidence.id } }), 1);
});

test("an admin without explicit soc access can still open any job", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);
  const legacy = await prisma.socJob.create({ data: { title: "legacy", ownerId: owner.id, expiresAt: new Date(Date.now() + 86400000) } });
  signedIn = await user("admin", [], "ADMIN");
  await assert.doesNotReject(authorizeSocJob(jobId));
  await assert.doesNotReject(authorizeSocJob(legacy.id));
});

test("only the owner or an admin may move an imported job to the trash", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);

  signedIn = await user("colleague");
  await assert.rejects(trashSocJob(jobId), /FORBIDDEN/);
  assert.equal((await prisma.socJob.findUniqueOrThrow({ where: { id: jobId } })).deletedAt, null);

  signedIn = owner;
  await trashSocJob(jobId);
  assert.ok((await prisma.socJob.findUniqueOrThrow({ where: { id: jobId } })).deletedAt);
});

test("an admin can trash any job and delete a trashed job for good, with its files", { skip }, async () => {
  const owner = await user("owner");
  const jobId = await createImported(owner);
  const admin = await user("admin", [], "ADMIN");
  signedIn = admin;
  await assert.rejects(purgeSocJob(jobId), /ถังขยะ/, "only from the trash");
  await trashSocJob(jobId);

  signedIn = owner;
  await assert.rejects(purgeSocJob(jobId), /FORBIDDEN/, "admin only");
  assert.ok(existsSync(path.join(storageRoot, jobId)));

  signedIn = admin;
  await purgeSocJob(jobId);
  assert.equal(await prisma.socJob.count({ where: { id: jobId } }), 0);
  assert.equal(await prisma.socDocument.count({ where: { jobId } }), 0);
  assert.equal(await prisma.socMajorItem.count({ where: { jobId } }), 0);
  assert.equal(existsSync(path.join(storageRoot, jobId)), false);
  assert.equal(await prisma.auditLog.count({ where: { entityId: jobId, action: "SOC_PURGED", actorId: admin.id } }), 1);
});

test("the server deletes a trashed job for good once its 30 days are over, and only then", { skip }, async () => {
  const owner = await user("owner");
  signedIn = owner;
  const due = await createImported(owner);
  const notYet = await createImported(owner);
  const kept = await createImported(owner);
  await trashSocJob(due);
  await trashSocJob(notYet);
  const trashed = await prisma.socJob.findUniqueOrThrow({ where: { id: due } });
  assert.ok(trashed.purgeAfter && trashed.purgeAfter.getTime() - trashed.deletedAt!.getTime() === 30 * 86400000, "30 days after trashing");
  await prisma.socJob.update({ where: { id: due }, data: { purgeAfter: new Date(Date.now() - 1000) } });

  assert.equal(await purgeExpiredSocJobs(new Date()), 1);
  assert.equal(await prisma.socJob.count({ where: { id: due } }), 0);
  assert.equal(existsSync(path.join(storageRoot, due)), false);
  assert.equal(await prisma.socJob.count({ where: { id: { in: [notYet, kept] } } }), 2, "not yet due, and not in the trash");
  assert.ok(existsSync(path.join(storageRoot, notYet)));
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: due, action: "SOC_PURGED" } });
  assert.equal(audit.actorId, null);
  assert.match(audit.summary, /อัตโนมัติ/);
  assert.equal(await purgeExpiredSocJobs(new Date()), 0, "nothing left to do");
});
