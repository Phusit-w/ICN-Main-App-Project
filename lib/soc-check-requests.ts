// Check Requests and the SOC Runner API (ADR 0008, ticket 13, seam 2). A user
// clicks ตรวจ on a major item (or ตรวจทั้งชุด); that creates a Check Request
// owned by them. Only their own SOC Runner may claim it, oldest first,
// download the job's files and the current Skill Package, report progress
// and submit results, which go through importLocalCheckRun (seam 1). The
// major item's state mirrors its open request. A running request whose
// runner goes quiet returns to `requested`. See docs/SOC-RUNNER.md.
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { writeAudit } from "@/lib/authorization";
import { resolveStorageKey } from "@/lib/soc";
import { importLocalCheckRun, type ConfirmedRow, type LocalCheckRunImport } from "@/lib/soc-import";
import { currentSocSkillPackage, readSocSkillPackage, socSkillDownloadName } from "@/lib/soc-skill-package";
import {
  SOC_CHECK_REQUEST_OPEN_STATES, SOC_CHECK_REQUEST_STALE_MS, isRequestableItemState, socRunnerState,
  type SocCheckRequestView,
} from "@/lib/soc-shared";

type Actor = { id: string; role: string; displayName: string };
type Job = { id: string; title: string; kind: string; deletedAt: Date | null };
// The runner's link, as authenticateSocRunner() returns it.
type RunnerLink = { id: string; userId: string; claudeLogin: string | null };

const MAX_NOTE = 200;
const MAX_REASON = 1000;
const MAX_MISSING = 50;
const MAX_MISSING_NAME = 300;
const MAX_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;

// ---- Requesting (web) -----------------------------------------------------------

export type CheckRequestResult =
  | { ok: true; requested: number }
  | { ok: false; error: string; confirmedRows?: ConfirmedRow[] };

// Asks for a check of one major item. Allowed when the item isn't checked,
// is checked (a re-check), failed or needs documents, and no request is
// open on it. A re-check over rows with a Final Decision returns them as
// `confirmedRows` until the call is repeated with them in `replaceConfirmed`;
// the runner's import later replaces exactly those.
//
// `continueWithoutMissing` is [ตรวจต่อโดยไม่มีไฟล์นี้] on an item whose check
// stopped for missing documents: the request then acknowledges the names the
// runner reported (read here, not from the browser) plus those the stopped
// request had acknowledged. The skill checks those rows as unverifiable, and
// the import keeps the names on the item for the banner.
export async function requestMajorItemCheck(
  actor: Actor, job: Job, majorItemId: string, replaceConfirmed: number[] = [], { continueWithoutMissing = false } = {},
): Promise<CheckRequestResult> {
  if (job.kind !== "IMPORTED") return { ok: false, error: "ขอตรวจได้เฉพาะงานตรวจแบบนำเข้าผล" };
  const item = await prisma.socMajorItem.findFirst({ where: { id: majorItemId, jobId: job.id } });
  if (!item) throw new Error("NOT_FOUND");
  if (!isRequestableItemState(item.state)) return { ok: false, error: `ข้อ ${item.label} มีคำขอตรวจที่ยังไม่เสร็จอยู่แล้ว` };
  let acknowledgedMissing: string[] = [];
  if (continueWithoutMissing) {
    const reported = item.state === "needs_documents" && Array.isArray(item.missingDocuments) ? item.missingDocuments.filter((n): n is string => typeof n === "string") : [];
    if (!reported.length) return { ok: false, error: `ข้อ ${item.label} ไม่ได้รอเอกสารอยู่ กรุณาโหลดหน้าใหม่` };
    const stopped = await prisma.socCheckRequest.findFirst({ where: { majorItemId: item.id, state: "needs_documents" }, orderBy: { finishedAt: "desc" } });
    acknowledgedMissing = [...new Set([...(stopped?.acknowledgedMissing ?? []), ...reported])];
  }
  const confirmed = await prisma.socCheckResult.findMany({
    where: { majorItemId: item.id, reviewedAt: { not: null } }, orderBy: { rowNumber: "asc" }, select: { rowNumber: true, item: true },
  });
  if (confirmed.some((r) => !replaceConfirmed.includes(r.rowNumber))) {
    return { ok: false, confirmedRows: confirmed, error: `ข้อ ${item.label} มี ${confirmed.length} แถวที่ยืนยันผลแล้ว การตรวจซ้ำจะแทนที่แถวเหล่านี้` };
  }
  const created = await createRequests(actor, job, [{ ...item, replaceConfirmed: confirmed.map((r) => r.rowNumber), acknowledgedMissing }]);
  return created ? { ok: true, requested: created } : { ok: false, error: `ข้อ ${item.label} เพิ่งเปลี่ยนสถานะ กรุณาโหลดหน้าใหม่` };
}

// ตรวจทั้งชุด: a request for every major item that hasn't been checked yet.
export async function requestAllUncheckedChecks(actor: Actor, job: Job): Promise<CheckRequestResult> {
  if (job.kind !== "IMPORTED") return { ok: false, error: "ขอตรวจได้เฉพาะงานตรวจแบบนำเข้าผล" };
  const items = await prisma.socMajorItem.findMany({ where: { jobId: job.id, state: "not_checked" }, orderBy: { position: "asc" } });
  if (!items.length) return { ok: false, error: "ไม่มีข้อใหญ่ที่ยังไม่ได้ตรวจ" };
  const created = await createRequests(actor, job, items.map((item) => ({ ...item, replaceConfirmed: [], acknowledgedMissing: [] })));
  return { ok: true, requested: created };
}

// One request per item, in position order so that claims (oldest first)
// follow the SOC. An item whose state changed since it was read is skipped.
async function createRequests(actor: Actor, job: Job, items: { id: string; label: string; state: string; replaceConfirmed: number[]; acknowledgedMissing: string[] }[]) {
  const labels: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const { count } = await tx.socMajorItem.updateMany({ where: { id: item.id, state: item.state }, data: { state: "requested" } });
      if (!count) continue;
      const request = await tx.socCheckRequest.create({
        data: { jobId: job.id, majorItemId: item.id, requestedById: actor.id, priorState: item.state, replaceConfirmed: item.replaceConfirmed, acknowledgedMissing: item.acknowledgedMissing },
      });
      await tx.socAuditEvent.create({
        data: { jobId: job.id, actorId: actor.id, action: "CHECK_REQUESTED", detail: { checkRequestId: request.id, majorItemId: item.id, majorItem: item.label, priorState: item.state, replaceConfirmed: item.replaceConfirmed, ...(item.acknowledgedMissing.length ? { acknowledgedMissing: item.acknowledgedMissing } : {}) } },
      });
      labels.push(item.label);
    }
    if (labels.length) {
      await writeAudit({
        actorId: actor.id, action: "SOC_CHECK_REQUESTED", entityType: "SOC_JOB", entityId: job.id,
        summary: `ขอตรวจข้อ ${labels.join(", ")} ด้วย SOC Runner ในงาน ${job.title}`,
        metadata: { majorItems: labels },
      }, tx);
    }
  });
  return labels.length;
}

// Cancels a request its runner hasn't claimed yet. The requester or ADMIN.
// The item goes back to the state it had before the request.
export async function cancelCheckRequest(actor: Actor, job: Job, requestId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await prisma.socCheckRequest.findFirst({ where: { id: requestId, jobId: job.id }, include: { majorItem: { select: { label: true } } } });
  if (!request) throw new Error("NOT_FOUND");
  if (request.requestedById !== actor.id && actor.role !== "ADMIN") throw new Error("FORBIDDEN");
  const cancelled = await prisma.$transaction(async (tx) => {
    const { count } = await tx.socCheckRequest.updateMany({ where: { id: request.id, state: "requested" }, data: { state: "cancelled", finishedAt: new Date() } });
    if (!count) return false;
    await tx.socMajorItem.updateMany({ where: { id: request.majorItemId, state: "requested" }, data: { state: request.priorState } });
    await tx.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: "CHECK_REQUEST_CANCELLED", detail: { checkRequestId: request.id, majorItemId: request.majorItemId, majorItem: request.majorItem.label } } });
    await writeAudit({
      actorId: actor.id, targetUserId: request.requestedById, action: "SOC_CHECK_REQUEST_CANCELLED", entityType: "SOC_JOB", entityId: job.id,
      summary: `ยกเลิกคำขอตรวจข้อ ${request.majorItem.label} ในงาน ${job.title}`, metadata: { checkRequestId: request.id },
    }, tx);
    return true;
  });
  return cancelled ? { ok: true } : { ok: false, error: "คำขอนี้เริ่มตรวจแล้วหรือปิดไปแล้ว ยกเลิกไม่ได้" };
}

// ---- Stale claims -----------------------------------------------------------------

// Running requests whose runner has been quiet for SOC_CHECK_REQUEST_STALE_MS
// go back to `requested`, so that the same user's runner picks them up again.
// Called lazily: on every claim and when a job page loads.
export async function releaseStaleCheckRequests(now = new Date()) {
  const cutoff = new Date(now.getTime() - SOC_CHECK_REQUEST_STALE_MS);
  const stale = await prisma.socCheckRequest.findMany({
    where: { state: "running", OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null }] },
    include: { majorItem: { select: { label: true } } },
  });
  for (const request of stale) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.socCheckRequest.updateMany({
        where: { id: request.id, state: "running", lastSeenAt: request.lastSeenAt },
        data: { state: "requested", claimedByLinkId: null, claimedAt: null, progressNote: null },
      });
      if (!count) return;
      await tx.socMajorItem.updateMany({ where: { id: request.majorItemId, state: "running" }, data: { state: "requested" } });
      await tx.socAuditEvent.create({
        data: { jobId: request.jobId, action: "CHECK_REQUEST_RELEASED", detail: { checkRequestId: request.id, majorItemId: request.majorItemId, majorItem: request.majorItem.label, lastSeenAt: request.lastSeenAt?.toISOString() ?? null } },
      });
    });
  }
  return stale.length;
}

// ---- Job page ---------------------------------------------------------------------

// Per major item of a job: its open request (with the requester's runner
// state, for "รอเครื่องของคุณเปิด") and the reason of a failed one.
export async function majorItemRequestViews(jobId: string, now = new Date()) {
  const requests = await prisma.socCheckRequest.findMany({
    where: { jobId, state: { in: [...SOC_CHECK_REQUEST_OPEN_STATES, "failed"] } },
    orderBy: { createdAt: "desc" },
    include: { requestedBy: { select: { displayName: true, socRunnerLinks: { where: { revokedAt: null }, select: { lastSeenAt: true } } } } },
  });
  const views = new Map<string, { request: SocCheckRequestView | null; failureReason: string | null }>();
  for (const r of requests) {
    if (views.has(r.majorItemId)) continue; // the latest one per item
    const link = r.requestedBy.socRunnerLinks[0];
    views.set(r.majorItemId, r.state === "failed"
      ? { request: null, failureReason: r.failureReason }
      : {
        failureReason: null,
        request: {
          id: r.id, state: r.state, requestedById: r.requestedById, requestedByName: r.requestedBy.displayName,
          runnerState: link ? socRunnerState(link.lastSeenAt, now) : null,
          progressNote: r.progressNote, resumeAt: r.resumeAt?.toISOString() ?? null,
        },
      });
  }
  return views;
}

// ---- Runner API -------------------------------------------------------------------

const requestFiles = (id: string) => `/api/soc-runner/requests/${id}`;

// What the runner gets for a claimed request: the major item to check, the
// documents and the pinned Skill Package, each with the URL to fetch it.
async function runnerView(requestId: string) {
  const request = await prisma.socCheckRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      job: { select: { id: true, title: true, documents: { where: { type: { in: ["SOC", "EVIDENCE"] } }, orderBy: { createdAt: "asc" } } } },
      majorItem: { select: { id: true, key: true, label: true, title: true } },
      skillPackage: true,
    },
  });
  const skill = request.skillPackage;
  return {
    id: request.id,
    claimedAt: request.claimedAt?.toISOString() ?? null,
    job: { id: request.job.id, title: request.job.title },
    majorItem: request.majorItem,
    acknowledgedMissing: request.acknowledgedMissing,
    skill: skill ? { version: skill.version, fileName: socSkillDownloadName(skill), sizeBytes: skill.sizeBytes, checksum: skill.checksum, url: `${requestFiles(request.id)}/skill` } : null,
    documents: request.job.documents.map((d) => ({
      id: d.id, type: d.type, name: d.originalName, sizeBytes: d.sizeBytes, checksum: d.checksum, url: `${requestFiles(request.id)}/documents/${d.id}`,
    })),
  };
}
export type RunnerCheckRequest = Awaited<ReturnType<typeof runnerView>>;

const CLAIMABLE = (userId: string, now: Date): Prisma.SocCheckRequestWhereInput => ({
  requestedById: userId,
  job: { deletedAt: null },
  OR: [{ state: { in: ["requested", "needs_login"] } }, { state: "paused_quota", resumeAt: { lte: now } }],
});

// The next request for the runner's own user, oldest first, now `running`
// on this link with the current Skill Package pinned. A request this link
// already runs (e.g. the runner restarted) comes back first. null when there
// is nothing to do, or while the runner reports Claude as logged out.
// Throws NO_SKILL_PACKAGE when there is work but no current skill.
export async function claimNextCheckRequest(link: RunnerLink): Promise<RunnerCheckRequest | null> {
  await releaseStaleCheckRequests();
  const now = new Date();
  const own = await prisma.socCheckRequest.findFirst({ where: { claimedByLinkId: link.id, state: "running", job: { deletedAt: null } }, orderBy: { createdAt: "asc" } });
  if (own) {
    await prisma.socCheckRequest.updateMany({ where: { id: own.id, state: "running" }, data: { lastSeenAt: now } });
    return runnerView(own.id);
  }
  if (link.claudeLogin === "logged_out") return null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = await prisma.socCheckRequest.findFirst({ where: CLAIMABLE(link.userId, now), orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { majorItem: { select: { label: true } } } });
    if (!next) return null;
    const skill = await currentSocSkillPackage();
    if (!skill) throw new Error("NO_SKILL_PACKAGE");
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.socCheckRequest.updateMany({
        where: { id: next.id, state: next.state, updatedAt: next.updatedAt },
        data: { state: "running", claimedByLinkId: link.id, claimedAt: now, lastSeenAt: now, skillPackageId: skill.id, progressNote: null, resumeAt: null },
      });
      if (!count) return false;
      // A link revoked since it was authenticated takes nothing.
      if (!(await tx.socRunnerLink.count({ where: { id: link.id, revokedAt: null } }))) throw new Error("UNAUTHORIZED");
      await tx.socMajorItem.update({ where: { id: next.majorItemId }, data: { state: "running" } });
      await tx.socAuditEvent.create({
        data: { jobId: next.jobId, actorId: link.userId, action: "CHECK_REQUEST_CLAIMED", detail: { checkRequestId: next.id, majorItemId: next.majorItemId, majorItem: next.majorItem.label, linkId: link.id, skillVersion: skill.version, from: next.state } },
      });
      return true;
    });
    if (claimed) return runnerView(next.id);
  }
  return null;
}

// A request of the runner's own user that this link is running. Another
// user's request is NOT_FOUND (its existence isn't revealed); one this link
// doesn't run is NOT_CLAIMED.
async function claimedRequest(link: RunnerLink, requestId: string) {
  const request = await prisma.socCheckRequest.findFirst({
    where: { id: requestId, requestedById: link.userId, job: { deletedAt: null } },
    include: { majorItem: { select: { label: true } }, job: { select: { title: true } } },
  });
  if (!request) throw new Error("NOT_FOUND");
  if (request.state !== "running" || request.claimedByLinkId !== link.id) throw new Error("NOT_CLAIMED");
  return request;
}

// A SOC or evidence file of the request's job.
export async function runnerRequestDocument(link: RunnerLink, requestId: string, documentId: string) {
  const request = await claimedRequest(link, requestId);
  const document = await prisma.socDocument.findFirst({ where: { id: documentId, jobId: request.jobId, type: { in: ["SOC", "EVIDENCE"] } } });
  if (!document) throw new Error("NOT_FOUND");
  await touch(request.id);
  return { document, bytes: await readFile(resolveStorageKey(document.storageKey)) };
}

// The Skill Package pinned when the request was claimed.
export async function runnerRequestSkill(link: RunnerLink, requestId: string) {
  const request = await claimedRequest(link, requestId);
  const found = request.skillPackageId ? await readSocSkillPackage(request.skillPackageId) : null;
  if (!found) throw new Error("NO_SKILL_PACKAGE");
  await touch(request.id);
  return found;
}

async function touch(requestId: string) {
  await prisma.socCheckRequest.updateMany({ where: { id: requestId, state: "running" }, data: { lastSeenAt: new Date() } });
}

export type CheckRequestReport =
  | { state: "running"; progress: string | null }
  | { state: "paused_quota"; resumeAt: Date; progress: string | null }
  | { state: "needs_documents"; missingDocuments: string[] }
  | { state: "failed"; reason: string }
  | { state: "needs_login" };

// A report body, or the reason it isn't one (in English, for the runner's log).
export function parseCheckRequestReport(body: unknown, now = new Date()): CheckRequestReport | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const progress = b.progress === undefined || b.progress === null ? null : text(b.progress, MAX_NOTE);
  if (b.progress !== undefined && b.progress !== null && progress === null) return { error: "progress must be a non-empty string" };
  switch (b.state) {
    case "running":
      return { state: "running", progress };
    case "paused_quota": {
      const resumeAt = typeof b.resumeAt === "string" ? new Date(b.resumeAt) : null;
      if (!resumeAt || Number.isNaN(resumeAt.getTime())) return { error: "resumeAt (ISO date-time) is required for paused_quota" };
      if (resumeAt.getTime() - now.getTime() > MAX_PAUSE_MS) return { error: "resumeAt must be within 7 days" };
      return { state: "paused_quota", resumeAt, progress };
    }
    case "needs_documents": {
      const names = Array.isArray(b.missingDocuments) ? b.missingDocuments.map((n) => text(n, MAX_MISSING_NAME)) : [];
      if (!names.length || names.length > MAX_MISSING || names.some((n) => n === null)) return { error: `missingDocuments must list 1-${MAX_MISSING} non-empty names` };
      return { state: "needs_documents", missingDocuments: [...new Set(names as string[])] };
    }
    case "failed": {
      const reason = text(b.reason, MAX_REASON);
      return reason ? { state: "failed", reason } : { error: "reason is required for failed" };
    }
    case "needs_login":
      return { state: "needs_login" };
    default:
      return { error: "state must be running | paused_quota | needs_documents | failed | needs_login" };
  }
}

const REPORT_SUMMARY: Record<Exclude<CheckRequestReport["state"], "running">, string> = {
  paused_quota: "หยุดชั่วคราวเพราะโควตา Claude หมด", needs_documents: "หยุดเพราะขาดเอกสารที่ SOC อ้าง",
  failed: "ตรวจไม่สำเร็จ", needs_login: "SOC Runner ต้องเข้าสู่ระบบ Claude ใหม่",
};

// Moves a running request, and its major item, to the reported state.
// `running` only records progress. needs_documents and failed close the
// request; paused_quota waits for its resume time and needs_login for the
// runner to report Claude logged in again, then the same user's runner
// claims it again.
export async function reportCheckRequest(link: RunnerLink, requestId: string, report: CheckRequestReport) {
  const request = await claimedRequest(link, requestId);
  const now = new Date();
  const where = { id: request.id, state: "running", claimedByLinkId: link.id };
  if (report.state === "running") {
    const { count } = await prisma.socCheckRequest.updateMany({ where, data: { lastSeenAt: now, progressNote: report.progress } });
    if (!count) throw new Error("NOT_CLAIMED");
    return;
  }
  const data: Prisma.SocCheckRequestUpdateManyMutationInput = { state: report.state, lastSeenAt: now };
  if (report.state === "paused_quota") Object.assign(data, { resumeAt: report.resumeAt, progressNote: report.progress });
  if (report.state === "needs_documents") Object.assign(data, { missingDocuments: report.missingDocuments, finishedAt: now, progressNote: null });
  if (report.state === "failed") Object.assign(data, { failureReason: report.reason, finishedAt: now, progressNote: null });
  if (report.state === "needs_login") Object.assign(data, { claimedByLinkId: null, progressNote: null });
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.socCheckRequest.updateMany({ where, data });
    if (!count) throw new Error("NOT_CLAIMED");
    await tx.socMajorItem.updateMany({
      where: { id: request.majorItemId, state: "running" },
      data: { state: report.state, ...(report.state === "needs_documents" ? { missingDocuments: report.missingDocuments } : {}) },
    });
    // Until the next heartbeat says otherwise, claims wait for a Claude login.
    if (report.state === "needs_login") await tx.socRunnerLink.updateMany({ where: { id: link.id, revokedAt: null }, data: { claudeLogin: "logged_out" } });
    const { state: _state, ...rest } = report;
    await tx.socAuditEvent.create({
      data: { jobId: request.jobId, actorId: link.userId, action: "CHECK_REQUEST_REPORTED", detail: JSON.parse(JSON.stringify({ checkRequestId: request.id, majorItemId: request.majorItemId, majorItem: request.majorItem.label, state: report.state, ...rest })) },
    });
    await writeAudit({
      actorId: link.userId, action: "SOC_CHECK_REQUEST_REPORTED", entityType: "SOC_JOB", entityId: request.jobId,
      summary: `ข้อ ${request.majorItem.label} ในงาน ${request.job.title}: ${REPORT_SUMMARY[report.state]}`,
      metadata: { checkRequestId: request.id, state: report.state },
    }, tx);
  });
}

// Submits the run's results.json and SOC_Check through the import (seam 1),
// as the requester, source "runner". On success the request is done. Any
// rejection (the same validation as a manual upload) closes the request as
// failed with the reasons, since sending the same output again can't pass.
export async function submitCheckRequest(
  link: RunnerLink,
  requestId: string,
  input: { results: unknown; socCheck: { name: string; bytes: Uint8Array }; skillVersion: string; model: string },
): Promise<LocalCheckRunImport> {
  const request = await claimedRequest(link, requestId);
  await touch(request.id);
  const pinned = request.skillPackageId ? await prisma.socSkillPackage.findUnique({ where: { id: request.skillPackageId }, select: { version: true } }) : null;
  const imported = await importLocalCheckRun({ id: link.userId }, {
    jobId: request.jobId, majorItemId: request.majorItemId, results: input.results, socCheck: input.socCheck,
    run: { skillVersion: input.skillVersion || pinned?.version || "", model: input.model, source: "runner" },
    replaceConfirmed: request.replaceConfirmed,
    checkRequest: { id: request.id, requestedById: request.requestedById, acknowledgedMissing: request.acknowledgedMissing },
  });
  if (!imported.ok) {
    const reason = `ผลตรวจที่ SOC Runner ส่งกลับมาไม่ผ่านการตรวจสอบ: ${imported.errors.slice(0, 3).join(" / ")}`.slice(0, MAX_REASON);
    // Best effort: the request may have been released meanwhile.
    await reportCheckRequest(link, request.id, { state: "failed", reason }).catch(() => undefined);
  }
  return imported;
}
