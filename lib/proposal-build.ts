// The สร้าง SOC step of a Proposal: a SOC Build started from the Proposal's own
// TOR (so the TOR is not uploaded again), with the page ranges and SOC Template
// as on the standalone build form. The build is lib/soc-builds.ts's; when it is
// READY its draft becomes a SOC Version there (addBuildVersion).
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { authorizeProposal } from "@/lib/proposal";
import { resolveStorageKey } from "@/lib/soc";
import { createSocBuild } from "@/lib/soc-builds";
import type { CellReader } from "@/lib/soc-pdf-soc";

export const NO_PROPOSAL_TOR = "ต้องอัปโหลด TOR ของ Proposal ก่อนจึงจะสร้าง SOC ได้";

// A scanned TOR is refused with OCR_CONFIRM_REQUIRED until `ocrConfirmed`, as
// for a standalone build (the confirm is per build, not per Proposal TOR).
export async function startProposalBuild(
  proposalId: string,
  input: { title?: unknown; pageRanges: string; template: { id: string } | { file: { name: string; bytes: Uint8Array } } },
  options: { readPage?: CellReader; ocrConfirmed?: boolean } = {},
) {
  const { actor } = await authorizeProposal(proposalId);
  const tor = await prisma.proposalTor.findUnique({ where: { proposalId } });
  if (!tor) throw new Error(NO_PROPOSAL_TOR);
  const bytes = new Uint8Array(await readFile(resolveStorageKey(tor.storageKey)));
  return createSocBuild(actor, { ...input, tor: { name: tor.originalName.split("/").pop() ?? tor.originalName, bytes }, proposalId }, options);
}
