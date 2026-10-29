// Proposal (โครงการข้อเสนอ, ADR 0012): create, rename, trash, list, and the
// six Proposal Steps of its page. This module is the only place that knows
// the step order and derives a step's status; pages and actions call it.
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { normalizeSocTitle, SOC_TITLE_INVALID, SOC_TITLE_MAX, SOC_TITLE_TAKEN } from "@/lib/soc-shared";
import { socStorageRoot } from "@/lib/soc";

type SocActor = Awaited<ReturnType<typeof requireAccess>>;

export const PROPOSAL_TRASH_DAYS = 30;

export function proposalStorageDir(id: string): string {
  return path.join(socStorageRoot(), "proposals", id);
}

export function cleanProposalTitle(raw: unknown): string {
  const title = String(raw ?? "").trim();
  if (!title || title.length > SOC_TITLE_MAX) throw new Error(SOC_TITLE_INVALID);
  return title;
}

// Trashed Proposals hold no title. `exceptId` is the Proposal being renamed.
async function titleTaken(title: string, exceptId?: string): Promise<boolean> {
  const key = normalizeSocTitle(title);
  const rows = await prisma.proposal.findMany({ where: { deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { title: true } });
  return rows.some((row) => normalizeSocTitle(row.title) === key);
}

// The title a Proposal gets back from the trash: its own, or with " (กู้คืน)"
// and then " (กู้คืน 2)"… when a live Proposal took it meanwhile.
export async function restoredProposalTitle(title: string, id: string): Promise<string> {
  if (!(await titleTaken(title, id))) return title;
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? " (กู้คืน)" : ` (กู้คืน ${n})`;
    const candidate = `${title.slice(0, SOC_TITLE_MAX - suffix.length)}${suffix}`;
    if (!(await titleTaken(candidate, id))) return candidate;
  }
}

export async function requireSocUser(): Promise<SocActor> {
  return requireAccess("soc");
}

// Every user with SOC access may open any live Proposal.
export async function authorizeProposal(id: string) {
  const actor = await requireSocUser();
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal || proposal.deletedAt) throw new Error("NOT_FOUND");
  return { actor, proposal };
}

// Rename and trash stay with the creator and ADMIN.
export async function authorizeProposalOwner(id: string) {
  const { actor, proposal } = await authorizeProposal(id);
  if (proposal.creatorId !== actor.id && actor.role !== "ADMIN") throw new Error("FORBIDDEN");
  return { actor, proposal };
}

export async function createProposal(rawTitle: unknown) {
  const actor = await requireSocUser();
  const title = cleanProposalTitle(rawTitle);
  if (await titleTaken(title)) throw new Error(SOC_TITLE_TAKEN);
  const proposal = await prisma.proposal.create({ data: { title, creatorId: actor.id } });
  await writeAudit({ actorId: actor.id, action: "PROPOSAL_CREATED", entityType: "PROPOSAL", entityId: proposal.id, summary: `สร้าง Proposal ${title}` });
  return proposal;
}

export async function renameProposal(id: string, rawTitle: unknown) {
  const { actor, proposal } = await authorizeProposalOwner(id);
  const title = cleanProposalTitle(rawTitle);
  if (title === proposal.title) return title;
  if (await titleTaken(title, id)) throw new Error(SOC_TITLE_TAKEN);
  await prisma.proposal.update({ where: { id }, data: { title } });
  await writeAudit({ actorId: actor.id, action: "PROPOSAL_RENAMED", entityType: "PROPOSAL", entityId: id, summary: `เปลี่ยนชื่อ Proposal ${proposal.title} เป็น ${title}`, metadata: { from: proposal.title, to: title } });
  return title;
}

export async function trashProposal(id: string) {
  const { actor, proposal } = await authorizeProposalOwner(id);
  const now = new Date();
  await prisma.proposal.update({ where: { id }, data: { deletedAt: now, deletedById: actor.id, purgeAfter: new Date(now.getTime() + PROPOSAL_TRASH_DAYS * 86400000) } });
  await writeAudit({ actorId: actor.id, action: "PROPOSAL_TRASHED", entityType: "PROPOSAL", entityId: id, summary: `ย้าย Proposal ${proposal.title} ไปถังขยะ` });
}

export async function restoreProposal(id: string, actorId: string) {
  const trashed = await prisma.proposal.findUnique({ where: { id } });
  if (!trashed || !trashed.deletedAt) throw new Error("NOT_FOUND");
  const title = await restoredProposalTitle(trashed.title, id);
  await prisma.proposal.update({ where: { id }, data: { title, deletedAt: null, deletedById: null, purgeAfter: null, restoredAt: new Date() } });
  await writeAudit({ actorId, action: "PROPOSAL_RESTORED", entityType: "PROPOSAL", entityId: id, summary: `กู้คืน Proposal ${title}`, metadata: title === trashed.title ? undefined : { renamedFrom: trashed.title } });
}

// Deletes a trashed Proposal's rows and its storage folder (what it owns
// cascades from here as later tickets add it). The AuditLog entry stays: by
// the admin, or by the server (no actor) when the 30 days ran out.
export async function deleteTrashedProposal(id: string, actorId: string | null): Promise<boolean> {
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal || !proposal.deletedAt) return false;
  await prisma.proposal.delete({ where: { id } });
  await rm(proposalStorageDir(id), { recursive: true, force: true });
  const automatic = actorId === null;
  await writeAudit({
    actorId, action: "PROPOSAL_PURGED", entityType: "PROPOSAL", entityId: id,
    summary: `ลบ Proposal ${proposal.title} ถาวร${automatic ? " (อัตโนมัติ ครบ 30 วันในถังขยะ)" : ""}`,
    metadata: { title: proposal.title, creatorId: proposal.creatorId, automatic, deletedAt: proposal.deletedAt, purgeAfter: proposal.purgeAfter },
  });
  return true;
}

export async function purgeExpiredProposals(now = new Date(), log: (message: string) => void = console.error): Promise<number> {
  const due = await prisma.proposal.findMany({ where: { deletedAt: { not: null }, purgeAfter: { lte: now } }, select: { id: true } });
  let purged = 0;
  for (const { id } of due) {
    try {
      if (await deleteTrashedProposal(id, null)) purged += 1;
    } catch (error) {
      log(`[proposal] ลบ Proposal ${id} ถาวรไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return purged;
}

// ---- Proposal Steps ----

export type StepStatus = "done" | "doing" | "todo" | "stale" | "reserved"; // เสร็จ/กำลังทำ/ยังไม่ทำ/ต้องทำใหม่/เร็ว ๆ นี้
export type StepAi = "ไม่ใช้ AI" | "AI ไม่บังคับ" | "ใช้ AI";
export type StepCard = {
  no: number; title: string; status: StepStatus; ai: StepAi;
  needs: string; gives: string; now: string;
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = { done: "เสร็จ", doing: "กำลังทำ", todo: "ยังไม่ทำ", stale: "ต้องทำใหม่", reserved: "เร็ว ๆ นี้" };

// What the Proposal holds, as far as step status is concerned. A Proposal
// has no files yet, so every fact is empty; later tickets fill them in.
export type ProposalFacts = Record<string, never>;

// The six steps in order. Statuses come from the facts, never from storage.
export function proposalSteps(_facts: ProposalFacts): StepCard[] {
  return [
    { no: 1, title: "TOR", status: "todo", ai: "ไม่ใช้ AI", needs: "ไฟล์ TOR (PDF)", gives: "TOR ของ Proposal ที่ทุกขั้นใช้ร่วมกัน", now: "ยังไม่มี TOR" },
    { no: 2, title: "โครง Content", status: "reserved", ai: "ไม่ใช้ AI", needs: "TOR", gives: "โครงเนื้อหาข้อเสนอ", now: "เร็ว ๆ นี้" },
    { no: 3, title: "สร้าง SOC", status: "todo", ai: "ไม่ใช้ AI", needs: "TOR และเทมเพลต SOC", gives: "SOC ฉบับร่างที่เติมเลขข้อและข้อกำหนด TOR", now: "ยังไม่มี SOC" },
    { no: 4, title: "กรอกอ้างอิง", status: "todo", ai: "AI ไม่บังคับ", needs: "SOC ปัจจุบันและ Datasheet", gives: "SOC ฉบับใหม่ที่เติมเอกสารและหน้าอ้างอิง", now: "ยังไม่มี SOC" },
    { no: 5, title: "ตรวจ TOR ตรงต้นฉบับ", status: "todo", ai: "AI ไม่บังคับ", needs: "SOC ปัจจุบันและ TOR", gives: "ผลเทียบข้อความ TOR ใน SOC กับต้นฉบับ", now: "ยังไม่มี SOC" },
    { no: 6, title: "ตรวจหลักฐาน", status: "todo", ai: "ใช้ AI", needs: "SOC ปัจจุบันและ Datasheet", gives: "ผลตรวจ SOC เทียบ Datasheet และ SOC_Check", now: "ยังไม่มี SOC" },
  ];
}

// "เสร็จ N/5": โครง Content is not counted.
export function proposalProgress(steps: StepCard[]): { done: number; total: number } {
  const counted = steps.filter((step) => step.status !== "reserved");
  return { done: counted.filter((step) => step.status === "done").length, total: counted.length };
}

// ---- Lists and page data ----

export async function listProposals() {
  await requireSocUser();
  const rows = await prisma.proposal.findMany({
    where: { deletedAt: null },
    include: { creator: { select: { displayName: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const progress = proposalProgress(proposalSteps({}));
  return rows.map((row) => ({
    id: row.id, title: row.title, creatorName: row.creator.displayName, updatedAt: row.updatedAt,
    progress, currentVersion: null as number | null, waitingCount: 0,
  }));
}

export async function getProposalPage(id: string) {
  const { actor, proposal } = await authorizeProposal(id);
  const creator = await prisma.user.findUniqueOrThrow({ where: { id: proposal.creatorId }, select: { displayName: true } });
  return {
    id: proposal.id, viewerId: actor.id, title: proposal.title, creatorName: creator.displayName, updatedAt: proposal.updatedAt,
    canManage: proposal.creatorId === actor.id || actor.role === "ADMIN",
    steps: proposalSteps({}),
  };
}
