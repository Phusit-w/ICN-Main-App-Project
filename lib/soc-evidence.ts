// The evidence PDFs of a SOC job. An ordinary job holds its own EVIDENCE
// documents; a job made for a Proposal's SOC Version (proposal-build 06)
// holds none and uses the Proposal's live Datasheets, so a Datasheet added or
// removed on the Proposal is what the next check sees and no file is copied.
// `removed: true` also lists Datasheets taken off the Proposal, which the
// review page still opens when a result cites one.
import { prisma } from "@/lib/prisma";

export type EvidenceFile = { id: string; originalName: string; storageKey: string; sizeBytes: number; checksum: string; mimeType: string; removed: boolean };

export async function jobEvidenceFiles(jobId: string, { removed = false }: { removed?: boolean } = {}): Promise<EvidenceFile[]> {
  const job = await prisma.socJob.findUnique({ where: { id: jobId }, select: { proposalId: true } });
  if (job?.proposalId) {
    const datasheets = await prisma.proposalDatasheet.findMany({ where: { proposalId: job.proposalId, ...(removed ? {} : { removedAt: null }) }, orderBy: { originalName: "asc" } });
    return datasheets.map((d) => ({ id: d.id, originalName: d.originalName, storageKey: d.storageKey, sizeBytes: d.sizeBytes, checksum: d.checksum, mimeType: "application/pdf", removed: d.removedAt !== null }));
  }
  const documents = await prisma.socDocument.findMany({ where: { jobId, type: "EVIDENCE" }, orderBy: { createdAt: "asc" } });
  return documents.map((d) => ({ id: d.id, originalName: d.originalName, storageKey: d.storageKey, sizeBytes: d.sizeBytes, checksum: d.checksum, mimeType: d.mimeType, removed: false }));
}

export async function jobEvidenceFile(jobId: string, documentId: string, options: { removed?: boolean } = {}): Promise<EvidenceFile | null> {
  return (await jobEvidenceFiles(jobId, options)).find((file) => file.id === documentId) ?? null;
}
