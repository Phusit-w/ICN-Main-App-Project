// What the review page of an Imported SOC Check reads (ticket 08): every row
// that needs a decision with its derived overall status, problems first, and
// the major items whose rows all have a Final Decision. A row counts as
// decided by reviewedAt, the same test a re-check uses. Server-only.
import { prisma } from "@/lib/prisma";
import { isAxisOk, isSocFinalDecision, citedEvidence, majorItemConfirmed, overallRowStatus, SOC_REVIEW_AXES, sortReviewRows, type EvidenceCitation, type SocAxisKey, type SocAxisValues, type SocFinalDecision, type SocRowStatus } from "@/lib/soc-review";

// Each axis with the field the skill uses to explain it.
const AXIS_DETAIL: Partial<Record<SocAxisKey, (row: StoredRow) => string | null>> = {
  reference_check: (r) => r.referenceDetail,
  highlight_check: (r) => r.highlightEvidence,
  evidence_support: (r) => r.evidenceDetail,
  tor_decision: (r) => [r.torDecisionBasis, r.verifiedValue && `ค่าที่พบ: ${r.verifiedValue}`, r.torThreshold && `เกณฑ์ TOR: ${r.torThreshold}`].filter((v) => v && v !== "—").join(" · ") || null,
};

type StoredRow = NonNullable<Awaited<ReturnType<typeof prisma.socCheckResult.findFirst>>>;

export type SocReviewRow = {
  id: string; rowNumber: number; item: string; majorItemId: string | null;
  status: Exclude<SocRowStatus, "heading">; reasons: string[];
  torText: string; proposalText: string | null; reference: string; referencePages: number[];
  // Each document the reference cites, with its pages and the evidence PDF it names (null when none fits).
  citations: EvidenceCitation[];
  declaredSelection: string | null; // declared_status: Comply/Better as ticked in the SOC
  systemRecommendation: string | null; // tor_decision
  axes: { key: SocAxisKey; label: string; value: string | null; ok: boolean; detail: string | null }[];
  detail: string; keyIssue: string | null; confidence: string;
  finalDecision: SocFinalDecision | null; finalNote: string | null; reviewedByName: string | null; reviewedAt: string | null;
};

const axisValues = (r: StoredRow): SocAxisValues => ({
  reference_check: r.aiReferenceCheck, item_label_check: r.itemLabelCheck, highlight_check: r.highlightCheck,
  heading_title_check: r.aiHeadingTitleCheck, product_identity: r.aiProductIdentity, content_relevance: r.aiContentRelevance,
  evidence_support: r.evidenceSupport, tor_decision: r.torDecision, declared_status_check: r.declaredStatusCheck,
});

export async function socReviewView(jobId: string): Promise<{ rows: SocReviewRow[]; confirmedItemIds: string[] }> {
  const stored = await prisma.socCheckResult.findMany({ where: { jobId, majorItemId: { not: null } }, orderBy: { rowNumber: "asc" } });
  const reviewerIds = [...new Set(stored.map((r) => r.reviewedById).filter((id): id is string => id !== null))];
  const evidenceDocuments = (await prisma.socDocument.findMany({ where: { jobId, type: "EVIDENCE" }, orderBy: { createdAt: "asc" }, select: { id: true, originalName: true } })).map((d) => ({ id: d.id, name: d.originalName }));
  const reviewers = new Map((await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));

  const rows: SocReviewRow[] = [];
  for (const r of stored) {
    const axes = axisValues(r);
    const { status, reasons } = overallRowStatus(r.rowType, axes);
    if (status === "heading") continue;
    rows.push({
      id: r.id, rowNumber: r.rowNumber, item: r.item, majorItemId: r.majorItemId, status, reasons,
      torText: r.socText, proposalText: r.proposalText, reference: r.referenceText,
      referencePages: Array.isArray(r.referencePages) ? r.referencePages.filter((p): p is number => typeof p === "number") : [],
      citations: citedEvidence(r.referenceText, evidenceDocuments),
      declaredSelection: r.declaredStatus, systemRecommendation: r.torDecision,
      axes: SOC_REVIEW_AXES.map((axis) => ({ key: axis.key, label: axis.label, value: axes[axis.key] || null, ok: isAxisOk(axes, axis), detail: AXIS_DETAIL[axis.key]?.(r) ?? null })),
      detail: r.aiDetail, keyIssue: r.keyIssue, confidence: r.aiConfidence,
      finalDecision: r.finalDecision && isSocFinalDecision(r.finalDecision) ? r.finalDecision : null, finalNote: r.finalNote,
      reviewedByName: r.reviewedById ? reviewers.get(r.reviewedById) ?? null : null,
      reviewedAt: r.finalDecision && r.reviewedAt ? r.reviewedAt.toISOString() : null,
    });
  }

  const byItem = new Map<string, { rowType: string; decided: boolean }[]>();
  for (const r of stored) byItem.set(r.majorItemId!, [...(byItem.get(r.majorItemId!) ?? []), { rowType: r.rowType, decided: r.reviewedAt !== null }]);
  const confirmedItemIds = [...byItem].filter(([, items]) => majorItemConfirmed(items)).map(([id]) => id);
  return { rows: sortReviewRows(rows), confirmedItemIds };
}
