// The TOR step of a Proposal: one TOR PDF, uploaded and replaceable. A scanned
// TOR (no text layer) is only accepted after the uploader confirmed the
// outside OCR, as for a TOR ต้นฉบับ (lib/soc-tor.ts); this step stores it, the
// steps that read the TOR (สร้าง SOC, ตรวจ TOR ตรงต้นฉบับ) do the OCR.
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { authorizeProposal } from "@/lib/proposal";
import { OCR_CONFIRM_REQUIRED, removeUnsharedFile, resolveStorageKey, storeSocFile } from "@/lib/soc";
import { readTextTor } from "@/lib/soc-tor-read";
import { configuredOcrReader, OCR_NOT_SET_UP } from "@/lib/soc-typhoon";

// A PDF validateUpload() has already checked. Replaces the Proposal's TOR:
// the old row goes, and its file too unless a SOC job's TOR Match still cites it
// (that result stays openable and shows ต้องทำใหม่).
export async function attachProposalTor(
  proposalId: string,
  upload: { name: string; bytes: Uint8Array },
  { ocrConfigured = Boolean(configuredOcrReader()), ocrConfirmed = false }: { ocrConfigured?: boolean; ocrConfirmed?: boolean } = {},
) {
  const { actor, proposal } = await authorizeProposal(proposalId);
  const read = readTextTor(upload.bytes);
  const scanned = !read.pages;
  if (scanned) {
    if (!ocrConfigured) throw new Error(OCR_NOT_SET_UP);
    if (!ocrConfirmed) throw new Error(OCR_CONFIRM_REQUIRED);
  }
  const old = await prisma.proposalTor.findUnique({ where: { proposalId } });
  const stored = await storeSocFile(`proposals/${proposalId}`, upload.name, ".pdf", upload.bytes);
  const data = { ...stored, mimeType: "application/pdf", pageCount: read.pageCount, scanned, uploadedById: actor.id };
  try {
    await prisma.$transaction([
      prisma.proposalTor.deleteMany({ where: { proposalId } }),
      prisma.proposalTor.create({ data: { proposalId, ...data } }),
      prisma.proposal.update({ where: { id: proposalId }, data: { updatedAt: new Date() } }),
    ]);
  } catch (error) {
    await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    throw error;
  }
  if (old) await removeUnsharedFile(old.storageKey);
  await writeAudit({
    actorId: actor.id, action: old ? "PROPOSAL_TOR_REPLACED" : "PROPOSAL_TOR_ATTACHED", entityType: "PROPOSAL", entityId: proposalId,
    summary: `${old ? "แทนที่" : "แนบ"} TOR ${stored.originalName} ใน Proposal ${proposal.title}${scanned ? " (PDF สแกน)" : ""}`,
    metadata: { name: stored.originalName, pageCount: read.pageCount, scanned, replaced: old?.originalName ?? null },
  });
  return { name: stored.originalName, pageCount: read.pageCount, scanned };
}
