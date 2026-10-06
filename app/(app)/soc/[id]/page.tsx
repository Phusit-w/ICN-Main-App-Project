import { notFound } from "next/navigation";
import SocJobDetail from "@/components/SocJobDetail";
import { prisma } from "@/lib/prisma";
import { authorizeSocJob } from "@/lib/soc";

export const dynamic = "force-dynamic";

export default async function SocJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor;
  try { ({ actor } = await authorizeSocJob(id)); } catch { notFound(); }
  const job = await prisma.socJob.findUnique({ where: { id }, include: { owner: { select: { displayName: true } }, documents: { orderBy: { createdAt: "asc" } }, results: { orderBy: { rowNumber: "asc" } }, majorItems: { orderBy: { position: "asc" }, include: { ranBy: { select: { displayName: true } }, checkRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { documentId: true } } } } } });
  if (!job) notFound();
  return <SocJobDetail job={{ id: job.id, kind: job.kind, title: job.title, status: job.status, stage: job.stage, progress: job.progress, errorMessage: job.errorMessage, ownerName: job.owner.displayName, canTrash: job.ownerId === actor.id || actor.role === "ADMIN", documents: job.documents.map((d) => ({ id: d.id, type: d.type, name: d.originalName })), majorItems: job.majorItems.map((m) => ({ id: m.id, label: m.label, title: m.title, state: m.state, skillVersion: m.skillVersion, model: m.model, runSource: m.runSource, ranByName: m.ranBy?.displayName ?? null, socCheckDocumentId: m.checkRuns[0]?.documentId ?? null })), importedRows: job.kind === "IMPORTED" ? job.results.map((r) => ({ id: r.id, majorItemId: r.majorItemId, item: r.item, reference: r.referenceText, referenceCheck: r.aiReferenceCheck, highlightCheck: r.highlightCheck, evidenceSupport: r.evidenceSupport, torDecision: r.torDecision, declaredStatusCheck: r.declaredStatusCheck, keyIssue: r.keyIssue || r.aiDetail })) : [], results: job.kind === "IMPORTED" ? [] : job.results.map((r) => ({ id: r.id, rowNumber: r.rowNumber, item: r.item, rowType: r.rowType, socText: r.socText, referenceText: r.referenceText, referencePages: Array.isArray(r.referencePages) ? r.referencePages.filter((v): v is number => typeof v === "number") : [], evidenceDocumentId: r.evidenceDocumentId, aiReferenceCheck: r.aiReferenceCheck, aiHeadingTitleCheck: r.aiHeadingTitleCheck, aiDetail: r.aiDetail, aiConfidence: r.aiConfidence, finalReferenceCheck: r.finalReferenceCheck, finalHeadingTitleCheck: r.finalHeadingTitleCheck, finalDetail: r.finalDetail, reviewed: Boolean(r.reviewedAt) })) }} />;
}
