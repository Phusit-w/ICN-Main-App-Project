"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptFillFromLabelsAction, createReferenceFillVersionAction, decideReferenceFillRowAction, requestReferenceFillAiAction, startReferenceFillAction } from "@/actions/proposal";
import { cancelSocCheckRequest, resumeSocCheckRequestNow } from "@/actions/socCheckRequests";
import { useCheckChoice } from "@/components/CheckChoice";
import Button from "@/components/ui/Button";
import { isOpenCheckRequestState, majorItemStateText } from "@/lib/soc-shared";
import type { FillRowView, ReferenceFillView } from "@/lib/proposal-reference-fill";
import { REFERENCE_STYLE_LABELS, REFERENCE_STYLES, type ReferenceStyle } from "@/lib/reference-fill-text";

export type FillViewData = {
  runId: string; versionNumber: number; createdAt: string;
  rows: FillRowView[];
  found: number; notFound: number; undecided: number; certainUndecided: number;
  style: ReferenceStyle; toWrite: number;
  datasheets: { id: string; name: string }[];
  aiRequests: ReferenceFillView["aiRequests"];
};

const SOURCE_LABELS = { label: "เลขข้อกำกับ", value: "ค่าสเปก", ai: "Claude หา" } as const;
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

type NoneGroup = { key: string | null; label: string | null; rows: FillRowView[] };

// The ไม่พบ rows by the major item they lie in, in SOC order (runs made before
// ticket 10 carry no major item: one group, which Claude can't be asked about).
function noneByItem(rows: FillRowView[]): NoneGroup[] {
  const groups: NoneGroup[] = [];
  for (const row of rows) {
    const key = row.majorItem ?? null;
    let group = groups.find((g) => g.key === key);
    if (!group) groups.push((group = { key, label: row.majorItemLabel ?? null, rows: [] }));
    group.rows.push(row);
  }
  return groups;
}

// ให้ Claude หาอ้างอิง for one major item's ไม่พบ rows that nobody has decided:
// one request on the viewer's SOC Runner (or รอคนรับ), state read like a check's.
// What Claude finds lands in these rows as suggestions to รับ / แก้ / ไม่รับ.
function AiFill({ proposalId, view, group, viewerId, viewerIsAdmin }: { proposalId: string; view: FillViewData; group: NoneGroup; viewerId: string; viewerIsAdmin: boolean }) {
  const router = useRouter();
  const [dialog, decide] = useCheckChoice();
  const [busy, setBusy] = useState<"send" | "cancel" | "resume" | null>(null);
  const [error, setError] = useState("");
  const request = group.key ? view.aiRequests[group.key] ?? null : null;
  const open = request !== null && isOpenCheckRequestState(request.state);
  const asked = group.rows.filter((row) => !row.decision).length;
  const name = group.label ? `ข้อ ${group.label}` : "ข้อนี้";
  async function act(button: "send" | "cancel" | "resume", run: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(button); setError("");
    try {
      const result = await run();
      if (!result.ok) setError(result.error);
    } catch {
      setError("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      router.refresh(); setBusy(null);
    }
  }
  async function send() {
    const picked = await decide({ title: `ให้ Claude หาอ้างอิง ${asked} แถวของ${name}?`, message: "SOC Runner บนเครื่องของคุณจะให้ Claude หาหน้าใน Datasheet ของแถวที่ระบบหาไม่พบ ใช้โควตา Claude ของคุณ Claude หาหน้าให้เท่านั้น ไม่ตัดสินว่าผ่าน TOR และทุกแถวต้องรับ / แก้ / ไม่รับ เองอีกครั้ง", confirmLabel: "ให้ Claude หา" });
    if (!picked || !group.key) return;
    await act("send", () => requestReferenceFillAiAction(proposalId, view.runId, group.key!, picked.toPool));
  }
  async function cancel() {
    if (!request) return;
    await act("cancel", () => cancelSocCheckRequest(request.jobId, request.id));
  }
  const status = request ? majorItemStateText({ state: request.state, request: open ? request : null, failureReason: request.failureReason }, viewerId) : null;
  const mine = request !== null && (request.requestedById === viewerId || viewerIsAdmin);
  return <div className="flex flex-wrap items-center gap-3 rounded-input bg-ground p-3 text-sm">
    {dialog}
    <span className="font-medium">{group.label ? `ข้อ ${group.label}` : "ไม่ทราบข้อ"}: ไม่พบ {group.rows.length} แถว</span>
    {open && status ? <span role="status" className="text-label">Claude หาอ้างอิง: {status.label}{status.detail ? <span className="text-xs text-muted"> · {status.detail}</span> : null}</span>
      : request?.state === "done" ? <span className="text-xs text-muted">Claude หาแล้ว แถวที่เจอแสดงเป็นข้อเสนอ “Claude หา” ด้านบน</span>
        : request?.state === "failed" ? <span role="alert" className="text-xs text-danger">Claude หาไม่สำเร็จ: {request.failureReason || "ไม่ทราบสาเหตุ"}</span> : null}
    <span className="ml-auto flex gap-2">
      {open && request.state === "paused_quota" && mine ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("resume", () => resumeSocCheckRequestNow(request.jobId, request.id))}>{busy === "resume" ? "กำลังสั่ง…" : "ตรวจต่อเลย"}</Button> : null}
      {open && mine ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={cancel}>{busy === "cancel" ? "กำลังยกเลิก…" : "ยกเลิก"}</Button> : null}
      {!open && group.key && asked ? <Button size="sm" disabled={busy !== null} onClick={send} title="หาด้วย SOC Runner บนเครื่องของคุณ">{busy === "send" ? "กำลังส่ง…" : `ให้ Claude หาอ้างอิง (${asked} แถว)`}</Button> : null}
    </span>
    {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
  </div>;
}

// The กรอกอ้างอิง step's review table: the code step's suggestion per row with
// รับ / แก้ / ไม่รับ, the counts on top, and "รับทั้งหมดที่พบจากเลขข้อกำกับ".
// Nothing is written to a SOC file here.
export default function ProposalReferenceFill({ proposalId, currentVersion, blocked, view, viewerId, viewerIsAdmin }: { proposalId: string; currentVersion: number | null; blocked: string | null; view: FillViewData | null; viewerId: string; viewerIsAdmin: boolean }) {
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
    setError(""); setProblems([]); setMade("");
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
      {none.length ? <details className="text-sm"><summary className="cursor-pointer text-label">แถวที่ไม่พบ ({none.length}) — แก้เองได้ หรือให้ Claude หาให้ทีละข้อ</summary>
        <div className="mt-2 flex flex-col gap-4">{noneByItem(none).map((group) => <section key={group.key ?? "none"} className="flex flex-col gap-2">
          <AiFill proposalId={proposalId} view={view} group={group} viewerId={viewerId} viewerIsAdmin={viewerIsAdmin} />
          <ul className="flex flex-col gap-2">{group.rows.map((row) => <FillRow key={`${view.runId}-${row.position}`} proposalId={proposalId} runId={view.runId} row={row} datasheets={view.datasheets} onChanged={(message) => { setError(message ?? ""); router.refresh(); }} />)}</ul>
        </section>)}</div>
      </details> : null}
      {!view.rows.length ? <p className="text-sm text-muted">ไม่มีแถวที่ต้องกรอกอ้างอิงใน SOC ฉบับ {currentVersion}</p> : null}
    </> : null}
  </div>;
}
