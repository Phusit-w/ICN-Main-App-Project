"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptFillFromLabelsAction, createReferenceFillVersionAction, decideReferenceFillRowAction, startReferenceFillAction } from "@/actions/proposal";
import Button from "@/components/ui/Button";
import type { FillRowView } from "@/lib/proposal-reference-fill";
import { REFERENCE_STYLE_LABELS, REFERENCE_STYLES, type ReferenceStyle } from "@/lib/reference-fill-text";

export type FillViewData = {
  runId: string; versionNumber: number; createdAt: string;
  rows: FillRowView[];
  found: number; notFound: number; undecided: number; certainUndecided: number;
  style: ReferenceStyle; toWrite: number;
  datasheets: { id: string; name: string }[];
};

const SOURCE_LABELS = { label: "เลขข้อกำกับ", value: "ค่าสเปก" } as const;
const small = "inline-flex h-8 items-center rounded-input bg-chip px-3 text-xs font-medium text-ink hover:bg-hover disabled:opacity-60";

// A page of a Datasheet in the viewer the review page uses (one PNG per page).
function PageViewer({ proposalId, datasheetId, page }: { proposalId: string; datasheetId: string; page: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="alert" className="mt-2 text-xs text-danger">แสดงหน้า {page} ไม่ได้ ไฟล์อาจไม่มีหน้านี้</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/proposals/${proposalId}/datasheets/${datasheetId}/pages/${page}`} alt={`หน้า ${page} ของ Datasheet`} onError={() => setFailed(true)} className="mt-2 max-h-[70vh] max-w-full rounded-input border border-line" />;
}

function FillRow({ proposalId, runId, row, datasheets, onChanged }: { proposalId: string; runId: string; row: FillRowView; datasheets: FillViewData["datasheets"]; onChanged: (error?: string) => void }) {
  const [choice, setChoice] = useState(row.decision?.choice ?? 0);
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(row.decision?.datasheetId ?? row.suggestions[0]?.datasheetId ?? datasheets[0]?.id ?? "");
  const [pages, setPages] = useState(row.decision?.pages ?? (row.suggestions[0] ? String(row.suggestions[0].page) : ""));
  const [pending, startTransition] = useTransition();
  const shown = row.suggestions[choice] ?? row.suggestions[0];
  const decision = row.decision;
  function decide(input: Parameters<typeof decideReferenceFillRowAction>[3]) {
    startTransition(async () => {
      const result = await decideReferenceFillRowAction(proposalId, runId, row.position, input);
      if (result.ok) setEditing(false);
      onChanged(result.ok ? undefined : result.error);
    });
  }
  const editedName = decision?.status === "edited" ? datasheets.find((candidate) => candidate.id === decision.datasheetId)?.name ?? "?" : null;
  const accepted = decision?.status === "accepted" ? row.suggestions[decision.choice ?? 0] : null;
  return <li className="rounded-input border border-line p-3 text-sm" data-testid={`fill-row-${row.position}`}>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-medium">{row.item || `แถว ${row.position}`}</span>
      <span className="min-w-0 flex-1 text-xs text-muted [overflow-wrap:anywhere]">{row.tor.length > 200 ? `${row.tor.slice(0, 200)}…` : row.tor}</span>
    </div>
    {row.kind === "title_only" ? <p className="mt-1 text-xs text-muted">อ้างอิงเดิม (ไม่มีหน้า): {row.reference}</p> : null}
    {shown ? <div className="mt-2">
      <p>
        <strong>{shown.documentName} · หน้า {shown.page}</strong>{" "}
        <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-label">{SOURCE_LABELS[shown.source]}</span>
      </p>
      <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">“{shown.snippet}”</p>
      {row.suggestions.length > 1 ? <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="ทางเลือก">
        {row.suggestions.map((suggestion, i) => <button key={i} type="button" aria-pressed={i === choice} onClick={() => setChoice(i)} disabled={pending || Boolean(decision)}
          className={`${small} ${i === choice ? "outline outline-2 outline-ink" : ""}`}>{i === 0 ? "แนะนำ" : `ทางเลือก ${i}`}: {suggestion.documentName} · หน้า {suggestion.page}</button>)}
      </div> : null}
    </div> : <p className="mt-2 text-xs text-muted">ไม่พบ{row.kind === "title_only" ? " (ไม่พบหน้าในเอกสารที่อ้างถึง)" : ""}</p>}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {decision ? <>
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-black">
          {decision.status === "accepted" && accepted ? `รับแล้ว: ${accepted.documentName} · หน้า ${accepted.page}` : decision.status === "edited" ? `แก้แล้ว: ${editedName} · หน้า ${decision.pages}` : "ไม่รับ"}
        </span>
        <button type="button" className={small} disabled={pending} onClick={() => decide({ status: "undecided" })}>ยกเลิกการตัดสิน</button>
      </> : <>
        {shown ? <Button size="sm" disabled={pending} onClick={() => decide({ status: "accepted", choice })}>รับ</Button> : null}
        <button type="button" className={small} disabled={pending} onClick={() => setEditing(!editing)}>แก้</button>
        {shown ? <button type="button" className={small} disabled={pending} onClick={() => decide({ status: "rejected" })}>ไม่รับ</button> : null}
      </>}
      {shown ? <button type="button" className={small} onClick={() => setViewing(!viewing)} aria-expanded={viewing}>{viewing ? "ซ่อนหน้า" : "ดูหน้า"}</button> : null}
    </div>
    {editing ? <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); decide({ status: "edited", datasheetId: sheet, pages }); }}>
      <select value={sheet} onChange={(event) => setSheet(event.target.value)} aria-label="เอกสาร" className="h-9 max-w-full rounded-input border border-line bg-ground px-2 text-sm">
        {datasheets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
      <input value={pages} onChange={(event) => setPages(event.target.value)} placeholder="หน้า เช่น 3, 6 หรือ 12-13" aria-label="หน้า" className="h-9 w-48 rounded-input border border-line bg-ground px-3 text-sm" />
      <Button size="sm" type="submit" disabled={pending || !sheet || !pages.trim()}>บันทึก</Button>
    </form> : null}
    {viewing && shown ? <PageViewer proposalId={proposalId} datasheetId={shown.datasheetId} page={shown.page} /> : null}
  </li>;
}

// The กรอกอ้างอิง step's review table: the code step's suggestion per row with
// รับ / แก้ / ไม่รับ, the counts on top, and "รับทั้งหมดที่พบจากเลขข้อกำกับ".
// Nothing is written to a SOC file here.
export default function ProposalReferenceFill({ proposalId, currentVersion, blocked, view }: { proposalId: string; currentVersion: number | null; blocked: string | null; view: FillViewData | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [style, setStyle] = useState<ReferenceStyle | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [made, setMade] = useState("");
  function create(runId: string, chosen: ReferenceStyle) {
    setError(""); setProblems([]); setMade("");
    startTransition(async () => {
      const result = await createReferenceFillVersionAction(proposalId, runId, chosen);
      if (result.ok) setMade(`สร้าง SOC ฉบับ ${result.versionNumber} แล้ว (เขียน ${result.written} แถว)`);
      else { setError(result.error); setProblems(result.problems ?? []); }
      router.refresh();
    });
  }
  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }
  const found = view?.rows.filter((row) => row.suggestions.length) ?? [];
  const none = view?.rows.filter((row) => !row.suggestions.length) ?? [];
  return <div className="mt-3 flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={pending || Boolean(blocked)} onClick={() => run(() => startReferenceFillAction(proposalId))}>{pending ? "กำลังค้นหา…" : view ? "ค้นหาใหม่" : "ค้นหาอ้างอิง"}</Button>
      {blocked ? <span className="text-xs text-muted">{blocked}</span> : null}
      {view && view.certainUndecided > 0 ? <button type="button" className={small} disabled={pending} onClick={() => run(() => acceptFillFromLabelsAction(proposalId, view.runId))}>รับทั้งหมดที่พบจากเลขข้อกำกับ ({view.certainUndecided})</button> : null}
    </div>
    {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    {problems.length ? <ul className="list-disc pl-5 text-xs text-danger">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : null}
    {made ? <p role="status" className="text-xs text-label">{made}</p> : null}
    {view ? <>
      <p className="text-sm" aria-live="polite">SOC ฉบับ {view.versionNumber}: <strong>พบ {view.found}</strong> / <strong>ไม่พบ {view.notFound}</strong>{view.found ? ` · รอตัดสิน ${view.undecided} แถว` : ""}</p>
      <div className="flex flex-wrap items-center gap-3 rounded-input bg-chip p-3 text-sm">
        <fieldset className="flex items-center gap-3"><legend className="sr-only">รูปแบบอ้างอิง</legend>
          <span className="text-label">รูปแบบ:</span>
          {REFERENCE_STYLES.map((option) => <label key={option} className="flex items-center gap-1"><input type="radio" name={`style-${view.runId}`} checked={(style ?? view.style) === option} onChange={() => setStyle(option)} />{REFERENCE_STYLE_LABELS[option]}</label>)}
        </fieldset>
        <Button size="sm" disabled={pending || view.toWrite === 0} onClick={() => create(view.runId, style ?? view.style)}>สร้างฉบับ SOC ใหม่ ({view.toWrite} แถว)</Button>
        <span className="text-xs text-muted">เขียนเฉพาะแถวที่รับหรือแก้ แถวอื่นเว้นว่างไว้ ไม่ต้องตัดสินครบทุกแถว</span>
      </div>
      {found.length ? <ul className="flex flex-col gap-2">{found.map((row) => <FillRow key={`${view.runId}-${row.position}`} proposalId={proposalId} runId={view.runId} row={row} datasheets={view.datasheets} onChanged={(message) => { setError(message ?? ""); router.refresh(); }} />)}</ul> : null}
      {none.length ? <details className="text-sm"><summary className="cursor-pointer text-label">แถวที่ไม่พบ ({none.length}) — แก้เองได้</summary>
        <ul className="mt-2 flex flex-col gap-2">{none.map((row) => <FillRow key={`${view.runId}-${row.position}`} proposalId={proposalId} runId={view.runId} row={row} datasheets={view.datasheets} onChanged={(message) => { setError(message ?? ""); router.refresh(); }} />)}</ul>
      </details> : null}
      {!view.rows.length ? <p className="text-sm text-muted">ไม่มีแถวที่ต้องกรอกอ้างอิงใน SOC ฉบับ {currentVersion}</p> : null}
    </> : null}
  </div>;
}
