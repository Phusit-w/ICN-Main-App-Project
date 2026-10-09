"use client";

// The review page of an Imported SOC Check (ticket 08, layout A from the
// ticket 07 prototype): a table of every row, problems first, and an
// inspector on the right for the selected row with its Final Decision, which
// can open full screen. Each
// row is confirmed on its own; there is no bulk confirm. Rows can be picked
// to send to Claude again or to download as Excel.
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { decideSocRow } from "@/actions/soc";
import Button from "@/components/ui/Button";
import type { SocReviewRow } from "@/lib/soc-review-view";
import { requestSocRowRechecks } from "@/actions/socCheckRequests";
import { filterReviewRows, isSettledDecision, nextRowToReview, PENDING_FIX, SOC_FINAL_DECISIONS, SOC_FINAL_DECISION_LABELS, SOC_REVIEW_NOTE_MAX, SOC_ROW_STATUS_ICONS, SOC_ROW_STATUS_LABELS, socAxisValueLabel, sortReviewRows, type EvidenceCitation, type SocDecisionFilter, type SocFinalDecision, type SocReviewFilter, type SocReviewSort } from "@/lib/soc-review";

type ReviewItem = { id: string; label: string; state: string; missingDocuments: string[]; confirmed: boolean };
type StatusFilter = SocReviewFilter["status"];

const STATUS_FILTERS: StatusFilter[] = ["all", "fail", "review", "ok"];
const SORTS: [SocReviewSort, string, string][] = [["status", "ปัญหาก่อน", "❌ ⚠️ ✅ แล้วตามลำดับแถว"], ["item", "ตามข้อใน SOC", "ตามลำดับข้อใน SOC แยกกลุ่มตามข้อใหญ่"]];
const decisionLabel = (value: SocFinalDecision | null) => (value ? SOC_FINAL_DECISION_LABELS[value] : null);
const DEFAULT_FILTER: SocReviewFilter = { status: "all", majorItemId: "all", decision: "all", evidenceMissing: false };
// Keyboard shortcuts stay out of the way while the reviewer types; a focused button or checkbox doesn't count.
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || (target instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(target.type)));

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
  const [filter, setFilter] = useState<SocReviewFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SocReviewSort>("status");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
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
  const selected = displayedRows.find((r) => r.id === selectedId) ?? displayedRows[0];
  const allDisplayedPicked = displayedRows.length > 0 && displayedRows.every((r) => picked.has(r.id));
  const sectionRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const select = (id: string) => {
    setSelectedId(id);
    tableRef.current?.querySelector(`[data-row-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  // A phone has no room beside the table: a picked row opens full screen.
  const pick = (id: string) => {
    select(id);
    if (window.matchMedia?.("(max-width: 1023px)").matches) setExpanded(true);
  };
  const changed = sort !== "status" || filter.status !== "all" || filter.majorItemId !== "all" || (filter.decision ?? "all") !== "all" || !!filter.evidenceMissing;
  const reset = () => { setFilter(DEFAULT_FILTER); setSort("status"); };
  if (!rows.length && !banners.length) return null;
  const percent = rows.length ? Math.round((decided / rows.length) * 100) : 0;
  const sortHeader = (value: SocReviewSort, text: string, title: string) => <button type="button" onClick={() => setSort(value)} aria-pressed={sort === value} title={title} className={`ui-btn inline-flex items-center gap-1 ${sort === value ? "font-semibold text-ink" : "hover:text-ink"}`}>{text}<span aria-hidden className={sort === value ? "" : "opacity-0"}>↓</span></button>;

  return <section ref={sectionRef} className="flex flex-col gap-4">
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
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="สถานะ">{STATUS_FILTERS.map((status) => <button key={status} type="button" aria-pressed={filter.status === status} onClick={() => setFilter({ ...filter, status })} className={`ui-btn rounded-full px-3 py-1.5 text-xs transition-colors ${filter.status === status ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{status === "all" ? "ทั้งหมด" : `${SOC_ROW_STATUS_ICONS[status]} ${SOC_ROW_STATUS_LABELS[status]}`} ({counts(status)})</button>)}</div>
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <div className="flex items-center gap-1.5" role="group" aria-label="เรียงแถว"><span className="text-xs text-label">เรียง</span>{SORTS.map(([value, text, title]) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)} title={title} className={`ui-btn rounded-full px-3 py-1.5 text-xs transition-colors ${sort === value ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{text}</button>)}</div>
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <FilterMenu filter={filter} items={checkedItems} onChange={setFilter} />
      {filter.majorItemId !== "all" ? <FilterChip onRemove={() => setFilter({ ...filter, majorItemId: "all" })}>ข้อใหญ่ {label.get(filter.majorItemId) ?? "—"}</FilterChip> : null}
      {(filter.decision ?? "all") !== "all" ? <FilterChip onRemove={() => setFilter({ ...filter, decision: "all" })}>{filter.decision === "undecided" ? "ยังไม่ตัดสิน" : SOC_FINAL_DECISION_LABELS[filter.decision as SocFinalDecision]}</FilterChip> : null}
      {filter.evidenceMissing ? <FilterChip onRemove={() => setFilter({ ...filter, evidenceMissing: false })}>หาเอกสารไม่เจอ</FilterChip> : null}
      <button type="button" onClick={reset} disabled={!changed} title="กลับไปแสดงทุกแถว เรียงปัญหาก่อน" className="ui-btn rounded-full px-2.5 py-1.5 text-xs text-label hover:bg-hover hover:text-ink disabled:opacity-40">↺ ล้างตัวกรอง</button>
      <PickedActions jobId={jobId} picked={pickedRows} visible={filteredRows} onClear={() => setPicked(new Set())} />
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="overflow-hidden rounded-card bg-surface shadow-card lg:self-start"><div ref={tableRef} tabIndex={-1} className="max-h-[calc(100vh-160px)] overflow-auto outline-none">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-chip text-left text-xs text-label"><tr><th className="py-2.5 pl-3"><input type="checkbox" aria-label="เลือกทุกแถวที่แสดง" title="ติ๊กเลือกแถวเพื่อส่งให้ Claude ตรวจใหม่ หรือดาวน์โหลด Excel" checked={allDisplayedPicked} onChange={(e) => togglePicked(displayedRows.map((r) => r.id), e.target.checked)} /></th><th className="px-3 py-2.5">{sortHeader("status", "สถานะ", "เรียงปัญหาก่อน (❌ ⚠️ ✅)")}</th><th className="px-3 py-2.5">{sortHeader("item", "ข้อ", "เรียงตามลำดับข้อใน SOC แยกกลุ่มตามข้อใหญ่")}</th><th className="px-3 py-2.5">ข้อกำหนด TOR</th><th className="whitespace-nowrap px-3 py-2.5">{ticked ? "ติ๊ก → แนะนำ" : "แนะนำ"}</th><th className="px-3 py-2.5">Final Decision</th></tr></thead>
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
              {grouped && folded.has(groupId) ? null : <tr data-row-id={row.id} aria-selected={selected?.id === row.id} onClick={() => { pick(row.id); tableRef.current?.focus({ preventScroll: true }); }} className={`cursor-pointer border-t border-line align-top transition-colors ${selected?.id === row.id ? "bg-hover shadow-[inset_3px_0_0_var(--color-accent,#f7931e)]" : `hover:bg-hover ${settled ? "opacity-60" : ""}`}`}>
                <td className="py-3 pl-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`เลือกข้อ ${row.item}`} checked={picked.has(row.id)} onChange={(e) => togglePicked([row.id], e.target.checked)} /></td>
                <td className="px-3 py-3 text-base" title={SOC_ROW_STATUS_LABELS[row.status]}>{SOC_ROW_STATUS_ICONS[row.status]}</td>
                <td className="whitespace-nowrap px-3 py-3"><button type="button" onClick={(e) => { e.stopPropagation(); pick(row.id); }} className="ui-btn font-medium text-ink">{row.item}</button></td>
                <td className="px-3 py-3"><span className="line-clamp-2 leading-relaxed">{row.torText || <span className="text-muted">{row.keyIssue || row.detail}</span>}</span>{row.evidenceMissing ? <span className="mt-1 inline-block rounded-full border border-danger-border px-2 py-0.5 text-[11px] text-danger">หาเอกสารไม่เจอ</span> : null}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">{row.declaredSelection ? <>{socAxisValueLabel(row.declaredSelection)} → </> : null}<span className="font-medium">{socAxisValueLabel(row.systemRecommendation)}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">{row.finalDecision ? <DecisionChip decision={row.finalDecision} /> : <span className="text-muted">—</span>}</td>
              </tr>}
            </Fragment>;
          })}</tbody>
        </table>
        {filteredRows.length ? null : <div className="flex flex-col items-center gap-2 p-8 text-sm text-muted"><p>ไม่พบรายการในตัวกรองนี้</p>{changed ? <button type="button" onClick={reset} className="ui-btn text-xs text-label underline hover:text-ink">↺ ล้างตัวกรอง</button> : null}</div>}
      </div></div>
      {selected ? <ReviewWorkspace key={selected.id} jobId={jobId} row={selected} rows={displayedRows} majorItemLabel={selected.majorItemId ? label.get(selected.majorItemId) ?? null : null} expanded={expanded} onExpand={setExpanded} onSelect={select} scopeRef={sectionRef} /> : null}
    </div>
  </section>;
}

// The less-used filters, behind one button so the toolbar stays short.
function FilterMenu({ filter, items, onChange }: { filter: SocReviewFilter; items: ReviewItem[]; onChange: (filter: SocReviewFilter) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = (filter.majorItemId !== "all" ? 1 : 0) + ((filter.decision ?? "all") !== "all" ? 1 : 0) + (filter.evidenceMissing ? 1 : 0);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const field = "h-8 rounded-input border border-line bg-surface px-2 text-xs text-ink";
  return <div ref={ref} className="relative">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`ui-btn inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs ${active ? "border-ink text-ink" : "border-line text-label hover:text-ink"}`}>ตัวกรอง{active ? ` (${active})` : ""} <span aria-hidden>▾</span></button>
    {open ? <div role="group" aria-label="ตัวกรองเพิ่มเติม" className="absolute left-0 top-full z-20 mt-1.5 flex w-64 flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
      <label className="flex flex-col gap-1 text-xs text-label">ข้อใหญ่
        <select value={filter.majorItemId} onChange={(e) => onChange({ ...filter, majorItemId: e.target.value })} className={field}>
          <option value="all">ทุกข้อใหญ่</option>
          {items.map((m) => <option key={m.id} value={m.id}>ข้อใหญ่ {m.label}{m.confirmed ? " · ยืนยันแล้ว" : ""}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-label">Final Decision
        <select value={filter.decision ?? "all"} onChange={(e) => onChange({ ...filter, decision: e.target.value as SocDecisionFilter })} className={field}>
          <option value="all">ทุก Final Decision</option>
          <option value="undecided">ยังไม่ตัดสิน</option>
          {SOC_FINAL_DECISIONS.map((value) => <option key={value} value={value}>{SOC_FINAL_DECISION_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-label"><input type="checkbox" checked={!!filter.evidenceMissing} onChange={(e) => onChange({ ...filter, evidenceMissing: e.target.checked })} /> เฉพาะแถวที่หาเอกสารไม่เจอ</label>
    </div> : null}
  </div>;
}

function FilterChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-chip py-1 pl-2.5 pr-1 text-xs text-ink">{children}<button type="button" onClick={onRemove} aria-label={`เอาตัวกรอง ${typeof children === "string" ? children : ""} ออก`.trim()} className="ui-btn grid h-4 w-4 place-items-center rounded-full text-[10px] text-muted hover:bg-hover hover:text-ink">✕</button></span>;
}

// The selected row beside the table, or full screen (⤢). The decision being
// written survives switching between the two.
function ReviewWorkspace({ jobId, row, rows, majorItemLabel, expanded, onExpand, onSelect, scopeRef }: { jobId: string; row: SocReviewRow; rows: SocReviewRow[]; majorItemLabel: string | null; expanded: boolean; onExpand: (expanded: boolean) => void; onSelect: (id: string) => void; scopeRef: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [decision, setDecision] = useState<string>(row.finalDecision ?? "");
  const [note, setNote] = useState(row.finalNote ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState<string | null>(null);
  const dirty = decision !== (row.finalDecision ?? "") || note.trim() !== (row.finalNote ?? "");
  const canSave = !pending && !!decision && dirty;
  const at = rows.findIndex((candidate) => candidate.id === row.id);
  const previous = at > 0 ? rows[at - 1] : null;
  const next = at >= 0 && at < rows.length - 1 ? rows[at + 1] : null;
  const nextUndecided = nextRowToReview(rows, row.id);
  const request = (id: string) => dirty ? setDestination(id) : onSelect(id);
  const save = (after?: () => void) => {
    if (!decision || pending) return;
    setError("");
    startTransition(async () => {
      try {
        await decideSocRow({ jobId, resultId: row.id, decision, note });
        router.refresh();
        (after ?? (() => { if (nextUndecided) onSelect(nextUndecided.id); }))();
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  };
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    toggleRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [expanded]);
  // Back beside the table, focus returns to the ⤢ button.
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (wasExpanded.current && !expanded) toggleRef.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded]);
  // ←/→ (also ↑/↓, j/k) change rows, 1–4 pick a Final Decision, Ctrl+Enter saves, Esc leaves full screen.
  // Beside the table they work while the review section has focus; full screen, anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (destination) return;
      if (!expanded && !(event.target instanceof Node && scopeRef.current?.contains(event.target))) return;
      if (expanded && event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea, select, input') ?? [])].filter((element) => element.offsetParent !== null || element === document.activeElement);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (expanded && event.key === "Escape") { onExpand(false); return; }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { if (canSave) { event.preventDefault(); save(); } return; }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const choice = SOC_FINAL_DECISIONS[Number(event.key) - 1];
      if (choice) { event.preventDefault(); setDecision(choice); return; }
      if (["ArrowLeft", "ArrowUp", "k"].includes(event.key) && previous) { event.preventDefault(); request(previous.id); }
      if (["ArrowRight", "ArrowDown", "j"].includes(event.key) && next) { event.preventDefault(); request(next.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  });

  const settled = rows.filter((candidate) => isSettledDecision(candidate.finalDecision)).length;
  const navButton = "ui-btn inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-sm hover:bg-hover disabled:opacity-40";
  const header = <header className={`relative flex items-center gap-2 border-b border-line bg-surface ${expanded ? "px-3 py-2 sm:gap-3 sm:px-5" : "px-4 py-2.5"}`}>
    <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 font-display text-base font-bold sm:text-lg">
      <span className="whitespace-nowrap">{SOC_ROW_STATUS_ICONS[row.status]} ข้อ {row.item}</span>
      <span className="truncate font-sans text-xs font-normal text-muted sm:text-sm">{SOC_ROW_STATUS_LABELS[row.status]}{majorItemLabel ? ` · ข้อใหญ่ ${majorItemLabel}` : ""} · แถว {row.rowNumber}</span>
    </h2>
    {expanded ? <span className="hidden whitespace-nowrap text-[11px] text-muted xl:inline">คีย์ลัด: ← → เปลี่ยนข้อ · 1–4 เลือก · Ctrl+Enter บันทึก · Esc ย่อ</span> : null}
    <span className="whitespace-nowrap text-xs tabular-nums text-label" title={`ยืนยันแล้ว ${settled} จาก ${rows.length} ข้อที่แสดง · คีย์ลัด ← → เปลี่ยนข้อ · 1–4 เลือก · Ctrl+Enter บันทึก`}>{at + 1}/{rows.length}</span>
    <button type="button" disabled={!previous} onClick={() => previous && request(previous.id)} aria-label="ข้อก่อนหน้า" title="ข้อก่อนหน้า (←)" className={navButton}>←</button>
    <button type="button" disabled={!next} onClick={() => next && request(next.id)} aria-label="ข้อถัดไป" title="ข้อถัดไป (→)" className={navButton}>→</button>
    <button ref={toggleRef} type="button" onClick={() => onExpand(!expanded)} aria-label={expanded ? "ย่อกลับข้างตาราง" : "ขยายเต็มจอ"} title={expanded ? "ย่อกลับข้างตาราง (Esc)" : "ขยายเต็มจอ"} className={navButton}>{expanded ? "⤡" : "⤢"}<span className="hidden sm:inline">{expanded ? " ย่อ" : " เต็มจอ"}</span></button>
    <div aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-chip"><div className="h-full bg-accent transition-all" style={{ width: `${rows.length ? (settled / rows.length) * 100 : 0}%` }} /></div>
  </header>;
  const inspector = <RowInspector jobId={jobId} row={row} layout={expanded ? "split" : "stack"} decisionForm={<DecisionForm row={row} decision={decision} note={note} error={error} pending={pending} canSave={canSave} onDecision={setDecision} onNote={setNote} onSave={() => save()} />} />;
  const unsaved = destination ? <div role="alertdialog" aria-modal="true" aria-label="มีข้อมูลที่ยังไม่ได้บันทึก" className="absolute inset-0 z-10 grid place-items-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-card bg-surface p-5 shadow-card">
      <h3 className="font-display text-lg font-bold">มีข้อมูลที่ยังไม่ได้บันทึก</h3>
      <p className="mt-2 text-sm text-label">คุณเปลี่ยน Final Decision หรือหมายเหตุของข้อ {row.item}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setDestination(null)}>กลับไปแก้ไข</Button>
        <Button size="sm" variant="outline" onClick={() => onSelect(destination)}>ทิ้งการแก้ไข</Button>
        <Button size="sm" disabled={!decision || pending} onClick={() => save(() => onSelect(destination))}>{pending ? "กำลังบันทึก…" : "บันทึกแล้วไปต่อ"}</Button>
      </div>
    </div>
  </div> : null;

  if (!expanded) return <aside aria-label={`รายละเอียดข้อ ${row.item}`} className="relative flex flex-col overflow-hidden rounded-card bg-surface shadow-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:self-start">
    {header}
    <div className="min-h-0 flex-1 overflow-y-auto">{inspector}</div>
    {unsaved}
  </aside>;
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`ตรวจข้อ ${row.item}`} className="fixed inset-0 z-[1100] flex flex-col bg-ground">
    {header}
    <div className="min-h-0 flex-1 overflow-hidden sm:p-3">{inspector}</div>
    {unsaved}
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

// Beside the table everything stacks in one column (comparison, decision, evidence);
// full screen it splits into comparison + decision on the left and evidence on the right.
function RowInspector({ jobId, row, layout, decisionForm }: { jobId: string; row: SocReviewRow; layout: "stack" | "split"; decisionForm: ReactNode }) {
  const [pane, setPane] = useState<"comparison" | "evidence">("comparison");
  const comparison = <>
    <ClampedText label="ข้อกำหนด TOR" text={row.torText} empty="ไม่พบข้อความในไฟล์ SOC" />
    <ClampedText label="ข้อเสนอของผู้ยื่น" text={row.proposalText} empty="—" />
    <Verdict row={row} />
  </>;
  const axes = <details className="rounded-input border border-line p-3"><summary className="cursor-pointer text-sm font-medium">รายละเอียดทุกแกน ({row.axes.length})</summary>
    <table className="mt-2 w-full border-collapse text-sm"><tbody>{row.axes.map((axis) => <tr key={axis.key} className="border-t border-line align-top">
      <td className="w-40 py-1.5 pr-2 text-label">{axis.label}</td>
      <td className={`w-28 py-1.5 pr-2 font-medium ${axis.ok ? "" : "text-amber-700 dark:text-amber-400"}`}>{axis.ok ? "" : "• "}{socAxisValueLabel(axis.value ?? "not_applicable")}</td>
      <td className="py-1.5 text-xs text-muted">{axis.detail}</td>
    </tr>)}</tbody></table>
  </details>;
  if (layout === "stack") return <div className="flex flex-col gap-3 p-4">
    {comparison}
    <div className="rounded-input border border-line bg-ground p-3">{decisionForm}</div>
    <PdfEvidence jobId={jobId} row={row} />
    {axes}
  </div>;
  const tab = (value: typeof pane, text: string) => <button type="button" role="tab" aria-selected={pane === value} onClick={() => setPane(value)} className={`ui-btn px-3 py-2 text-sm font-medium ${pane === value ? "bg-ink text-ground" : "bg-surface text-label"}`}>{text}</button>;
  // Narrow: tabs / the picked pane / the decision. Wide: comparison over the decision on the left, evidence on the right.
  return <div className="mx-auto grid h-full max-w-[1600px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-surface shadow-card sm:rounded-card md:grid-cols-[minmax(20rem,2fr)_minmax(24rem,3fr)] md:grid-rows-[minmax(0,1fr)_auto]">
    <div role="tablist" aria-label="ส่วนของพื้นที่ตรวจ" className="grid grid-cols-2 border-b border-line md:hidden">{tab("comparison", "รายละเอียดเทียบ")}{tab("evidence", "เอกสารอ้างอิง")}</div>
    <section role="region" aria-label="รายละเอียดเทียบ" className={`${pane === "comparison" ? "flex" : "hidden"} min-h-0 flex-col gap-3 overflow-y-auto p-4 md:col-start-1 md:row-start-1 md:flex md:border-r md:border-line`}>
      {comparison}
      {axes}
    </section>
    <section role="region" aria-label="เอกสารอ้างอิง" className={`${pane === "evidence" ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto bg-ground p-3 md:col-start-2 md:row-span-2 md:row-start-1 md:flex`}>
      <PdfEvidence jobId={jobId} row={row} />
    </section>
    <div className="border-t border-line bg-surface p-3 md:col-start-1 md:row-start-2 md:border-r">{decisionForm}</div>
  </div>;
}

// Long TOR or proposal text shows its first lines, so the verdict below stays in view.
function ClampedText({ label, text, empty }: { label: string; text: string | null; empty: string }) {
  const [open, setOpen] = useState(false);
  const long = !!text && (text.length > 280 || text.split("\n").length > 5);
  return <div className="rounded-input border border-line p-3 text-sm">
    <div className="text-xs font-semibold text-label">{label}</div>
    {text ? <p className={`mt-1 whitespace-pre-wrap leading-relaxed ${long && !open ? "line-clamp-5" : ""}`}>{text}</p> : <p className="mt-1 text-muted">{empty}</p>}
    {long ? <button type="button" onClick={() => setOpen(!open)} className="ui-btn mt-1 text-xs text-label underline hover:text-ink">{open ? "ย่อ" : "แสดงทั้งหมด"}</button> : null}
  </div>;
}

// What the bidder ticked against what the system recommends, and why (Claude's summary).
function Verdict({ row }: { row: SocReviewRow }) {
  const same = row.declaredSelection === row.systemRecommendation;
  const tone = row.status === "fail" ? "border-danger-border" : row.status === "review" ? "border-amber-300 dark:border-amber-700" : "border-line";
  return <div className={`rounded-input border-2 bg-ground p-3 text-sm ${tone}`}>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {row.declaredSelection ? <>
        <span>ผู้ยื่นติ๊ก <span className="font-semibold">{socAxisValueLabel(row.declaredSelection)}</span></span>
        <span className={same ? "text-muted" : "font-bold text-danger"} title={same ? "ตรงกัน" : "ไม่ตรงกัน"}>{same ? "=" : "≠"}</span>
      </> : null}
      <span>ระบบแนะนำ <span className="font-semibold">{socAxisValueLabel(row.systemRecommendation)}</span></span>
      <span className="ml-auto text-[11px] text-muted">Claude · confidence {row.confidence || "—"}</span>
    </div>
    <p className="mt-1.5 leading-relaxed">{row.detail}</p>
    {row.keyIssue && row.keyIssue !== row.detail ? <p className="mt-1 text-label">ประเด็นหลัก: {row.keyIssue}</p> : null}
    {row.reasons.length ? <div className="mt-2 flex flex-wrap gap-1.5">{row.reasons.map((reason) => <span key={reason} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{reason}</span>)}</div> : null}
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
  const pan = useDragToPan();

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
  const zoomButton = "ui-btn rounded px-2 py-1 hover:bg-hover";
  return <div data-slot="pdf-evidence" className="flex flex-col gap-2">
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-input border border-line bg-surface px-2.5 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate" title={row.reference || undefined}><span className="font-semibold text-label">อ้างอิง</span> <span className="text-muted">{row.reference || "ไม่ได้ระบุ"}</span></span>
      {shown && pages.length === 1 ? <span className="font-medium text-label">หน้า {shown.page}</span> : null}
      {shown ? <span className="flex items-center gap-0.5">
        <button type="button" aria-label="ย่อเอกสาร" onClick={() => setZoom((value) => Math.max(50, (value === "fit" ? 100 : value) - 25))} className={zoomButton}>−</button>
        <span className="min-w-10 text-center tabular-nums text-muted">{zoom === "fit" ? "พอดี" : `${zoom}%`}</span>
        <button type="button" aria-label="ขยายเอกสาร" onClick={() => setZoom((value) => Math.min(200, (value === "fit" ? 100 : value) + 25))} className={zoomButton}>＋</button>
        <button type="button" aria-label="พอดีความกว้าง" title="พอดีความกว้าง" onClick={() => setZoom("fit")} className={`${zoomButton} text-label`}>⤢</button>
      </span> : null}
      {documents.map((d) => <a key={d.id} href={`/api/soc/documents/${d.id}`} target="_blank" rel="noreferrer" title={`เปิด ${d.name} ทั้งไฟล์`} className="whitespace-nowrap text-label underline hover:text-ink">{documents.length > 1 ? `${fileName(d.name)} ↗` : "เปิด PDF ↗"}</a>)}
    </div>
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
      : <div {...pan} title="คลิกค้างแล้วลากเพื่อเลื่อนหน้า" className="relative min-h-40 cursor-grab touch-auto overflow-auto rounded-input border border-line bg-white select-none active:cursor-grabbing">
        {/* Under the image, so it shows only until the page has loaded. */}
        <p className="absolute inset-x-0 top-0 p-3 text-xs text-muted">กำลังโหลดหน้า {shown.page}…</p>
        {/* A server-rendered PNG behind an access check; next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt={`${shown.document.name} หน้า ${shown.page}`} data-zoom={zoom} draggable={false} style={zoom === "fit" ? undefined : { width: `${zoom}%` }} className={`relative block h-auto bg-white ${zoom === "fit" ? "w-full" : "max-w-none"}`} onError={(event) => explainFailure(src, event.currentTarget.src)}
          // An image that failed before hydration never fires onError.
          ref={(img) => { if (img?.complete && img.naturalWidth === 0) explainFailure(src); }} />
      </div>}
    {/* The skill reports no highlight positions, only what it found highlighted. */}
    {highlight?.detail && highlight.detail !== "—" ? <p className="text-xs leading-relaxed text-muted"><span className="font-semibold text-label">Highlight ({socAxisValueLabel(highlight.value ?? "not_applicable")}):</span> {highlight.detail}</p> : null}
  </div>;
}

// The nearest box that scrolls along an axis: the page frame itself once
// zoomed past its width, else the pane or page it sits in ("พอดี" is as
// wide as the frame but taller than the pane).
function scrollerFor(element: HTMLElement, axis: "x" | "y"): HTMLElement | null {
  for (let box: HTMLElement | null = element; box; box = box.parentElement) {
    const overflow = getComputedStyle(box)[axis === "x" ? "overflowX" : "overflowY"];
    const room = axis === "x" ? box.scrollWidth - box.clientWidth : box.scrollHeight - box.clientHeight;
    if (room > 0 && (overflow === "auto" || overflow === "scroll")) return box;
  }
  return document.scrollingElement as HTMLElement | null;
}

// Click and drag a zoomed page like a hand tool, instead of hunting for the
// scrollbars. Mouse only: touch already scrolls by dragging.
function useDragToPan() {
  const drag = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      drag.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault(); // no text selection while dragging
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const start = drag.current;
      if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      drag.current = { x: event.clientX, y: event.clientY };
      const horizontal = scrollerFor(event.currentTarget, "x"), vertical = scrollerFor(event.currentTarget, "y");
      if (horizontal) horizontal.scrollLeft -= dx;
      if (vertical) vertical.scrollTop -= dy;
    },
    onPointerUp() { drag.current = null; },
    onPointerCancel() { drag.current = null; },
  };
}

function DecisionForm({ row, decision, note, error, pending, canSave, onDecision, onNote, onSave }: { row: SocReviewRow; decision: string; note: string; error: string; pending: boolean; canSave: boolean; onDecision: (value: string) => void; onNote: (value: string) => void; onSave: () => void }) {
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Final Decision">{SOC_FINAL_DECISIONS.map((value, i) => <button key={value} type="button" role="radio" aria-checked={decision === value} aria-keyshortcuts={String(i + 1)} title={`กด ${i + 1}`} onClick={() => onDecision(value)} className={`ui-btn rounded-input border px-2.5 py-1.5 text-sm transition-colors ${decision === value ? "border-ink bg-accent text-black" : "border-line bg-surface hover:bg-hover"}`}><span className="mr-1 text-[11px] opacity-60">{i + 1}</span>{SOC_FINAL_DECISION_LABELS[value]}</button>)}</div>
    </div>
    <div className="flex items-start gap-2">
      <textarea value={note} onChange={(e) => onNote(e.target.value)} maxLength={SOC_REVIEW_NOTE_MAX} rows={1} aria-label="หมายเหตุของผู้ตรวจ" placeholder="หมายเหตุของผู้ตรวจ (ไม่บังคับ)" className="min-w-0 flex-1 max-h-32 min-h-9 resize-none rounded-input border border-line bg-surface px-2 py-1.5 text-sm leading-relaxed [field-sizing:content]" />
      <Button size="sm" disabled={!canSave} onClick={onSave} title="Ctrl+Enter">{pending ? "กำลังบันทึก…" : row.finalDecision ? "บันทึกการแก้ไข" : "ยืนยันข้อนี้"}</Button>
    </div>
    {error ? <span role="alert" className="text-xs text-danger">{error}</span> : row.finalDecision ? <span className="text-[11px] text-muted">{row.finalDecision === PENDING_FIX ? "บันทึกแล้ว" : "ยืนยันแล้ว"}: {decisionLabel(row.finalDecision)}{row.reviewedByName ? ` โดย ${row.reviewedByName}` : ""}</span> : null}
  </div>;
}
