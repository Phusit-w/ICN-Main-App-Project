"use client";

// The review page of an Imported SOC Check (ticket 08, layout A from the
// ticket 07 prototype): a table of every row, problems first, and an
// inspector on the right for the selected row with its Final Decision. Each
// row is confirmed on its own; there is no bulk confirm.
import { useMemo, useRef, useState, useTransition } from "react";
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
  // A SOC without a Comply/Better tick box shows the recommendation only.
  const ticked = rows.some((row) => row.declaredSelection);
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
          <thead className="sticky top-0 bg-chip text-left text-xs text-label"><tr><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">ข้อ</th><th className="px-3 py-2">ข้อกำหนด TOR</th><th className="whitespace-nowrap px-3 py-2">{ticked ? "ติ๊ก → แนะนำ" : "แนะนำ"}</th><th className="px-3 py-2">Final Decision</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id} onClick={() => setSelectedId(row.id)} className={`cursor-pointer border-t border-line align-top transition-colors ${selected?.id === row.id ? "bg-hover" : "hover:bg-hover"}`}>
            <td className="px-3 py-2 text-base" title={SOC_ROW_STATUS_LABELS[row.status]}>{SOC_ROW_STATUS_ICONS[row.status]}</td>
            <td className="whitespace-nowrap px-3 py-2"><button type="button" onClick={() => setSelectedId(row.id)} className="ui-btn font-medium text-ink">{row.item}</button></td>
            <td className="px-3 py-2"><span className="line-clamp-2 text-xs leading-relaxed">{row.torText || <span className="text-muted">{row.keyIssue || row.detail}</span>}</span></td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{row.declaredSelection ? <>{socAxisValueLabel(row.declaredSelection)} → </> : null}<span className="font-medium">{socAxisValueLabel(row.systemRecommendation)}</span></td>
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
      {row.declaredSelection ? <>
        <span className="rounded-full bg-chip px-3 py-1">ผู้ยื่นติ๊ก: <span className="font-medium">{socAxisValueLabel(row.declaredSelection)}</span></span>
        <span className={same ? "text-muted" : "font-bold text-danger"} title={same ? "ตรงกัน" : "ไม่ตรงกัน"}>{same ? "=" : "≠"}</span>
      </> : null}
      <span className="rounded-full bg-chip px-3 py-1">ระบบแนะนำ: <span className="font-medium">{socAxisValueLabel(row.systemRecommendation)}</span></span>
    </div>
    <div className="rounded-input bg-ground p-3 text-sm"><div className="text-xs font-semibold text-label">สรุปจาก Claude · confidence {row.confidence || "—"}</div><p className="mt-1 leading-relaxed">{row.detail}</p>{row.keyIssue && row.keyIssue !== row.detail ? <p className="mt-1 text-xs text-muted">ประเด็นหลัก: {row.keyIssue}</p> : null}</div>
    <PdfEvidence jobId={jobId} row={row} />
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

// The cited pages of the evidence PDFs the reference names, rendered on the
// server with each PDF's own highlights (ticket 09), with buttons to page
// through a multi-page or multi-document citation. A page that can't be shown
// gets the server's Thai reason instead of a broken image.
function PdfEvidence({ jobId, row }: { jobId: string; row: SocReviewRow }) {
  const pages = row.citations.flatMap((citation) => (citation.document ? citation.pages.map((page) => ({ document: citation.document!, page })) : []));
  const unmatched = row.citations.filter((citation) => !citation.document);
  const unpaged = row.citations.filter((citation) => citation.document && !citation.pages.length);
  const severalDocuments = new Set(pages.map((p) => p.document.id)).size > 1;
  const [shownIndex, setShownIndex] = useState(0);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const explained = useRef(new Set<string>());
  const shown = pages[shownIndex];
  const src = shown ? `/api/soc/jobs/${jobId}/evidence/${shown.document.id}/pages/${shown.page}` : null;
  const highlight = row.axes.find((axis) => axis.key === "highlight_check");

  // Asks the server once per page why it failed; the image's error event
  // carries no status.
  async function explainFailure(url: string, failedUrl = url) {
    if (explained.current.has(url)) return;
    explained.current.add(url);
    let reason = "แสดงหน้านี้ไม่ได้ กรุณาลองใหม่";
    try {
      const body = await (await fetch(failedUrl)).json();
      if (typeof body?.error === "string") reason = body.error;
    } catch { /* keep the generic reason */ }
    setFailures((current) => ({ ...current, [url]: reason }));
  }

  const note = (text: string) => <p key={text} className="rounded-input bg-ground p-3 text-xs text-muted">{text}</p>;
  const documents = [...new Map(pages.map((p) => [p.document.id, p.document])).values()];
  return <div data-slot="pdf-evidence" className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 text-xs"><span className="font-semibold text-label">เอกสารอ้างอิง</span> <span className="whitespace-pre-wrap text-muted">{row.reference || "ไม่ได้ระบุ"}</span></div>
      <div className="flex flex-wrap gap-3">{documents.map((d) => <a key={d.id} href={`/api/soc/documents/${d.id}`} target="_blank" rel="noreferrer" className="text-xs text-label underline hover:text-ink">เปิด {d.name}</a>)}</div>
    </div>
    {pages.length > 1 ? <div className="flex flex-wrap gap-1.5" role="group" aria-label="หน้าที่อ้าง">
      {pages.map((p, i) => <button key={`${p.document.id}:${p.page}`} type="button" onClick={() => setShownIndex(i)} aria-pressed={i === shownIndex} className={`ui-btn rounded-full px-3 py-1 text-xs transition-colors ${i === shownIndex ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{severalDocuments ? `${p.document.name} ` : ""}หน้า {p.page}</button>)}
    </div> : null}
    {!row.citations.length ? note("แถวนี้ไม่ได้อ้างเอกสาร") : null}
    {unmatched.map((c) => note(`ไม่พบไฟล์ PDF ที่ตรงกับ "${c.cited || row.reference}" ในงานนี้ ตรวจชื่อไฟล์หลักฐานหรืออัปโหลดเพิ่ม`))}
    {unpaged.map((c) => note(`การอ้างอิง ${c.document!.name} ไม่ได้ระบุเลขหน้า`))}
    {!shown || !src ? null
      : failures[src] ? <p role="alert" className="rounded-input border border-danger-border bg-surface p-3 text-xs text-danger">{failures[src]}</p>
      : <div className="relative min-h-40 overflow-hidden rounded-input border border-line bg-white">
        {/* Under the image, so it shows only until the page has loaded. */}
        <p className="absolute inset-x-0 top-0 p-3 text-xs text-muted">กำลังโหลดหน้า {shown.page}…</p>
        {/* A server-rendered PNG behind an access check; next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt={`${shown.document.name} หน้า ${shown.page}`} className="relative block h-auto w-full bg-white" onError={(event) => explainFailure(src, event.currentTarget.src)}
          // An image that failed before hydration never fires onError.
          ref={(img) => { if (img?.complete && img.naturalWidth === 0) explainFailure(src); }} />
      </div>}
    {/* The skill reports no highlight positions, only what it found highlighted. */}
    {highlight?.detail && highlight.detail !== "—" ? <p className="text-xs leading-relaxed text-muted"><span className="font-semibold text-label">Highlight ({socAxisValueLabel(highlight.value ?? "not_applicable")}):</span> {highlight.detail}</p> : null}
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
