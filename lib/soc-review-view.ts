// What the review page of an Imported SOC Check reads (ticket 08): every row
// that needs a decision with its derived overall status, problems first, and
// the major items whose rows all have a Final Decision. A row counts as
// decided by reviewedAt with a settled decision (not รอแก้ไข), the same test
// a re-check uses. Server-only.
import { prisma } from "@/lib/prisma";
import { jobSocDocument, readJobSoc } from "@/lib/soc-import";
import { isExcelSoc, isSocImageKind, MIXED_IMAGE_NOTE, SOC_IMAGE_KIND_LABELS, type SocImageKind } from "@/lib/soc-shared";
import type { SocRowText } from "@/lib/soc-table";
import { evidenceMissing, isAxisOk, isSocFinalDecision, PENDING_FIX, citedEvidence, declaredSelection, majorItemConfirmed, overallRowStatus, SOC_REVIEW_AXES, sortReviewRows, type EvidenceCitation, type SocAxisKey, type SocAxisValues, type SocFinalDecision, type SocRowStatus } from "@/lib/soc-review";

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
  sheet: string | null; // the row's sheet, when the SOC is an Excel workbook with more than one
  status: Exclude<SocRowStatus, "heading">; reasons: string[];
  evidenceMissing: boolean; // Claude couldn't find or read the cited page or document
  torText: string; proposalText: string | null; reference: string; referencePages: number[];
  torImage: boolean; // an Image Row: the TOR cell of the SOC is an image, shown in place of the text
  // What Claude made of an Image Row's image: its kind and label, the Image
  // Reading (read-only), what it was unsure of, and for a mixed image the note
  // that the drawing wasn't compared. Null for other rows and runs before Image Rows.
  image: SocReviewImage | null;
  referenceNote: string | null; // the row took its numbered row's reference ("ใช้อ้างอิงของข้อ X")
  // Each document the reference cites, with its pages and the evidence PDF it names (null when none fits).
  citations: EvidenceCitation[];
  declaredSelection: string | null; // declared_status: Comply/Better as ticked in the SOC; null when it has no tick box
  systemRecommendation: string | null; // tor_decision
  axes: { key: SocAxisKey; label: string; value: string | null; ok: boolean; detail: string | null }[];
  detail: string; keyIssue: string | null; confidence: string;
  finalDecision: SocFinalDecision | null; finalNote: string | null; reviewedByName: string | null; reviewedAt: string | null;
};

export type SocReviewImage = { kind: SocImageKind; label: string; reading: string | null; unsure: string | null; note: string | null };

const reviewImage = (r: StoredRow): SocReviewImage | null => (isSocImageKind(r.imageKind)
  ? { kind: r.imageKind, label: SOC_IMAGE_KIND_LABELS[r.imageKind], reading: r.imageReading, unsure: r.imageUnsure, note: r.imageKind === "mixed_image" ? MIXED_IMAGE_NOTE : null }
  : null);

const axisValues = (r: StoredRow): SocAxisValues => ({
  reference_check: r.aiReferenceCheck, item_label_check: r.itemLabelCheck, highlight_check: r.highlightCheck,
  heading_title_check: r.aiHeadingTitleCheck, product_identity: r.aiProductIdentity, content_relevance: r.aiContentRelevance,
  evidence_support: r.evidenceSupport, tor_decision: r.torDecision, declared_status_check: r.declaredStatusCheck,
});

// The evidence file the skill checked the row against (results.json `reference_file`).
const referenceFile = (raw: unknown): string | null => {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).reference_file : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function socReviewView(jobId: string): Promise<{ rows: SocReviewRow[]; confirmedItemIds: string[] }> {
  const stored = await prisma.socCheckResult.findMany({ where: { jobId, majorItemId: { not: null } }, orderBy: { rowNumber: "asc" } });
  const reviewerIds = [...new Set(stored.map((r) => r.reviewedById).filter((id): id is string => id !== null))];
  const evidenceDocuments = (await prisma.socDocument.findMany({ where: { jobId, type: "EVIDENCE" }, orderBy: { createdAt: "asc" }, select: { id: true, originalName: true } })).map((d) => ({ id: d.id, name: d.originalName }));
  const reviewers = new Map((await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  // Rows imported before the SOC lookup knew relative numbering ("๗.๑)" for ๕.๘.๗.๑) have no
  // TOR text stored; read it from the SOC now rather than show "ไม่พบข้อความในไฟล์ SOC".
  // An Excel SOC is read for its rows' sheets too.
  const socDocument = await jobSocDocument(jobId);
  const soc = stored.some((r) => !r.socText) || isExcelSoc(socDocument) ? await readJobSoc(socDocument) : null;

  const rows: SocReviewRow[] = [];
  for (const r of stored) {
    const axes = axisValues(r);
    const { status, reasons } = overallRowStatus(r.rowType, axes, r.imageKind);
    if (status === "heading") continue;
    // An Image Row has no TOR text stored either, so it is found by the same read.
    const text: SocRowText = r.socText ? { tor: r.socText, proposal: r.proposalText } : soc?.rowText(r.rowNumber, r.item) ?? { tor: "", proposal: r.proposalText };
    rows.push({
      id: r.id, rowNumber: r.rowNumber, item: r.item, majorItemId: r.majorItemId, sheet: soc?.sheetOfRow(r.rowNumber) ?? null, status, reasons, evidenceMissing: evidenceMissing(axes),
      torText: text.tor, proposalText: text.proposal, torImage: !!text.image, image: reviewImage(r), referenceNote: r.referenceNote, reference: r.referenceText,
      referencePages: Array.isArray(r.referencePages) ? r.referencePages.filter((p): p is number => typeof p === "number") : [],
      citations: citedEvidence(r.referenceText, evidenceDocuments, referenceFile(r.rawResult)),
      declaredSelection: declaredSelection(r.declaredStatus, r.declaredStatusCheck), systemRecommendation: r.torDecision,
      axes: SOC_REVIEW_AXES.map((axis) => ({ key: axis.key, label: axis.label, value: axes[axis.key] || null, ok: isAxisOk(axes, axis), detail: AXIS_DETAIL[axis.key]?.(r) ?? null })),
      detail: r.aiDetail, keyIssue: r.keyIssue, confidence: r.aiConfidence,
      finalDecision: r.finalDecision && isSocFinalDecision(r.finalDecision) ? r.finalDecision : null, finalNote: r.finalNote,
      reviewedByName: r.reviewedById ? reviewers.get(r.reviewedById) ?? null : null,
      reviewedAt: r.finalDecision && r.reviewedAt ? r.reviewedAt.toISOString() : null,
    });
  }

  const byItem = new Map<string, { rowType: string; decided: boolean }[]>();
  for (const r of stored) byItem.set(r.majorItemId!, [...(byItem.get(r.majorItemId!) ?? []), { rowType: r.rowType, decided: r.reviewedAt !== null && r.finalDecision !== PENDING_FIX }]);
  const confirmedItemIds = [...byItem].filter(([, items]) => majorItemConfirmed(items)).map(([id]) => id);
  return { rows: sortReviewRows(rows), confirmedItemIds };
}
