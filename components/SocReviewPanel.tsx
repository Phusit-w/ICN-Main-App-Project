"use client";

// The review page of an Imported SOC Check (ticket 08, layout A from the
// ticket 07 prototype): a table of every row, problems first, and an
// inspector on the right for the selected row with its Final Decision. Each
// row is confirmed on its own; there is no bulk confirm. Rows can be picked
// to send to Claude again or to download as Excel.
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideSocRow } from "@/actions/soc";
import Button from "@/components/ui/Button";
import type { SocReviewRow } from "@/lib/soc-review-view";
import { requestSocRowRechecks } from "@/actions/socCheckRequests";
import { filterReviewRows, isSettledDecision, nextRowToReview, PENDING_FIX, SOC_FINAL_DECISIONS, SOC_FINAL_DECISION_LABELS, SOC_REVIEW_NOTE_MAX, SOC_ROW_STATUS_ICONS, SOC_ROW_STATUS_LABELS, socAxisValueLabel, sortReviewRows, type EvidenceCitation, type SocDecisionFilter, type SocFinalDecision, type SocReviewFilter, type SocReviewSort } from "@/lib/soc-review";

type ReviewItem = { id: string; label: string; state: string; missingDocuments: string[]; confirmed: boolean };
type StatusFilter = SocReviewFilter["status"];

const STATUS_FILTERS: StatusFilter[] = ["all", "fail", "review", "ok"];
const decisionLabel = (value: SocFinalDecision | null) => (value ? SOC_FINAL_DECISION_LABELS[value] : null);
// Keyboard shortcuts stay out of the way while the reviewer uses a control.
const isInteractive = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest("input, textarea, select, button, a, [role='radio'], [contenteditable='true']");

// Folded major-item groups are remembered per job in this browser (memory only when storage is blocked).
const FOLDED_EVENT = "soc:review-folded-changed";
const foldedFallback = new Map<string, string>();
function readFolded(key: string) {
  try { return window.localStorage.getItem(key) ?? foldedFallback.get(key) ?? "[]"; } catch { return foldedFallback.get(key) ?? "[]"; }
}
function parseFolded(raw: string): string[] {
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}
function writeFolded(key: string, ids: string[]) {
  const raw = JSON.stringify(ids);
  try { if (ids.length) window.localStorage.setItem(key, raw); else window.localStorage.removeItem(key); } catch { /* storage blocked: the fallback still works */ }
  foldedFallback.set(key, raw);
  window.dispatchEvent(new Event(FOLDED_EVENT));
}
function subscribeFolded(onChange: () => void) {
  window.addEventListener(FOLDED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(FOLDED_EVENT, onChange); window.removeEventListener("storage", onChange); };
}

export default function SocReviewPanel({ jobId, items, rows }: { jobId: string; items: ReviewItem[]; rows: SocReviewRow[] }) {
  const [filter, setFilter] = useState<SocReviewFilter>({ status: "all", majorItemId: "all", decision: "all", evidenceMissing: false });
  const [sort, setSort] = useState<SocReviewSort>("status");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const filteredRows = useMemo(() => sortReviewRows(filterReviewRows(rows, filter), sort), [rows, filter, sort]);
  // A SOC without a Comply/Better tick box shows the recommendation only.
  const ticked = rows.some((row) => row.declaredSelection);
  const label = new Map(items.map((m) => [m.id, m.label]));
  const counts = (status: StatusFilter) => filterReviewRows(rows, { ...filter, status }).length;
  const decided = rows.filter((r) => isSettledDecision(r.finalDecision)).length;
  const pendingFix = rows.filter((r) => r.finalDecision === PENDING_FIX).length;
  const missingEvidence = rows.filter((r) => r.evidenceMissing).length;
  const banners = items.filter((m) => m.state === "checked" && m.missingDocuments.length && (filter.majorItemId === "all" || filter.majorItemId === m.id));
  const checkedItems = items.filter((m) => rows.some((r) => r.majorItemId === m.id));
  // Picked rows a re-check or reload replaced are gone from `rows`.
  const pickedRows = sortReviewRows(rows.filter((r) => picked.has(r.id)), sort);
  const togglePicked = (ids: string[], on: boolean) => setPicked((current) => {
    const next = new Set(current);
    for (const id of ids) if (on) next.add(id); else next.delete(id);
    return next;
  });
  // In SOC order the rows sit under their major item, which folds away.
  const grouped = sort === "item";
  const foldedKey = `soc:review-folded:${jobId}`;
  const foldedRaw = useSyncExternalStore(subscribeFolded, () => readFolded(foldedKey), () => "[]");
  const folded = useMemo(() => new Set<string>(parseFolded(foldedRaw)), [foldedRaw]);
  const toggleFolded = (groupId: string) => {
    const next = new Set(folded);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    writeFolded(foldedKey, [...next]);
  };
  const groupOf = (row: SocReviewRow) => row.majorItemId ?? "";
  const displayedRows = grouped ? filteredRows.filter((row) => !folded.has(groupOf(row))) : filteredRows;
  const selected = selectedId ? displayedRows.find((r) => r.id === selectedId) : undefined;
  const allDisplayedPicked = displayedRows.length > 0 && displayedRows.every((r) => picked.has(r.id));
  const tableRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const select = (id: string) => {
    if (!selectedId && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
    setSelectedId(id);
    tableRef.current?.querySelector(`[data-row-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const closeWorkspace = () => {
    setSelectedId(null);
    setTimeout(() => openerRef.current?.focus(), 0);
  };
  // ↑/↓ (or k/j) move through the listed rows, unless the reviewer is typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (selectedId) return;
      if (event.ctrlKey || event.metaKey || event.altKey || isInteractive(event.target)) return;
      const step = event.key === "ArrowDown" || event.key === "j" ? 1 : event.key === "ArrowUp" || event.key === "k" ? -1 : 0;
      if (!step || !displayedRows.length) return;
      event.preventDefault();
      const at = displayedRows.findIndex((row) => row.id === selected?.id);
      select(displayedRows[Math.min(displayedRows.length - 1, Math.max(0, at + step))].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!rows.length && !banners.length) return null;
  const percent = rows.length ? Math.round((decided / rows.length) * 100) : 0;

  return <section className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-lg font-semibold">ตรวจทานผล</h2><p className="mt-1 text-xs text-muted">ผลจาก Claude เป็นเพียงคำแนะนำ ผู้ตรวจต้องยืนยัน Final Decision ทีละข้อ</p></div>
      <div className="w-full max-w-xs text-sm"><div className="flex justify-between gap-3"><span>ยืนยันแล้ว <span className="font-medium tabular-nums">{decided}/{rows.length}</span> ข้อ</span>{pendingFix ? <span className="text-muted">{SOC_FINAL_DECISION_LABELS[PENDING_FIX]} <span className="font-medium tabular-nums text-ink">{pendingFix}</span></span> : null}</div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} /></div></div>
    </div>
    {banners.map((m) => <div key={m.id} role="alert" className="rounded-input border border-danger-border bg-surface p-3 text-xs text-danger"><span className="font-medium">ข้อ {m.label} ตรวจโดยไม่มีไฟล์ {m.missingDocuments.join(", ")}</span> แถวที่อ้างไฟล์เหล่านี้จึงยืนยันไม่ได้ อัปโหลดไฟล์แล้วกดตรวจซ้ำได้</div>)}
    {missingEvidence ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-danger-border bg-surface p-3 text-xs text-danger">
      <span><span className="font-medium">{missingEvidence} แถวที่ Claude หาเอกสารหรือเลขหน้าที่อ้างไม่เจอ หรือเปิดอ่านไม่ได้</span> ตรวจว่าอัปโหลดไฟล์/โฟลเดอร์ครบหรือไม่ แล้วเลือกแถวเหล่านี้ส่งให้ Claude ตรวจใหม่</span>
      <button type="button" onClick={() => setFilter({ ...filter, evidenceMissing: !filter.evidenceMissing })} className="ui-btn rounded-full border border-danger-border px-3 py-1 font-medium">{filter.evidenceMissing ? "แสดงทุกแถว" : "ดูเฉพาะแถวเหล่านี้"}</button>
    </div> : null}
    <div className="flex flex-wrap items-center gap-2 rounded-card bg-surface p-3 text-sm shadow-card">
      {STATUS_FILTERS.map((status) => <button key={status} type="button" onClick={() => setFilter({ ...filter, status })} className={`ui-btn rounded-full px-3 py-1.5 text-xs transition-colors ${filter.status === status ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{status === "all" ? "ทั้งหมด" : `${SOC_ROW_STATUS_ICONS[status]} ${SOC_ROW_STATUS_LABELS[status]}`} ({counts(status)})</button>)}
      <select aria-label="ข้อใหญ่" value={filter.majorItemId} onChange={(e) => setFilter({ ...filter, majorItemId: e.target.value })} className="h-8 rounded-input border border-line bg-surface px-2 text-xs">
        <option value="all">ทุกข้อใหญ่</option>
        {checkedItems.map((m) => <option key={m.id} value={m.id}>ข้อใหญ่ {m.label}{m.confirmed ? " · ยืนยันแล้ว" : ""}</option>)}
      </select>
      <select aria-label="Final Decision" value={filter.decision ?? "all"} onChange={(e) => setFilter({ ...filter, decision: e.target.value as SocDecisionFilter })} className="h-8 rounded-input border border-line bg-surface px-2 text-xs">
        <option value="all">ทุก Final Decision</option>
        <option value="undecided">ยังไม่ตัดสิน</option>
        {SOC_FINAL_DECISIONS.map((value) => <option key={value} value={value}>{SOC_FINAL_DECISION_LABELS[value]}</option>)}
      </select>
      <select aria-label="เรียง" value={sort} onChange={(e) => setSort(e.target.value as SocReviewSort)} className="h-8 rounded-input border border-line bg-surface px-2 text-xs">
        <option value="status">เรียง: ปัญหาก่อน (❌ ⚠️ ✅)</option>
        <option value="item">เรียง: ตามลำดับข้อใน SOC</option>
      </select>
      <PickedActions jobId={jobId} picked={pickedRows} visible={filteredRows} onClear={() => setPicked(new Set())} />
    </div>
    <div className="relative">
      <div className="overflow-hidden rounded-card bg-surface shadow-card"><div ref={tableRef} className="max-h-[calc(100vh-160px)] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-chip text-left text-xs text-label"><tr><th className="py-2.5 pl-3"><input type="checkbox" aria-label="เลือกทุกแถวที่แสดง" title="ติ๊กเลือกแถวเพื่อส่งให้ Claude ตรวจใหม่ หรือดาวน์โหลด Excel" checked={allDisplayedPicked} onChange={(e) => togglePicked(displayedRows.map((r) => r.id), e.target.checked)} /></th><th className="px-3 py-2.5">สถานะ</th><th className="px-3 py-2.5">ข้อ</th><th className="px-3 py-2.5">ข้อกำหนด TOR</th><th className="whitespace-nowrap px-3 py-2.5">{ticked ? "ติ๊ก → แนะนำ" : "แนะนำ"}</th><th className="px-3 py-2.5">Final Decision</th></tr></thead>
          <tbody>{filteredRows.map((row, i) => {
            const groupId = groupOf(row);
            const groupStart = grouped && (i === 0 || groupOf(filteredRows[i - 1]) !== groupId);
            const groupRows = groupStart ? rows.filter((r) => groupOf(r) === groupId) : [];
            const settled = isSettledDecision(row.finalDecision);
            return <Fragment key={row.id}>
              {groupStart ? <tr className="border-t border-line bg-ground"><td colSpan={6} className="p-0"><button type="button" onClick={() => toggleFolded(groupId)} aria-expanded={!folded.has(groupId)} className="ui-btn flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-hover">
                <span aria-hidden className={`text-[10px] text-muted transition-transform ${folded.has(groupId) ? "" : "rotate-90"}`}>▶</span>
                <span className="font-semibold">ข้อใหญ่ {label.get(groupId) ?? "—"}</span>
                <span className="text-muted">ยืนยันแล้ว {groupRows.filter((r) => isSettledDecision(r.finalDecision)).length}/{groupRows.length}</span>
                <span className="ml-auto text-muted">{(["fail", "review"] as const).map((status) => { const n = groupRows.filter((r) => r.status === status).length; return n ? `${SOC_ROW_STATUS_ICONS[status]} ${n} ` : ""; })}</span>
              </button></td></tr> : null}
              {grouped && folded.has(groupId) ? null : <tr data-row-id={row.id} onClick={() => select(row.id)} className={`cursor-pointer border-t border-line align-top transition-colors ${selected?.id === row.id ? "bg-hover" : `hover:bg-hover ${settled ? "opacity-60" : ""}`}`}>
                <td className="py-3 pl-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`เลือกข้อ ${row.item}`} checked={picked.has(row.id)} onChange={(e) => togglePicked([row.id], e.target.checked)} /></td>
                <td className="px-3 py-3 text-base" title={SOC_ROW_STATUS_LABELS[row.status]}>{SOC_ROW_STATUS_ICONS[row.status]}</td>
                <td className="whitespace-nowrap px-3 py-3"><button type="button" onClick={() => select(row.id)} className="ui-btn font-medium text-ink">{row.item}</button></td>
                <td className="px-3 py-3"><span className="line-clamp-2 leading-relaxed">{row.torText || <span className="text-muted">{row.keyIssue || row.detail}</span>}</span>{row.evidenceMissing ? <span className="mt-1 inline-block rounded-full border border-danger-border px-2 py-0.5 text-[11px] text-danger">หาเอกสารไม่เจอ</span> : null}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">{row.declaredSelection ? <>{socAxisValueLabel(row.declaredSelection)} → </> : null}<span className="font-medium">{socAxisValueLabel(row.systemRecommendation)}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">{row.finalDecision ? <DecisionChip decision={row.finalDecision} /> : <span className="text-muted">—</span>}</td>
              </tr>}
            </Fragment>;
          })}</tbody>
        </table>
        {filteredRows.length ? null : <p className="p-8 text-center text-sm text-muted">ไม่พบรายการในตัวกรองนี้</p>}
      </div></div>
      {selected ? <ReviewWorkspace key={selected.id} jobId={jobId} row={selected} rows={displayedRows} majorItemLabel={selected.majorItemId ? label.get(selected.majorItemId) ?? null : null} onClose={closeWorkspace} onSelect={select} /> : null}
    </div>
  </section>;
}

type WorkspaceDestination = { type: "close" } | { type: "row"; id: string };

function ReviewWorkspace({ jobId, row, rows, majorItemLabel, onClose, onSelect }: { jobId: string; row: SocReviewRow; rows: SocReviewRow[]; majorItemLabel: string | null; onClose: () => void; onSelect: (id: string) => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [decision, setDecision] = useState<string>(row.finalDecision ?? "");
  const [note, setNote] = useState(row.finalNote ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState<WorkspaceDestination | null>(null);
  const dirty = decision !== (row.finalDecision ?? "") || note.trim() !== (row.finalNote ?? "");
  const at = rows.findIndex((candidate) => candidate.id === row.id);
  const previous = at > 0 ? rows[at - 1] : null;
  const next = at >= 0 && at < rows.length - 1 ? rows[at + 1] : null;
  const nextUndecided = nextRowToReview(rows, row.id);
  const go = (target: WorkspaceDestination) => target.type === "close" ? onClose() : onSelect(target.id);
  const request = (target: WorkspaceDestination) => dirty ? setDestination(target) : go(target);
  const save = (after?: () => void) => {
    if (!decision || pending) return;
    setError("");
    startTransition(async () => {
      try {
        await decideSocRow({ jobId, resultId: row.id, decision, note });
        router.refresh();
        (after ?? (() => nextUndecided ? onSelect(nextUndecided.id) : onClose()))();
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  };
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea, select, input') ?? [])].filter((element) => element.offsetParent !== null || element === document.activeElement);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key === "Escape") { request({ type: "close" }); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || isInteractive(event.target)) return;
      if ((event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "k") && previous) request({ type: "row", id: previous.id });
      if ((event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "j") && next) request({ type: "row", id: next.id });
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  });

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`ตรวจข้อ ${row.item}`} className="fixed inset-0 z-50 flex flex-col bg-ground">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 shadow-sm sm:px-6">
      <div><div className="text-xs font-medium text-muted">พื้นที่ตรวจ SOC</div><h2 className="font-display text-lg font-bold">{SOC_ROW_STATUS_ICONS[row.status]} ข้อ {row.item}</h2></div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={!previous} onClick={() => previous && request({ type: "row", id: previous.id })} className="ui-btn rounded-full border border-line px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-40">← ข้อก่อนหน้า</button>
        <button type="button" disabled={!next} onClick={() => next && request({ type: "row", id: next.id })} className="ui-btn rounded-full border border-line px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-40">ข้อถัดไป →</button>
        <button ref={closeRef} type="button" onClick={() => request({ type: "close" })} aria-label="ปิดพื้นที่ตรวจ" className="ui-btn rounded-full border border-line px-3 py-1.5 text-sm hover:bg-hover">✕ ปิด</button>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
      <RowInspector jobId={jobId} row={row} majorItemLabel={majorItemLabel} decision={decision} note={note} error={error} pending={pending} onDecision={setDecision} onNote={setNote} onSave={() => save()} />
    </div>
    {destination ? <div role="alertdialog" aria-modal="true" aria-label="มีข้อมูลที่ยังไม่ได้บันทึก" className="absolute inset-0 z-10 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-card bg-surface p-5 shadow-card">
        <h3 className="font-display text-lg font-bold">มีข้อมูลที่ยังไม่ได้บันทึก</h3>
        <p className="mt-2 text-sm text-label">คุณเปลี่ยน Final Decision หรือหมายเหตุของข้อ {row.item}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setDestination(null)}>กลับไปแก้ไข</Button>
          <Button size="sm" variant="outline" onClick={() => go(destination)}>ทิ้งการแก้ไข</Button>
          <Button size="sm" disabled={!decision || pending} onClick={() => save(() => go(destination))}>{pending ? "กำลังบันทึก…" : "บันทึกแล้วไปต่อ"}</Button>
        </div>
      </div>
    </div> : null}
  </div>;
}

function DecisionChip({ decision }: { decision: SocFinalDecision }) {
  return decision === PENDING_FIX
    ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">⏳ {decisionLabel(decision)}</span>
    : <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">✔ {decisionLabel(decision)}</span>;
}

// Above the table: what to do with the picked rows (ส่งให้ Claude ตรวจใหม่,
// Excel), or with no rows picked, Excel of the rows the filters show.
function PickedActions({ jobId, picked, visible, onClear }: { jobId: string; picked: SocReviewRow[]; visible: SocReviewRow[]; onClear: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  function recheck() {
    const settled = picked.filter((r) => isSettledDecision(r.finalDecision));
    if (settled.length && !window.confirm(`มี ${settled.length} แถวที่ยืนยัน Final Decision แล้ว (${settled.map((r) => `ข้อ ${r.item}`).join(", ")}) การตรวจใหม่จะแทนที่ผลและ Final Decision ของแถวเหล่านี้ ทำต่อหรือไม่?`)) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await requestSocRowRechecks(jobId, picked.map((r) => r.id));
        if (!result.ok) { setMessage({ error: true, text: result.error }); return; }
        setMessage({ error: false, text: `ส่ง ${picked.length} แถวให้ SOC Runner ตรวจใหม่แล้ว (${result.requested} ข้อใหญ่) ผลจะแทนที่เฉพาะแถวเหล่านี้` });
        onClear();
        router.refresh();
      } catch {
        setMessage({ error: true, text: "ส่งตรวจใหม่ไม่สำเร็จ กรุณาลองใหม่" });
      }
    });
  }

  async function downloadExcel(rows: SocReviewRow[]) {
    setMessage(null);
    setDownloading(true);
    try {
      const response = await fetch(`/api/soc/jobs/${jobId}/results-excel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resultIds: rows.map((r) => r.id) }) });
      if (!response.ok) { setMessage({ error: true, text: (await response.json().catch(() => null))?.error || "ดาวน์โหลดไม่สำเร็จ" }); return; }
      const name = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get("content-disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name ? decodeURIComponent(name) : "SOC_Check.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ error: true, text: "ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่" });
    } finally {
      setDownloading(false);
    }
  }

  return <div className="ml-auto flex flex-col items-end gap-1">
    <div className={`flex flex-wrap items-center gap-2 text-xs ${picked.length ? "rounded-input bg-chip px-2 py-1" : ""}`}>
      {picked.length ? <>
        <span className="font-medium">เลือก {picked.length} แถว</span>
        <Button size="sm" disabled={pending} onClick={recheck}>{pending ? "กำลังส่ง…" : "ส่งให้ Claude ตรวจใหม่"}</Button>
        <Button size="sm" variant="outline" disabled={downloading} onClick={() => downloadExcel(picked)}>{downloading ? "กำลังสร้าง…" : "Excel แถวที่เลือก"}</Button>
        <button type="button" onClick={onClear} className="ui-btn text-label underline hover:text-ink">ล้างที่เลือก</button>
      </> : <>
        <Button size="sm" variant="outline" disabled={downloading || !visible.length} onClick={() => downloadExcel(visible)}>{downloading ? "กำลังสร้าง…" : `Excel ตามตัวกรอง (${visible.length} แถว)`}</Button>
      </>}
    </div>
    {message ? <p role={message.error ? "alert" : "status"} className={`text-xs ${message.error ? "text-danger" : "text-muted"}`}>{message.text}</p> : null}
  </div>;
}

function RowInspector({ jobId, row, majorItemLabel, decision, note, error, pending, onDecision, onNote, onSave }: { jobId: string; row: SocReviewRow; majorItemLabel: string | null; decision: string; note: string; error: string; pending: boolean; onDecision: (value: string) => void; onNote: (value: string) => void; onSave: () => void }) {
  const same = row.declaredSelection === row.systemRecommendation;
  const [pane, setPane] = useState<"comparison" | "evidence">("comparison");
  return <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden rounded-card bg-surface shadow-card">
    <div role="tablist" aria-label="ส่วนของพื้นที่ตรวจ" className="grid grid-cols-2 border-b border-line md:hidden">
      <button type="button" role="tab" aria-selected={pane === "comparison"} onClick={() => setPane("comparison")} className={`ui-btn px-3 py-2 text-sm font-medium ${pane === "comparison" ? "bg-ink text-ground" : "bg-surface text-label"}`}>รายละเอียดเทียบ</button>
      <button type="button" role="tab" aria-selected={pane === "evidence"} onClick={() => setPane("evidence")} className={`ui-btn px-3 py-2 text-sm font-medium ${pane === "evidence" ? "bg-ink text-ground" : "bg-surface text-label"}`}>เอกสารอ้างอิง</button>
    </div>
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(20rem,2fr)_minmax(24rem,3fr)]">
      <section role="region" aria-label="รายละเอียดเทียบ" className={`${pane === "comparison" ? "flex" : "hidden"} min-h-0 flex-col md:flex md:border-r md:border-line`}>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-5">
          <div className="flex flex-wrap items-baseline gap-2"><h3 className="font-display text-lg font-bold">{SOC_ROW_STATUS_ICONS[row.status]} ข้อ {row.item}</h3><span className="text-sm text-muted">{SOC_ROW_STATUS_LABELS[row.status]}{majorItemLabel ? ` · ข้อใหญ่ ${majorItemLabel}` : ""} · แถว {row.rowNumber}</span></div>
          {row.reasons.length ? <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
          <div className="grid gap-3 text-sm xl:grid-cols-2">
          <div className="rounded-input border border-line p-3"><div className="text-xs font-semibold text-label">ข้อกำหนด TOR</div><p className="mt-1 whitespace-pre-wrap leading-relaxed">{row.torText || <span className="text-muted">ไม่พบข้อความในไฟล์ SOC</span>}</p></div>
          <div className="rounded-input border border-line p-3"><div className="text-xs font-semibold text-label">ข้อเสนอของผู้ยื่น</div><p className="mt-1 whitespace-pre-wrap leading-relaxed">{row.proposalText || <span className="text-muted">—</span>}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
          {row.declaredSelection ? <>
            <span className="rounded-full bg-chip px-3 py-1">ผู้ยื่นติ๊ก: <span className="font-medium">{socAxisValueLabel(row.declaredSelection)}</span></span>
            <span className={same ? "text-muted" : "font-bold text-danger"} title={same ? "ตรงกัน" : "ไม่ตรงกัน"}>{same ? "=" : "≠"}</span>
          </> : null}
          <span className="rounded-full bg-chip px-3 py-1">ระบบแนะนำ: <span className="font-medium">{socAxisValueLabel(row.systemRecommendation)}</span></span>
          </div>
          <div className="rounded-input bg-ground p-3 text-sm"><div className="text-xs font-semibold text-label">สรุปจาก Claude · confidence {row.confidence || "—"}</div><p className="mt-1 leading-relaxed">{row.detail}</p>{row.keyIssue && row.keyIssue !== row.detail ? <p className="mt-1 text-sm text-label">ประเด็นหลัก: {row.keyIssue}</p> : null}</div>
          <details className="rounded-input border border-line p-3"><summary className="cursor-pointer text-sm font-medium">รายละเอียดทุกแกน ({row.axes.length})</summary>
          <table className="mt-2 w-full border-collapse text-sm"><tbody>{row.axes.map((axis) => <tr key={axis.key} className="border-t border-line align-top">
            <td className="w-40 py-1.5 pr-2 text-label">{axis.label}</td>
            <td className={`w-28 py-1.5 pr-2 font-medium ${axis.ok ? "" : "text-amber-700 dark:text-amber-400"}`}>{axis.ok ? "" : "• "}{socAxisValueLabel(axis.value ?? "not_applicable")}</td>
            <td className="py-1.5 text-xs text-muted">{axis.detail}</td>
          </tr>)}</tbody></table>
          </details>
        </div>
        <div className="shrink-0 border-t border-line bg-surface p-3 md:p-4"><DecisionForm row={row} decision={decision} note={note} error={error} pending={pending} onDecision={onDecision} onNote={onNote} onSave={onSave} /></div>
      </section>
      <section role="region" aria-label="เอกสารอ้างอิง" className={`${pane === "evidence" ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto bg-ground p-3 md:flex md:p-4`}>
        <PdfEvidence jobId={jobId} row={row} />
      </section>
    </div>
  </div>;
}

// An uploaded evidence PDF keeps its folders ("2.5 …/1.…/tc22.pdf"); notes name the file.
const fileName = (name: string) => name.split("/").pop() ?? name;

// The cited pages of the evidence PDFs the reference names, rendered on the
// server with each PDF's own highlights (ticket 09), with buttons to page
// through a multi-page or multi-document citation. A page that can't be shown
// gets the server's Thai reason instead of a broken image.
function PdfEvidence({ jobId, row }: { jobId: string; row: SocReviewRow }) {
  // A citation of a folder with several PDFs and no file the skill checked: the reviewer picks one.
  const [picked, setPicked] = useState<Record<number, EvidenceCitation["document"]>>({});
  const citations = row.citations.map((citation, i) => (citation.document || !picked[i] ? citation : { ...citation, document: picked[i] }));
  const pages = citations.flatMap((citation) => (citation.document ? citation.pages.map((page) => ({ document: citation.document!, page })) : []));
  const unmatched = citations.filter((citation) => !citation.document && !citation.folderFiles?.length);
  const unpaged = citations.filter((citation) => citation.document && !citation.pages.length);
  const severalDocuments = new Set(pages.map((p) => p.document.id)).size > 1;
  const [shownIndex, setShownIndex] = useState(0);
  const [zoom, setZoom] = useState<number | "fit">("fit");
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
    {shown ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-line bg-surface px-2 py-1.5 text-xs">
      <span className="font-medium text-label">หน้า {shown.page}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="ย่อเอกสาร" onClick={() => setZoom((value) => Math.max(50, (value === "fit" ? 100 : value) - 25))} className="ui-btn rounded px-2 py-1 hover:bg-hover">−</button>
        <span className="min-w-12 text-center tabular-nums text-muted">{zoom === "fit" ? "พอดี" : `${zoom}%`}</span>
        <button type="button" aria-label="ขยายเอกสาร" onClick={() => setZoom((value) => Math.min(200, (value === "fit" ? 100 : value) + 25))} className="ui-btn rounded px-2 py-1 hover:bg-hover">＋</button>
        <button type="button" onClick={() => setZoom("fit")} className="ui-btn rounded px-2 py-1 text-label hover:bg-hover">พอดีความกว้าง</button>
      </div>
    </div> : null}
    {pages.length > 1 ? <div className="flex flex-wrap gap-1.5" role="group" aria-label="หน้าที่อ้าง">
      {pages.map((p, i) => <button key={`${p.document.id}:${p.page}`} type="button" onClick={() => setShownIndex(i)} aria-pressed={i === shownIndex} className={`ui-btn rounded-full px-3 py-1 text-xs transition-colors ${i === shownIndex ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{severalDocuments ? `${p.document.name} ` : ""}หน้า {p.page}</button>)}
    </div> : null}
    {!row.citations.length ? note("แถวนี้ไม่ได้อ้างเอกสาร") : null}
    {citations.map((c) => c.document && c.via ? note(c.via === "reference_file"
      ? `อ้างโฟลเดอร์ "${c.folder}" → ไฟล์ที่ Claude ใช้ตรวจ: ${fileName(c.document.name)}`
      : `อ้างโฟลเดอร์ "${c.folder}" → ไฟล์เดียวในโฟลเดอร์: ${fileName(c.document.name)}`) : null)}
    {row.citations.map((c, i) => c.folderFiles?.length ? <div key={`pick-${i}`} className="flex flex-col gap-1.5 rounded-input bg-ground p-3 text-xs text-muted">
      <span>อ้างโฟลเดอร์ &quot;{c.folder}&quot; ซึ่งมี {c.folderFiles.length} ไฟล์ และไม่รู้ว่า Claude ใช้ไฟล์ไหน เลือกไฟล์ที่จะดู{c.pages.length ? ` หน้า ${c.pages.join(", ")}` : ""}:</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`ไฟล์ในโฟลเดอร์ ${c.folder}`}>
        {c.folderFiles.map((d) => <button key={d.id} type="button" aria-pressed={picked[i]?.id === d.id} onClick={() => { setPicked((current) => ({ ...current, [i]: d })); setShownIndex(0); }}
          className={`ui-btn rounded-full px-3 py-1 text-xs transition-colors ${picked[i]?.id === d.id ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{fileName(d.name)}</button>)}
      </div>
    </div> : null)}
    {unmatched.map((c) => note(`ไม่พบไฟล์ PDF ที่ตรงกับ "${c.cited || row.reference}" ในงานนี้ ตรวจชื่อไฟล์หลักฐานหรืออัปโหลดเพิ่ม`))}
    {unpaged.map((c) => note(`การอ้างอิง ${c.document!.name} ไม่ได้ระบุเลขหน้า`))}
    {!shown || !src ? null
      : failures[src] ? <p role="alert" className="rounded-input border border-danger-border bg-surface p-3 text-xs text-danger">{failures[src]}</p>
      : <div className="relative min-h-40 overflow-auto rounded-input border border-line bg-white">
        {/* Under the image, so it shows only until the page has loaded. */}
        <p className="absolute inset-x-0 top-0 p-3 text-xs text-muted">กำลังโหลดหน้า {shown.page}…</p>
        {/* A server-rendered PNG behind an access check; next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt={`${shown.document.name} หน้า ${shown.page}`} data-zoom={zoom} style={zoom === "fit" ? undefined : { width: `${zoom}%` }} className={`relative block h-auto bg-white ${zoom === "fit" ? "w-full" : "max-w-none"}`} onError={(event) => explainFailure(src, event.currentTarget.src)}
          // An image that failed before hydration never fires onError.
          ref={(img) => { if (img?.complete && img.naturalWidth === 0) explainFailure(src); }} />
      </div>}
    {/* The skill reports no highlight positions, only what it found highlighted. */}
    {highlight?.detail && highlight.detail !== "—" ? <p className="text-xs leading-relaxed text-muted"><span className="font-semibold text-label">Highlight ({socAxisValueLabel(highlight.value ?? "not_applicable")}):</span> {highlight.detail}</p> : null}
  </div>;
}

function DecisionForm({ row, decision, note, error, pending, onDecision, onNote, onSave }: { row: SocReviewRow; decision: string; note: string; error: string; pending: boolean; onDecision: (value: string) => void; onNote: (value: string) => void; onSave: () => void }) {
  const unchanged = decision === (row.finalDecision ?? "") && note.trim() === (row.finalNote ?? "");
  const canSave = !pending && !!decision && !unchanged;
  // 1–4 pick a Final Decision, Ctrl+Enter saves (also from the note box).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (canSave) { event.preventDefault(); onSave(); }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isInteractive(event.target)) return;
      const value = SOC_FINAL_DECISIONS[Number(event.key) - 1];
      if (value) { event.preventDefault(); onDecision(value); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return <div className="flex flex-col gap-2 rounded-input border border-line bg-ground p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-xs font-semibold text-label">Final Decision ของผู้ตรวจ</span><span className="text-[11px] text-muted">คีย์ลัด: ↑↓ เลือกแถว · 1–4 เลือก · Ctrl+Enter ยืนยัน</span></div>
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Final Decision">{SOC_FINAL_DECISIONS.map((value, i) => <button key={value} type="button" role="radio" aria-checked={decision === value} aria-keyshortcuts={String(i + 1)} onClick={() => onDecision(value)} className={`ui-btn rounded-input border px-3 py-1.5 text-sm transition-colors ${decision === value ? "border-ink bg-accent text-black" : "border-line bg-surface hover:bg-hover"}`}><span className="mr-1.5 text-[11px] opacity-60">{i + 1}</span>{SOC_FINAL_DECISION_LABELS[value]}</button>)}</div>
    <textarea value={note} onChange={(e) => onNote(e.target.value)} maxLength={SOC_REVIEW_NOTE_MAX} rows={2} placeholder="หมายเหตุของผู้ตรวจ (ไม่บังคับ)" className="rounded-input border border-line bg-surface p-2 text-sm leading-relaxed" />
    <div className="flex flex-wrap items-center justify-end gap-3">
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : row.finalDecision ? <span className="text-xs text-muted">{row.finalDecision === PENDING_FIX ? "บันทึกแล้ว" : "ยืนยันแล้ว"}: {decisionLabel(row.finalDecision)}{row.reviewedByName ? ` โดย ${row.reviewedByName}` : ""}</span> : null}
      <Button size="sm" disabled={!canSave} onClick={onSave}>{pending ? "กำลังบันทึก…" : row.finalDecision ? "บันทึกการแก้ไข" : "ยืนยันข้อนี้"}</Button>
    </div>
  </div>;
}
