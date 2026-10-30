// Checks of a Proposal's SOC Versions (ADR 0012, proposal-build 06): the first
// ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน on a SOC Version makes that version's SOC
// job ("<Proposal> · ฉบับ N", an ordinary Imported SOC Check) and the existing
// job and review pages carry on from there. The job uses the Proposal's TOR
// and live Datasheets (lib/soc-evidence.ts) instead of copies; only the SOC
// itself is copied, so the job owns its input. The functions here take an
// already-authorized Proposal (lib/proposal.ts checks who may open it).
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { writeAudit } from "@/lib/authorization";
import { assertSocTitleFree, NO_MAJOR_ITEMS, resolveStorageKey, socStorageRoot, SOC_TITLE_MAX, SOC_TITLE_TAKEN, storeSocFile } from "@/lib/soc";
import { stopTorRead, attachTorOriginal, TOR_DOCUMENT } from "@/lib/soc-tor";
import { readSocTable } from "@/lib/soc-table";

type Actor = Parameters<typeof attachTorOriginal>[0];
type ProposalRef = { id: string; title: string };

export const NO_CURRENT_SOC = "ยังไม่มี SOC ที่อ่านได้ใน Proposal นี้ กรุณาเพิ่ม SOC ก่อน";
export const NO_PROPOSAL_TOR = "Proposal นี้ยังไม่มี TOR กรุณาเพิ่ม TOR ก่อน";
export const VERSION_JOB_TRASHED = "งานตรวจของ SOC ฉบับนี้อยู่ในถังขยะ กรุณากู้คืนงานนั้นก่อน";
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// "<Proposal> · ฉบับ N"; another job already holding it adds " (2)"…
async function freeJobTitle(proposalTitle: string, number: number): Promise<string> {
  const base = `${proposalTitle} · ฉบับ ${number}`;
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? "" : ` (${n})`;
    const title = `${base.slice(0, SOC_TITLE_MAX - suffix.length)}${suffix}`;
    try {
      await assertSocTitleFree(title);
      return title;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== SOC_TITLE_TAKEN) throw error;
    }
  }
}

// The SOC job of the Proposal's current SOC Version, made now when it has none.
// Its SOC (and the PDF a PDF SOC was made from) is copied from the version;
// the major items are read from that SOC as an upload would be.
export async function ensureVersionJob(actor: Actor, proposal: ProposalRef): Promise<{ jobId: string; created: boolean }> {
  const version = await prisma.socVersion.findFirst({ where: { proposalId: proposal.id, state: "ready" }, orderBy: { number: "desc" }, include: { job: { select: { id: true, deletedAt: true } } } });
  if (!version || !version.storageKey) throw new Error(NO_CURRENT_SOC);
  if (version.job) {
    if (version.job.deletedAt) throw new Error(VERSION_JOB_TRASHED);
    return { jobId: version.job.id, created: false };
  }
  const bytes = new Uint8Array(await readFile(resolveStorageKey(version.storageKey)));
  const { file, majorItems } = readSocTable(bytes);
  if (!majorItems.length) throw new Error(NO_MAJOR_ITEMS);
  const jobId = randomUUID();
  try {
    const storedSoc = await storeSocFile(jobId, version.originalName ?? `SOC-${version.number}${file.extension}`, file.extension, bytes);
    const storedSource = version.sourceStorageKey ? await storeSocFile(jobId, version.sourceName ?? `SOC-${version.number}.pdf`, ".pdf", new Uint8Array(await readFile(resolveStorageKey(version.sourceStorageKey)))) : null;
    const title = await freeJobTitle(proposal.title, version.number);
    const detail = { kind: "IMPORTED", proposalId: proposal.id, socVersion: version.number, majorItemCount: majorItems.length };
    await prisma.$transaction([
      prisma.socJob.create({
        data: {
          id: jobId, kind: "IMPORTED", title, ownerId: actor.id, proposalId: proposal.id, socVersionId: version.id,
          status: "NEEDS_REVIEW", stage: "รอตรวจข้อใหญ่", progress: 0,
          expiresAt: new Date(Date.now() + RETENTION_MS),
          socWarnings: Array.isArray(version.warnings) && version.warnings.length ? (version.warnings as Prisma.InputJsonValue) : undefined,
          socRowPages: storedSource && version.rowPages ? (version.rowPages as Prisma.InputJsonValue) : undefined,
        },
      }),
      prisma.socDocument.create({ data: { jobId, type: "SOC", mimeType: file.mimeType, ...storedSoc } }),
      ...(storedSource ? [prisma.socDocument.create({ data: { jobId, type: "SOC_SOURCE_PDF", mimeType: "application/pdf", ...storedSource } })] : []),
      prisma.socMajorItem.createMany({ data: majorItems.map((item, i) => ({ jobId, ...item, position: i + 1 })) }),
      prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "JOB_CREATED", detail } }),
    ]);
    await writeAudit({ actorId: actor.id, action: "SOC_CREATED", entityType: "SOC_JOB", entityId: jobId, summary: `สร้างงาน SOC ${title} จาก Proposal ${proposal.title} ฉบับ ${version.number}`, metadata: detail });
  } catch (error) {
    await prisma.socJob.delete({ where: { id: jobId } }).catch(() => undefined);
    await rm(path.join(socStorageRoot(), jobId), { recursive: true, force: true }).catch(() => undefined);
    // Someone else made this version's job first: use theirs.
    if ((error as { code?: string }).code === "P2002") {
      const existing = await prisma.socJob.findUnique({ where: { socVersionId: version.id }, select: { id: true } });
      if (existing) return { jobId: existing.id, created: false };
    }
    throw error;
  }
  return { jobId, created: true };
}

// ตรวจหลักฐาน: the version's job, ready for review. Datasheets are the
// Proposal's own, so a Proposal with only a SOC and Datasheets starts here.
export async function startEvidenceCheck(actor: Actor, proposal: ProposalRef): Promise<string> {
  return (await ensureVersionJob(actor, proposal)).jobId;
}

// ตรวจ TOR ตรงต้นฉบับ: the version's job with the Proposal's TOR attached as
// its TOR ต้นฉบับ, compared with the SOC at once (a scanned TOR is read in the
// OCR line; the uploader already confirmed that when adding the TOR). A job
// that already holds this very TOR is left as it is.
export async function startTorCheck(actor: Actor, proposal: ProposalRef): Promise<string> {
  const tor = await prisma.proposalTor.findUnique({ where: { proposalId: proposal.id } });
  if (!tor) throw new Error(NO_PROPOSAL_TOR);
  const { jobId } = await ensureVersionJob(actor, proposal);
  const attached = await prisma.socDocument.findFirst({ where: { jobId, type: TOR_DOCUMENT }, select: { checksum: true } });
  if (attached?.checksum === tor.checksum) return jobId;
  const job = await prisma.socJob.findUniqueOrThrow({ where: { id: jobId } });
  const bytes = new Uint8Array(await readFile(resolveStorageKey(tor.storageKey)));
  await attachTorOriginal(actor, job, { name: tor.originalName, bytes }, { ocrConfirmed: true, shared: { storageKey: tor.storageKey, checksum: tor.checksum, sizeBytes: tor.sizeBytes, originalName: tor.originalName } });
  return jobId;
}

// Deleting a Proposal for good: its jobs' rows cascade, their folders would not.
export async function removeProposalJobs(proposalId: string): Promise<void> {
  const jobs = await prisma.socJob.findMany({ where: { proposalId }, select: { id: true } });
  for (const { id } of jobs) await stopTorRead(id);
  await prisma.socJob.deleteMany({ where: { proposalId } });
  for (const { id } of jobs) await rm(resolveStorageKey(id), { recursive: true, force: true });
}

// ---- Step statuses ----

export type CheckStatus = "done" | "doing" | "todo" | "stale";
// `jobId`: the current SOC Version's job; `staleJobId`: the result a stale step points at.
export type CheckStep = { status: CheckStatus; jobId: string | null; staleJobId: string | null };
export type ProposalChecks = { tor: CheckStep; evidence: CheckStep };

export const NO_CHECKS: ProposalChecks = { tor: { status: "todo", jobId: null, staleJobId: null }, evidence: { status: "todo", jobId: null, staleJobId: null } };

type JobFacts = {
  id: string; versionNumber: number;
  tor: { state: string; checksum: string } | null;
  items: { state: string; skipped: boolean }[];
};

const countedItems = (job: JobFacts) => job.items.filter((item) => !item.skipped);
const hasEvidenceProgress = (job: JobFacts) => countedItems(job).some((item) => item.state !== "not_checked");

// Pure: the two check steps from the current version's job and the older ones'
// (newest first). A result on an older version, or made from a TOR that has
// since been replaced, is ต้องทำใหม่ and keeps its link.
export function checkSteps(current: JobFacts | null, older: JobFacts[], torChecksum: string | null): ProposalChecks {
  const olderTor = older.find((job) => job.tor?.state === "ready");
  const tor: CheckStep = { status: "todo", jobId: current?.id ?? null, staleJobId: null };
  if (current?.tor) {
    if (torChecksum && current.tor.checksum !== torChecksum) Object.assign(tor, { status: "stale", staleJobId: current.id });
    else tor.status = current.tor.state === "ready" ? "done" : current.tor.state === "reading" ? "doing" : "todo";
  } else if (olderTor) Object.assign(tor, { status: "stale", staleJobId: olderTor.id });

  const evidence: CheckStep = { status: "todo", jobId: current?.id ?? null, staleJobId: null };
  const olderChecked = older.find((job) => countedItems(job).some((item) => item.state === "checked"));
  if (current && hasEvidenceProgress(current)) {
    const items = countedItems(current);
    evidence.status = items.every((item) => item.state === "checked") ? "done" : "doing";
  } else if (olderChecked) Object.assign(evidence, { status: "stale", staleJobId: olderChecked.id });
  return { tor, evidence };
}

// The check steps of several Proposals at once (the list shows progress).
export async function loadProposalChecks(proposalIds: string[]): Promise<Map<string, ProposalChecks>> {
  if (!proposalIds.length) return new Map();
  const [versions, tors, jobs] = await Promise.all([
    prisma.socVersion.findMany({ where: { proposalId: { in: proposalIds }, state: "ready" }, orderBy: { number: "desc" }, select: { id: true, proposalId: true, number: true } }),
    prisma.proposalTor.findMany({ where: { proposalId: { in: proposalIds } }, select: { proposalId: true, checksum: true } }),
    prisma.socJob.findMany({
      where: { proposalId: { in: proposalIds }, deletedAt: null },
      select: { id: true, proposalId: true, socVersion: { select: { id: true, number: true } }, torMatch: { select: { state: true, document: { select: { checksum: true } } } }, majorItems: { select: { state: true, skipped: true } } },
    }),
  ]);
  const result = new Map<string, ProposalChecks>();
  for (const proposalId of proposalIds) {
    const currentVersionId = versions.find((v) => v.proposalId === proposalId)?.id;
    const facts = jobs
      .filter((job) => job.proposalId === proposalId && job.socVersion)
      .map((job): JobFacts & { versionId: string } => ({
        id: job.id, versionId: job.socVersion!.id, versionNumber: job.socVersion!.number,
        tor: job.torMatch ? { state: job.torMatch.state, checksum: job.torMatch.document.checksum } : null,
        items: job.majorItems,
      }))
      .sort((a, b) => b.versionNumber - a.versionNumber);
    result.set(proposalId, checkSteps(facts.find((job) => job.versionId === currentVersionId) ?? null, facts.filter((job) => job.versionId !== currentVersionId), tors.find((t) => t.proposalId === proposalId)?.checksum ?? null));
  }
  return result;
}
