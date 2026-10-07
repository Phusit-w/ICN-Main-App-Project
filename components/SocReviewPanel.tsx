"use client";

// The review page of an Imported SOC Check (ticket 08, layout A from the
// ticket 07 prototype): a table of every row, problems first, and an
// inspector on the right for the selected row with its Final Decision. Each
// row is confirmed on its own; there is no bulk confirm.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideSocRow } from "@/actions/soc";
import Button from "@/components/ui/Button";
import type { SocReviewRow } from "@/lib/soc-review-view";
import { filterReviewRows, SOC_FINAL_DECISIONS, SOC_FINAL_DECISION_LABELS, SOC_REVIEW_NOTE_MAX, SOC_ROW_STATUS_ICONS, SOC_ROW_STATUS_LABELS, socAxisValueLabel, type SocFinalDecision, type SocReviewFilter } from "@/lib/soc-review";

type ReviewItem = { id: string; label: string; state: string; missingDocuments: string[]; confirmed: boolean };
type StatusFilter = SocReviewFilter["status"];

const STATUS_FILTERS: StatusFilter[] = ["all", "fail", "review", "ok"];
const decisionLabel = (value: SocFinalDecision | null) => (value ? SOC_FINAL_DECISION_LABELS[value] : null);

export default function SocReviewPanel({ jobId, items, rows }: { jobId: string; items: ReviewItem[]; rows: SocReviewRow[] }) {
  const [filter, setFilter] = useState<SocReviewFilter>({ status: "all", majorItemId: "all" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = useMemo(() => filterReviewRows(rows, filter), [rows, filter]);
  const selected = visible.find((r) => r.id === selectedId) ?? visible[0];
  const label = new Map(items.map((m) => [m.id, m.label]));
  const counts = (status: StatusFilter) => filterReviewRows(rows, { ...filter, status }).length;
  const decided = rows.filter((r) => r.finalDecision).length;
  const banners = items.filter((m) => m.state === "checked" && m.missingDocuments.length && (filter.majorItemId === "all" || filter.majorItemId === m.id));
  const checkedItems = items.filter((m) => rows.some((r) => r.majorItemId === m.id));
  if (!rows.length && !banners.length) return null;

  return <section className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-lg font-semibold">ตรวจทานผล</h2><p className="mt-1 text-xs text-muted">ผลจาก Claude เป็นเพียงคำแนะนำ ผู้ตรวจต้องยืนยัน Final Decision ทีละข้อ</p></div>
      <span className="text-sm">ยืนยันแล้ว <span className="font-medium tabular-nums">{decided}/{rows.length}</span> ข้อ</span>
    </div>
    {banners.map((m) => <div key={m.id} role="alert" className="rounded-input border border-danger-border bg-surface p-3 text-xs text-danger"><span className="font-medium">ข้อ {m.label} ตรวจโดยไม่มีไฟล์ {m.missingDocuments.join(", ")}</span> แถวที่อ้างไฟล์เหล่านี้จึงยืนยันไม่ได้ อัปโหลดไฟล์แล้วกดตรวจซ้ำได้</div>)}
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {STATUS_FILTERS.map((status) => <button key={status} type="button" onClick={() => setFilter({ ...filter, status })} className={`ui-btn rounded-full px-3 py-1.5 text-xs transition-colors ${filter.status === status ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{status === "all" ? "ทั้งหมด" : `${SOC_ROW_STATUS_ICONS[status]} ${SOC_ROW_STATUS_LABELS[status]}`} ({counts(status)})</button>)}
      <select aria-label="ข้อใหญ่" value={filter.majorItemId} onChange={(e) => setFilter({ ...filter, majorItemId: e.target.value })} className="h-8 rounded-input border border-line bg-surface px-2 text-xs">
        <option value="all">ทุกข้อใหญ่</option>
        {checkedItems.map((m) => <option key={m.id} value={m.id}>ข้อใหญ่ {m.label}{m.confirmed ? " · ยืนยันแล้ว" : ""}</option>)}
      </select>
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="overflow-hidden rounded-card bg-surface shadow-card"><div className="max-h-[calc(100vh-160px)] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-chip text-left text-xs text-label"><tr><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">ข้อ</th><th className="px-3 py-2">ข้อกำหนด TOR</th><th className="whitespace-nowrap px-3 py-2">ติ๊ก → แนะนำ</th><th className="px-3 py-2">Final Decision</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id} onClick={() => setSelectedId(row.id)} className={`cursor-pointer border-t border-line align-top transition-colors ${selected?.id === row.id ? "bg-hover" : "hover:bg-hover"}`}>
            <td className="px-3 py-2 text-base" title={SOC_ROW_STATUS_LABELS[row.status]}>{SOC_ROW_STATUS_ICONS[row.status]}</td>
            <td className="whitespace-nowrap px-3 py-2"><button type="button" onClick={() => setSelectedId(row.id)} className="ui-btn font-medium text-ink">{row.item}</button></td>
            <td className="px-3 py-2"><span className="line-clamp-2 text-xs leading-relaxed">{row.torText || <span className="text-muted">{row.keyIssue || row.detail}</span>}</span></td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{socAxisValueLabel(row.declaredSelection)} → <span className="font-medium">{socAxisValueLabel(row.systemRecommendation)}</span></td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{row.finalDecision ? <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">✔ {decisionLabel(row.finalDecision)}</span> : <span className="text-muted">—</span>}</td>
          </tr>)}</tbody>
        </table>
        {visible.length ? null : <p className="p-8 text-center text-sm text-muted">ไม่พบรายการในตัวกรองนี้</p>}
      </div></div>
      {selected ? <RowInspector key={selected.id} jobId={jobId} row={selected} majorItemLabel={selected.majorItemId ? label.get(selected.majorItemId) ?? null : null} /> : null}
    </div>
  </section>;
}

function RowInspector({ jobId, row, majorItemLabel }: { jobId: string; row: SocReviewRow; majorItemLabel: string | null }) {
  const same = row.declaredSelection === row.systemRecommendation;
  return <div className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:self-start lg:overflow-y-auto">
    <div className="flex flex-wrap items-baseline gap-2"><h3 className="font-display text-lg font-bold">{SOC_ROW_STATUS_ICONS[row.status]} ข้อ {row.item}</h3><span className="text-sm text-muted">{SOC_ROW_STATUS_LABELS[row.status]}{majorItemLabel ? ` · ข้อใหญ่ ${majorItemLabel}` : ""} · แถว {row.rowNumber}</span></div>
    {row.reasons.length ? <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div><div className="text-xs font-semibold text-label">ข้อกำหนด TOR</div><p className="mt-1 whitespace-pre-wrap leading-relaxed">{row.torText || <span className="text-muted">ไม่พบข้อความในไฟล์ SOC</span>}</p></div>
      <div><div className="text-xs font-semibold text-label">ข้อเสนอของผู้ยื่น</div><p className="mt-1 whitespace-pre-wrap leading-relaxed">{row.proposalText || <span className="text-muted">—</span>}</p></div>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-full bg-chip px-3 py-1">ผู้ยื่นติ๊ก: <span className="font-medium">{socAxisValueLabel(row.declaredSelection)}</span></span>
      <span className={same ? "text-muted" : "font-bold text-danger"} title={same ? "ตรงกัน" : "ไม่ตรงกัน"}>{same ? "=" : "≠"}</span>
      <span className="rounded-full bg-chip px-3 py-1">ระบบแนะนำ: <span className="font-medium">{socAxisValueLabel(row.systemRecommendation)}</span></span>
    </div>
    <div className="rounded-input bg-ground p-3 text-sm"><div className="text-xs font-semibold text-label">สรุปจาก Claude · confidence {row.confidence || "—"}</div><p className="mt-1 leading-relaxed">{row.detail}</p>{row.keyIssue && row.keyIssue !== row.detail ? <p className="mt-1 text-xs text-muted">ประเด็นหลัก: {row.keyIssue}</p> : null}</div>
    {/* Ticket 09 puts the rendered cited page, with its highlights, here. */}
    <div data-slot="pdf-evidence" className="rounded-input border border-dashed border-line p-3 text-xs text-muted">เอกสารอ้างอิง: {row.reference || "ไม่ได้ระบุ"}{row.referencePages.length ? ` · หน้า ${row.referencePages.join(", ")}` : ""}</div>
    <details className="rounded-input border border-line p-3"><summary className="cursor-pointer text-sm font-medium">รายละเอียดทุกแกน ({row.axes.length})</summary>
      <table className="mt-2 w-full border-collapse text-sm"><tbody>{row.axes.map((axis) => <tr key={axis.key} className="border-t border-line align-top">
        <td className="w-40 py-1.5 pr-2 text-label">{axis.label}</td>
        <td className={`w-28 py-1.5 pr-2 font-medium ${axis.ok ? "" : "text-amber-700 dark:text-amber-400"}`}>{axis.ok ? "" : "• "}{socAxisValueLabel(axis.value ?? "not_applicable")}</td>
        <td className="py-1.5 text-xs text-muted">{axis.detail}</td>
      </tr>)}</tbody></table>
    </details>
    <DecisionForm jobId={jobId} row={row} />
  </div>;
}

function DecisionForm({ jobId, row }: { jobId: string; row: SocReviewRow }) {
  const router = useRouter();
  const [decision, setDecision] = useState<string>(row.finalDecision ?? "");
  const [note, setNote] = useState(row.finalNote ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const unchanged = decision === (row.finalDecision ?? "") && note.trim() === (row.finalNote ?? "");
  function save() {
    setError("");
    startTransition(async () => {
      try {
        await decideSocRow({ jobId, resultId: row.id, decision, note });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }
  return <div className="flex flex-col gap-2 border-t border-line pt-4">
    <div className="text-xs font-semibold text-label">Final Decision ของผู้ตรวจ</div>
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Final Decision">{SOC_FINAL_DECISIONS.map((value) => <button key={value} type="button" role="radio" aria-checked={decision === value} onClick={() => setDecision(value)} className={`ui-btn rounded-input border px-3 py-1.5 text-sm transition-colors ${decision === value ? "border-ink bg-accent text-black" : "border-line bg-surface hover:bg-hover"}`}>{SOC_FINAL_DECISION_LABELS[value]}</button>)}</div>
    <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={SOC_REVIEW_NOTE_MAX} rows={2} placeholder="หมายเหตุของผู้ตรวจ (ไม่บังคับ)" className="rounded-input border border-line bg-surface p-2 text-sm leading-relaxed" />
    <div className="flex flex-wrap items-center justify-end gap-3">
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : row.finalDecision ? <span className="text-xs text-muted">ยืนยันแล้ว: {decisionLabel(row.finalDecision)}{row.reviewedByName ? ` โดย ${row.reviewedByName}` : ""}</span> : null}
      <Button size="sm" disabled={pending || !decision || unchanged} onClick={save}>{pending ? "กำลังบันทึก…" : row.finalDecision ? "บันทึกการแก้ไข" : "ยืนยันข้อนี้"}</Button>
    </div>
  </div>;
}
