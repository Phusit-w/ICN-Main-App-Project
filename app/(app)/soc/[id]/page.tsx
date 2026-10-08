import { notFound } from "next/navigation";
import SocJobDetail from "@/components/SocJobDetail";
import { prisma } from "@/lib/prisma";
import { authorizeSocJob, skillVersionStatus } from "@/lib/soc";
import { socSkillVersions } from "@/lib/soc-skill-package";
import { majorItemRequestViews, releaseStaleCheckRequests } from "@/lib/soc-check-requests";
import { socReviewView } from "@/lib/soc-review-view";
import { isLargeUnsplitMajorItem } from "@/lib/soc-shared";

export const dynamic = "force-dynamic";

export default async function SocJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor;
  try { ({ actor } = await authorizeSocJob(id)); } catch { notFound(); }
  // A running Check Request whose runner went quiet shows as waiting again.
  await releaseStaleCheckRequests();
  const job = await prisma.socJob.findUnique({ where: { id }, include: { owner: { select: { displayName: true } }, documents: { orderBy: { createdAt: "asc" } }, results: { orderBy: { rowNumber: "asc" } }, majorItems: { orderBy: { position: "asc" }, include: { ranBy: { select: { displayName: true } }, checkRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } } } } });
  if (!job) notFound();
  const imported = job.kind === "IMPORTED";
  const skills = imported ? await socSkillVersions() : { packages: [], currentVersion: null };
  const requests = imported ? await majorItemRequestViews(id) : null;
  const review = imported ? await socReviewView(id) : { rows: [], confirmedItemIds: [] };
  const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  return <SocJobDetail job={{ id: job.id, kind: job.kind, title: job.title, status: job.status, stage: job.stage, progress: job.progress, errorMessage: job.errorMessage, ownerName: job.owner.displayName, canTrash: job.ownerId === actor.id || actor.role === "ADMIN", viewerId: actor.id, viewerIsAdmin: actor.role === "ADMIN", currentSkillVersion: skills.currentVersion, documents: job.documents.map((d) => ({ id: d.id, type: d.type, name: d.originalName })), majorItems: job.majorItems.map((m) => ({ id: m.id, label: m.label, title: m.title, groupLabel: m.groupLabel, groupTitle: m.groupTitle, large: isLargeUnsplitMajorItem(m), skipped: m.skipped, state: m.state, skillVersion: m.skillVersion, skillVersionStatus: m.state === "not_checked" ? null : skillVersionStatus(m.skillVersion, skills.packages, skills.currentVersion), model: m.model, runSource: m.runSource, ranByName: m.ranBy?.displayName ?? null, hasResults: m.checkRuns.length > 0, missingDocuments: stringList(m.missingDocuments), confirmed: m.state === "checked" && review.confirmedItemIds.includes(m.id), request: requests?.get(m.id)?.request ?? null, failureReason: requests?.get(m.id)?.failureReason ?? null })), reviewRows: review.rows, results: job.kind === "IMPORTED" ? [] : job.results.map((r) => ({ id: r.id, rowNumber: r.rowNumber, item: r.item, rowType: r.rowType, socText: r.socText, referenceText: r.referenceText, referencePages: Array.isArray(r.referencePages) ? r.referencePages.filter((v): v is number => typeof v === "number") : [], evidenceDocumentId: r.evidenceDocumentId, aiReferenceCheck: r.aiReferenceCheck, aiHeadingTitleCheck: r.aiHeadingTitleCheck, aiDetail: r.aiDetail, aiConfidence: r.aiConfidence, finalReferenceCheck: r.finalReferenceCheck, finalHeadingTitleCheck: r.finalHeadingTitleCheck, finalDetail: r.finalDetail, reviewed: Boolean(r.reviewedAt) })) }} />;
}
