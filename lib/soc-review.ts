// The review page of an Imported SOC Check (ticket 08): each row's overall
// status (✅/⚠️/❌), derived when read and never stored, so the rule can change
// without a migration. The rule was agreed in ticket 07. Client-safe.
import { SOC_AXIS_VALUE_LABELS, toArabicDigits } from "@/lib/soc-shared";

// A row's axis values as results.json names them. A missing or blank axis
// counts as not_applicable.
export type SocAxisKey =
  | "reference_check" | "item_label_check" | "highlight_check" | "heading_title_check" | "product_identity"
  | "content_relevance" | "evidence_support" | "tor_decision" | "declared_status_check";
export type SocAxisValues = Partial<Record<SocAxisKey, string | null>>;

// The axes in reading order, with their Thai labels and the values that are OK.
export const SOC_REVIEW_AXES: readonly { key: SocAxisKey; label: string; ok: readonly string[] }[] = [
  { key: "reference_check", label: "เลขหน้าที่อ้างอิง", ok: ["match", "not_applicable"] },
  { key: "item_label_check", label: "เลขข้อกำกับในเอกสาร", ok: ["match", "not_applicable"] },
  // partial_visible (evidence plainly visible on the cited page, some words
  // not highlighted) passes: the skill keeps such a row ✅.
  { key: "highlight_check", label: "การเน้นสี (Highlight)", ok: ["complete", "partial_visible", "not_applicable"] },
  { key: "heading_title_check", label: "ชื่อหัวข้อ", ok: ["match", "not_applicable"] },
  { key: "product_identity", label: "ยี่ห้อ / รุ่น", ok: ["match", "not_applicable"] },
  { key: "content_relevance", label: "เนื้อหาตรงเรื่อง", ok: ["related", "not_applicable"] },
  { key: "evidence_support", label: "หลักฐานรองรับ TOR", ok: ["fully_supported", "not_applicable"] },
  { key: "tor_decision", label: "ผลเทียบเกณฑ์ TOR", ok: ["compliant", "better", "not_applicable"] },
  { key: "declared_status_check", label: "ช่องที่ผู้ยื่นติ๊ก ตรงกับผล", ok: ["match", "not_applicable"] },
];

export type SocRowStatus = "fail" | "review" | "ok" | "heading";
export const SOC_ROW_STATUS_ICONS: Record<SocRowStatus, string> = { fail: "❌", review: "⚠️", ok: "✅", heading: "" };
export const SOC_ROW_STATUS_LABELS: Record<SocRowStatus, string> = { fail: "ไม่ผ่าน", review: "ต้องตรวจ", ok: "ผ่าน", heading: "หัวข้อ" };
const RANK: Record<SocRowStatus, number> = { fail: 0, review: 1, ok: 2, heading: 3 };

export const socAxisValueLabel = (value: string | null | undefined) => (value ? SOC_AXIS_VALUE_LABELS[value] ?? value : "—");
const axisValue = (axes: SocAxisValues, key: SocAxisKey) => axes[key] || "not_applicable";
export const isAxisOk = (axes: SocAxisValues, axis: (typeof SOC_REVIEW_AXES)[number]) => axis.ok.includes(axisValue(axes, axis.key));

export const isHeadingRow = (rowType: string) => rowType.endsWith("heading_row");

// Heading rows (`*_heading_row`) get no status.
//   ❌ fail:   tor_decision = non_compliant, evidence_support = not_supported or
//              wording_conflict, or product_identity = mismatch
//   ⚠️ review: otherwise, any axis outside its OK set
//   ✅ ok:     every axis OK
// The reasons are the axes outside their OK set.
export function overallRowStatus(rowType: string, axes: SocAxisValues): { status: SocRowStatus; reasons: string[] } {
  if (isHeadingRow(rowType)) return { status: "heading", reasons: [] };
  const reasons = SOC_REVIEW_AXES.filter((axis) => !isAxisOk(axes, axis)).map((axis) => `${axis.label}: ${socAxisValueLabel(axes[axis.key])}`);
  const fail = axes.tor_decision === "non_compliant"
    || axes.evidence_support === "not_supported" || axes.evidence_support === "wording_conflict"
    || axes.product_identity === "mismatch";
  return { status: fail ? "fail" : reasons.length ? "review" : "ok", reasons };
}

// ❌, then ⚠️, then ✅, then by row number.
export function sortReviewRows<T extends { status: SocRowStatus; rowNumber: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => RANK[a.status] - RANK[b.status] || a.rowNumber - b.rowNumber);
}

// Heading rows have nothing to decide, so they're never listed.
export type SocReviewFilter = { status: Exclude<SocRowStatus, "heading"> | "all"; majorItemId: string | "all" };
export function filterReviewRows<T extends { status: SocRowStatus; majorItemId: string | null }>(rows: readonly T[], filter: SocReviewFilter): T[] {
  return rows.filter((row) => row.status !== "heading" && (filter.status === "all" || row.status === filter.status) && (filter.majorItemId === "all" || row.majorItemId === filter.majorItemId));
}

// The Final Decision a reviewer sets per row, stored apart from the System
// Recommendation (tor_decision).
export const SOC_FINAL_DECISIONS = ["compliant", "better", "non_compliant"] as const;
export type SocFinalDecision = (typeof SOC_FINAL_DECISIONS)[number];
export const SOC_FINAL_DECISION_LABELS: Record<SocFinalDecision, string> = { compliant: "ผ่าน (Comply)", better: "ดีกว่า (Better)", non_compliant: "ไม่ผ่าน" };
export const isSocFinalDecision = (value: string): value is SocFinalDecision => (SOC_FINAL_DECISIONS as readonly string[]).includes(value);
export const SOC_REVIEW_NOTE_MAX = 2000;

// A major item shows `confirmed` once every row that needs a decision (every
// row but headings) has a Final Decision.
export function majorItemConfirmed(rows: readonly { rowType: string; decided: boolean }[]): boolean {
  const decidable = rows.filter((row) => !isHeadingRow(row.rowType));
  return decidable.length > 0 && decidable.every((row) => row.decided);
}

const MAX_PAGE = 5000;
const MAX_RANGE = 50;

// The page numbers cited in a row's reference: the numbers after "page(s)",
// "p." or "หน้า", e.g. "Datasheet Demo, pages 4, 5" → [4, 5]. "3-5" is a range.
export function parseReferencePages(reference: string): number[] {
  const pages: number[] = [];
  const marker = /(?:pages?|pp?\.|หน้า(?:ที่)?)\s*((?:\d+(?:\s*[-–]\s*\d+)?(?:\s*(?:,|และ|and|&)\s*)?)+)/gi;
  for (const [, list] of toArabicDigits(reference).matchAll(marker)) {
    for (const [, from, to] of list.matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
      const start = Number(from);
      const end = to ? Number(to) : start;
      if (start < 1 || end > MAX_PAGE || end < start || end - start > MAX_RANGE) continue;
      for (let page = start; page <= end; page++) if (!pages.includes(page)) pages.push(page);
    }
  }
  return pages;
}

// "page 4", "pages 4, 5", "p.4", "pp. 4-5" or "หน้า ๔": a page marker only
// counts when a number follows, so a file named "Landing page brochure" isn't cut.
const PAGE_MARKER = /(?:\bpages?|\bpp?\.|หน้า(?:ที่)?)\s*[0-9๐-๙]/i;
const normalizeDocumentName = (name: string) => toArabicDigits(name).toLowerCase().replace(/\.pdf$/i, "").replace(/[\s_\-–.,]+/g, " ").trim();

export type EvidenceDocument = { id: string; name: string };
export type EvidenceCitation = { cited: string; document: EvidenceDocument | null; pages: number[] };

// The evidence PDF one cited name refers to, e.g. "Datasheet Demo" →
// "Datasheet_Demo.pdf", compared without case, extension or separators. An
// exact match wins; otherwise the file name may add to the cited name (e.g.
// "… v2"), never the other way round. null when none or several fit, so the
// page never shows a guessed document.
function matchEvidenceDocument(cited: string, documents: readonly EvidenceDocument[]): EvidenceDocument | null {
  const wanted = normalizeDocumentName(cited);
  if (!wanted) return null;
  const candidates = documents.map((document) => ({ document, name: normalizeDocumentName(document.name) }));
  const exact = candidates.filter((c) => c.name === wanted);
  const found = exact.length ? exact : candidates.filter((c) => ` ${c.name} `.includes(` ${wanted} `));
  return found.length === 1 ? found[0].document : null;
}

// What a row's reference cites, one entry per document: "Datasheet Demo,
// pages 4, 5; Brochure p.2" → Datasheet Demo [4, 5] and Brochure [2], each
// with the job's evidence PDF it names. Parts are split at ";" or a line
// break; a part with pages but no name continues the previous document.
export function citedEvidence(reference: string, documents: readonly EvidenceDocument[]): EvidenceCitation[] {
  const citations: EvidenceCitation[] = [];
  for (const part of reference.split(/[;\n]/)) {
    const pages = parseReferencePages(part);
    const cited = part.split(PAGE_MARKER)[0].replace(/[\s,:–-]+$/, "").trim();
    const previous = citations.at(-1);
    if (!cited && previous) {
      previous.pages.push(...pages.filter((p) => !previous.pages.includes(p)));
      continue;
    }
    if (!cited && !pages.length) continue;
    citations.push({ cited, document: matchEvidenceDocument(cited, documents), pages });
  }
  return citations;
}
