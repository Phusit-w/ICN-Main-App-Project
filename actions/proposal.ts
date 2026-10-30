"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeProposal, createProposal, renameProposal, trashProposal } from "@/lib/proposal";
import { DATASHEET_RUNNER_BUSY, removeProposalDatasheet, renameDatasheetCitation } from "@/lib/proposal-datasheet";
import { startEvidenceCheck, startTorCheck } from "@/lib/proposal-check";
import { resumeVersionRead } from "@/lib/proposal-soc";
import { SOC_TITLE_INVALID, SOC_TITLE_TAKEN } from "@/lib/soc-shared";

type TitleResult<T> = ({ ok: true } & T) | { ok: false; error: string };

// A refused title comes back as { ok: false, error } for the form (a thrown
// message is hidden from the browser in production).
function refusedTitle(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : "";
  if (message === SOC_TITLE_TAKEN || message === SOC_TITLE_INVALID) return { ok: false, error: message };
  throw error;
}

export async function createProposalAction(title: string): Promise<TitleResult<{ id: string }>> {
  try {
    const proposal = await createProposal(title);
    revalidatePath("/soc");
    return { ok: true, id: proposal.id };
  } catch (error) {
    return refusedTitle(error);
  }
}

// Creator or ADMIN.
export async function renameProposalAction(id: string, title: string): Promise<TitleResult<{ title: string }>> {
  try {
    const renamed = await renameProposal(id, title);
    revalidatePath(`/soc/proposals/${id}`); revalidatePath("/soc");
    return { ok: true, title: renamed };
  } catch (error) {
    return refusedTitle(error);
  }
}

// A scanned SOC whose read failed goes on from its saved cells. Any SOC user
// may, as any may upload the SOC.
export async function resumeSocVersionReadAction(proposalId: string, versionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await authorizeProposal(proposalId);
  const version = await prisma.socVersion.findUnique({ where: { id: versionId }, select: { proposalId: true } });
  if (!version || version.proposalId !== proposalId) throw new Error("NOT_FOUND");
  try {
    if (!(await resumeVersionRead(versionId))) return { ok: false, error: "SOC ฉบับนี้ไม่ได้อยู่ในสถานะอ่านไม่สำเร็จ" };
  } catch (error) {
    return { ok: false, error: error instanceof Error && /[฀-๿]/.test(error.message) ? error.message : "อ่านต่อไม่สำเร็จ" };
  }
  revalidatePath(`/soc/proposals/${proposalId}`);
  return { ok: true };
}

// Creator or ADMIN. ADMIN restores or purges it early from /admin/trash.
export async function trashProposalAction(id: string) {
  await trashProposal(id);
  revalidatePath("/soc"); revalidatePath(`/soc/proposals/${id}`);
}

// Any SOC user may rename a Datasheet's ชื่อที่ใช้อ้างอิง or remove a Datasheet,
// as any may add one. A refused name comes back as { ok: false, error }.
export async function renameDatasheetCitationAction(proposalId: string, datasheetId: string, name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    const renamed = await renameDatasheetCitation(proposalId, datasheetId, name);
    revalidatePath(`/soc/proposals/${proposalId}`);
    return { ok: true, name: renamed };
  } catch (error) {
    if (error instanceof Error && /[฀-๿]/.test(error.message)) return { ok: false, error: error.message };
    throw error;
  }
}

// Refused (a SOC Runner is checking the Proposal) comes back as { ok: false, error }.
export async function removeProposalDatasheetAction(proposalId: string, datasheetId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await removeProposalDatasheet(proposalId, datasheetId);
    revalidatePath(`/soc/proposals/${proposalId}`); revalidatePath("/soc");
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === DATASHEET_RUNNER_BUSY) return { ok: false, error: error.message };
    throw error;
  }
}

// ตรวจ TOR ตรงต้นฉบับ / ตรวจหลักฐาน on the current SOC Version: makes the
// version's SOC job when it has none and returns it for the page to open.
// Any SOC user may start one. A message for the user comes back as { ok: false, error }.
export async function startProposalCheckAction(proposalId: string, kind: "tor" | "evidence"): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const { actor, proposal } = await authorizeProposal(proposalId);
  try {
    const jobId = kind === "tor" ? await startTorCheck(actor, proposal) : await startEvidenceCheck(actor, proposal);
    revalidatePath(`/soc/proposals/${proposalId}`); revalidatePath("/soc");
    return { ok: true, jobId };
  } catch (error) {
    if (error instanceof Error && /[฀-๿]/.test(error.message)) return { ok: false, error: error.message };
    throw error;
  }
}
