"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { cancelSocTorRead, resumeSocTorRead } from "@/actions/soc";
import { cancelSocCheckRequest, requestSocTorJudge, resumeSocCheckRequestNow } from "@/actions/socCheckRequests";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker from "@/components/SocFilePicker";
import type { TorMatchView } from "@/lib/soc-tor";
import { isOpenCheckRequestState, majorItemName, majorItemStateText, socMajorItemHash, socRowHash } from "@/lib/soc-shared";
import { torDiff, type DiffPart } from "@/lib/soc-tor-diff";
import { TOR_MATCH_OUTCOMES, type TorMatchOutcome } from "@/lib/soc-tor-match";

const OUTCOME_HINTS: Record<TorMatchOutcome, string> = {
  "ตรง": "ข้อความตรงกับ TOR ต้นฉบับ",
  "ต่างแค่รูปแบบ": "ต่างแค่เลขไทย/อารบิก เครื่องหมายวรรคตอน หรือการขึ้นบรรทัด",
  "ความหมายต่าง": "ตัวเลข คำ หรือเครื่องหมายเปรียบเทียบต่างจาก TOR ต้นฉบับ",
  "ไม่พบใน SOC": "ข้อความใน TOR ต้นฉบับที่ไม่มีแถวใดใน SOC",
  "ไม่พบใน TOR": "แถวใน SOC ที่หาไม่พบใน TOR ต้นฉบับ ไม่นับว่าผิดอัตโนมัติ",
  "ยืนยันไม่ได้": "แถวรูปภาพ แถวบนหน้า TOR ต้นฉบับที่เป็นรูป หรือข้อความที่ใกล้เคียงไม่พอจะสรุป",
};
const ISSUE: Record<TorMatchOutcome, boolean> = { "ตรง": false, "ต่างแค่รูปแบบ": false, "ความหมายต่าง": true, "ไม่พบใน SOC": true, "ไม่พบใน TOR": true, "ยืนยันไม่ได้": true };

// TOR Match (ตรวจ TOR ตรงต้นฉบับ): attach the TOR ต้นฉบับ, see the counts per
// outcome and the lines with an issue side by side. A report only: it never
// changes the datasheet check above. `socReady`: the SOC is fully read (a
// scanned PDF SOC may still be reading). `reviewRows`: the SOC rows the
// review panel below shows, which a line links to (`#soc-row-N`).
export default function SocTorMatchPanel({ jobId, torMatch, socReady, reviewRows, viewerId, viewerIsAdmin }: { jobId: string; torMatch: TorMatchView | null; socReady: boolean; reviewRows: number[]; viewerId: string; viewerIsAdmin: boolean }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dialog, confirm] = useConfirmDialog();
  // Not in a transition: a transition would hold the confirm dialogs back until it ended.
  async function submit() {
    const file = files[0];
    if (!file) return;
    if (torMatch && !(await confirm({ title: "แทนที่ TOR ต้นฉบับ?", message: `${torMatch.name} และผลเทียบ TOR ต้นฉบับเดิมจะถูกลบ แล้วเทียบ SOC กับ ${file.name} ใหม่`, confirmLabel: "แทนที่", danger: true }))) return;
    setError("");
    setPending(true);
    try {
      const form = new FormData();
      form.set("tor", file);
      const send = async () => {
        const response = await fetch(`/api/soc/jobs/${jobId}/tor`, { method: "POST", body: form });
        return { ok: response.ok, body: ((await response.json().catch(() => null)) ?? {}) as { error?: string; needsOcrConfirm?: boolean } };
      };
      let answer = await send();
      if (answer.body.needsOcrConfirm) {
        // A scanned TOR goes to an outside OCR service: ask every time; cancel stores and sends nothing.
        if (!(await confirm({ title: "ไฟล์นี้จะส่งไป OCR ภายนอก", message: "TOR ต้นฉบับนี้เป็น PDF แบบสแกน ระบบจะส่งภาพของแต่ละหน้าไปอ่านที่บริการ OCR ภายนอก (Typhoon) อ่านในเบื้องหลังต่อคิวหลังงานอ่านอื่น (ประมาณ 2 วินาทีต่อหน้า) แล้วจึงเทียบกับ SOC ผลอ่านอาจคลาดเคลื่อน ต้องการดำเนินการต่อหรือไม่", confirmLabel: "ยืนยันและส่ง OCR" }))) return;
        form.set("ocrConfirmed", "1");
        answer = await send();
      }
      if (!answer.ok) {
        setError(answer.body.error || "แนบ TOR ต้นฉบับไม่สำเร็จ");
        return;
      }
      setFiles([]);
      router.refresh();
    } catch {
      setError("แนบ TOR ต้นฉบับไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(false);
    }
  }
  const counts = torMatch?.counts;
  return <section id="soc-tor-match" className="rounded-card bg-surface p-5 shadow-card">
    {dialog}
    <h2 className="font-display font-semibold">ตรวจ TOR ตรงต้นฉบับ</h2>
    <p className="mt-1 text-xs text-muted">เทียบข้อความ TOR ในตาราง SOC กับ TOR ต้นฉบับทีละแถว เป็นรายงานเท่านั้น ไม่เปลี่ยนผลตรวจ Datasheet</p>
    {torMatch ? <div className="mt-4 flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-label">TOR ต้นฉบับ</span><a href={`/api/soc/documents/${torMatch.documentId}`} target="_blank" rel="noreferrer" className="min-w-0 break-all text-ink">{torMatch.name}</a></p>
      {torMatch.state === "reading" ? <ReadProgress jobId={jobId} stage={torMatch.stage} /> : null}
      {torMatch.state === "failed" ? <ReadFailed jobId={jobId} message={torMatch.errorMessage} /> : null}
      {counts ? <ul className="flex flex-wrap gap-2" aria-label="จำนวนตามผลเทียบ TOR ต้นฉบับ">{TOR_MATCH_OUTCOMES.map((outcome) => <li key={outcome} title={OUTCOME_HINTS[outcome]} className={`rounded-full px-3 py-1 text-xs font-medium ${ISSUE[outcome] && counts[outcome] ? "border border-danger-border text-danger" : "bg-chip text-label"}`}>{outcome} <span className="tabular-nums">{counts[outcome]}</span></li>)}</ul> : null}
      {torMatch.state === "ready" && counts ? <p><a href={`/api/soc/jobs/${jobId}/tor/excel`} title="ไฟล์ Excel: จำนวนตามผลเทียบ แล้วทุกแถวที่ไม่ตรง พร้อมผลและเหตุผลของ Claude" className="inline-block rounded-input border border-line bg-surface px-4 py-2 text-sm font-medium text-ink no-underline hover:bg-hover">ดาวน์โหลดผลเทียบ TOR (Excel)</a></p> : null}
      {torMatch.warnings.length ? <ul role="status" className="list-disc rounded-input border border-danger-border p-3 pl-8 text-sm text-label">{torMatch.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      {torMatch.state === "ready" ? <ClaudeJudge jobId={jobId} judgeable={torMatch.judgeable} judge={torMatch.judge} viewerId={viewerId} viewerIsAdmin={viewerIsAdmin} /> : null}
      {torMatch.lines.length ? <IssueList jobId={jobId} lines={torMatch.lines} reviewRows={reviewRows} /> : null}
    </div> : null}
    {/* onSubmit, not a form action: an action is a transition, which holds the replace confirm dialog back until the action ends, and the action waits on the dialog. */}
    {socReady ? <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <SocFilePicker files={files} onChange={setFiles} disabled={pending} label={torMatch ? "เลือก PDF TOR ต้นฉบับฉบับใหม่" : "เลือกไฟล์ PDF ของ TOR ต้นฉบับ"} accept=".pdf,application/pdf" />
      <p className="text-xs text-muted">PDF แบบสแกนจะถามยืนยันก่อนส่งไปอ่านที่บริการ OCR ภายนอก</p>
      {files.length ? <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังเทียบกับ SOC…" : torMatch ? "แทนที่ TOR ต้นฉบับ" : "แนบ TOR ต้นฉบับ"}</Button></div> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </form> : <p className="mt-4 text-xs text-muted">แนบ TOR ต้นฉบับได้หลังอ่านตาราง SOC ครบแล้ว</p>}
  </section>;
}

// A scanned TOR being read: where the read is, and a cancel that keeps the pages read.
function ReadProgress({ jobId, stage }: { jobId: string; stage: string | null }) {
  const router = useRouter();
  const [dialog, confirm] = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    if (!(await confirm({ title: "ยกเลิกการอ่าน TOR ต้นฉบับ?", message: "การอ่านจะหยุดทันที หน้าที่อ่านไปแล้วยังเก็บไว้ อ่านต่อภายหลังได้", confirmLabel: "ยืนยันยกเลิก", cancelLabel: "ไม่ยกเลิก", danger: true }))) return;
    setBusy(true);
    setError("");
    try {
      await cancelSocTorRead(jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ยกเลิกการอ่านไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      router.refresh();
      setBusy(false);
    }
  }
  return <div role="status" className="flex flex-wrap items-center gap-3 rounded-input bg-ground p-3 text-sm">
    {dialog}
    <span className="font-medium">{stage || "กำลังอ่าน TOR ต้นฉบับ"}</span>
    <span className="text-xs text-muted">อ่านด้วย OCR ในเบื้องหลัง อ่านเสร็จแล้วจะเทียบกับ SOC ให้เอง ปิดหน้านี้แล้วกลับมาดูภายหลังได้</span>
    <Button className="ml-auto" variant="outline" size="sm" disabled={busy} onClick={cancel}>{busy ? "กำลังยกเลิก…" : "ยกเลิกการอ่าน"}</Button>
    {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
  </div>;
}

// A scanned TOR whose read failed or was cancelled: the reason, and a resume from the pages read.
function ReadFailed({ jobId, message }: { jobId: string; message: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function resume() {
    setBusy(true);
    setError("");
    try {
      await resumeSocTorRead(jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "อ่านต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      router.refresh();
      setBusy(false);
    }
  }
  return <div className="flex flex-wrap items-center gap-3">
    <p role="alert" className="text-sm text-danger">{message || "อ่าน TOR ต้นฉบับไม่สำเร็จ"}</p>
    <Button size="sm" disabled={busy} onClick={resume}>{busy ? "กำลังเริ่ม…" : "อ่านต่อ"}</Button>
    {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
  </div>;
}

// The Claude step (decisions 13, 23): the lines code left as ความหมายต่าง or
// ยืนยันไม่ได้ go to Claude on the viewer's SOC Runner as one request. Its
// state reads as a major item's check; Claude's outcome and reason show on
// each line below.
function ClaudeJudge({ jobId, judgeable, judge, viewerId, viewerIsAdmin }: { jobId: string; judgeable: number; judge: TorMatchView["judge"]; viewerId: string; viewerIsAdmin: boolean }) {
  const router = useRouter();
  const [dialog, confirm] = useConfirmDialog();
  // The button whose action is running, for its label; every button waits meanwhile.
  const [busy, setBusy] = useState<"send" | "cancel" | "resume" | null>(null);
  const [error, setError] = useState("");
  const open = judge !== null && isOpenCheckRequestState(judge.state);
  async function act(button: "send" | "cancel" | "resume", run: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(button);
    setError("");
    try {
      const result = await run();
      if (!result.ok) setError(result.error);
    } catch {
      setError("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      router.refresh();
      setBusy(null);
    }
  }
  async function send() {
    if (!(await confirm({ title: `ส่ง ${judgeable} แถวให้ Claude ตัดสิน?`, message: "SOC Runner บนเครื่องของคุณจะให้ Claude ดูแถวที่ระบบเทียบเองแล้วสรุปไม่ได้ (ความหมายต่าง และยืนยันไม่ได้) พร้อมภาพหน้า TOR ต้นฉบับเมื่อเป็น PDF สแกนหรือหน้าที่เป็นรูป ใช้โควตา Claude ของคุณ ผลของระบบยังแสดงไว้คู่กัน", confirmLabel: "ส่งให้ Claude" }))) return;
    await act("send", () => requestSocTorJudge(jobId));
  }
  async function cancel() {
    if (!judge || !(await confirm({ title: "ยกเลิกให้ Claude ตัดสิน?", message: judge.state === "requested" ? "คำขอนี้จะถูกยกเลิก" : "SOC Runner จะหยุดภายในประมาณ 30 วินาที โควตา Claude ที่ใช้ไปแล้วจะไม่ได้คืน", confirmLabel: "ยืนยันยกเลิก", cancelLabel: "ไม่ยกเลิก", danger: true }))) return;
    await act("cancel", () => cancelSocCheckRequest(jobId, judge.id));
  }
  const status = judge ? majorItemStateText({ state: judge.state, request: open ? judge : null, failureReason: judge.failureReason }, viewerId) : null;
  return <div className="flex flex-wrap items-center gap-3 rounded-input bg-ground p-3 text-sm">
    {dialog}
    <span className="font-medium">Claude ตัดสินแถวที่ระบบสรุปไม่ได้</span>
    {open && status ? <span role="status" className="text-label">{status.label}{status.detail ? <span className="text-xs text-muted"> · {status.detail}</span> : null}</span>
      : judge?.state === "done" ? <span className="text-xs text-muted">ตัดสินแล้ว {judge.lineCount} แถว ดูผลที่แต่ละแถวด้านล่าง</span>
        : judge?.state === "failed" ? <span role="alert" className="text-xs text-danger">ไม่สำเร็จ: {judge.failureReason || "ไม่ทราบสาเหตุ"}</span>
          : <span className="text-xs text-muted">{judgeable ? `${judgeable} แถว (ความหมายต่าง และยืนยันไม่ได้)` : "ไม่มีแถวที่ต้องให้ Claude ตัดสิน"}</span>}
    <span className="ml-auto flex gap-2">
      {open && judge.state === "paused_quota" && (judge.requestedById === viewerId || viewerIsAdmin) ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("resume", () => resumeSocCheckRequestNow(jobId, judge.id))}>{busy === "resume" ? "กำลังสั่ง…" : "ตรวจต่อเลย"}</Button> : null}
      {open && (judge.requestedById === viewerId || viewerIsAdmin) ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={cancel}>{busy === "cancel" ? "กำลังยกเลิก…" : "ยกเลิก"}</Button> : null}
      {!open && judgeable ? <Button size="sm" disabled={busy !== null} onClick={send} title="ตัดสินด้วย SOC Runner บนเครื่องของคุณ">{busy === "send" ? "กำลังส่ง…" : judge?.state === "done" ? `ให้ Claude ตัดสินใหม่ (${judgeable} แถว)` : `ส่งให้ Claude ตัดสิน (${judgeable} แถว)`}</Button> : null}
    </span>
    {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
  </div>;
}

type Line = TorMatchView["lines"][number];
const filterChip = (on: boolean) => `ui-btn rounded-full px-3 py-1.5 text-xs tabular-nums transition-colors ${on ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`;

// Every line but ตรง (a toggle adds those), or one outcome's, SOC and TOR side
// by side with the changed words marked.
function IssueList({ jobId, lines, reviewRows }: { jobId: string; lines: Line[]; reviewRows: number[] }) {
  const [outcome, setOutcome] = useState<TorMatchOutcome | "all">("all");
  const [withMatched, setWithMatched] = useState(false);
  const reviewable = new Set(reviewRows);
  const count = (o: TorMatchOutcome) => lines.filter((line) => line.outcome === o).length;
  const shown = lines.filter((line) => (outcome === "all" ? withMatched || line.outcome !== "ตรง" : line.outcome === outcome));
  return <div className="flex flex-col gap-3 border-t border-line pt-4">
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามผลเทียบ">
      <button type="button" aria-pressed={outcome === "all"} onClick={() => setOutcome("all")} className={filterChip(outcome === "all")}>ทุกผลยกเว้นตรง</button>
      {TOR_MATCH_OUTCOMES.map((o) => <button key={o} type="button" aria-pressed={outcome === o} onClick={() => setOutcome(o)} title={OUTCOME_HINTS[o]} className={filterChip(outcome === o)}>{o} ({count(o)})</button>)}
      {outcome === "all" ? <label className="ml-auto flex items-center gap-1.5 text-xs text-label"><input type="checkbox" checked={withMatched} onChange={(e) => setWithMatched(e.target.checked)} />แสดงแถวที่ตรงด้วย</label> : null}
    </div>
    {shown.length ? <ul className="flex max-h-[70vh] flex-col overflow-auto rounded-input border border-line">{shown.map((line) => <IssueLine key={line.id} jobId={jobId} line={line} reviewable={line.socRow !== null && reviewable.has(line.socRow)} />)}</ul>
      : <p className="p-4 text-center text-sm text-muted">ไม่มีแถวในตัวกรองนี้</p>}
  </div>;
}

function IssueLine({ jobId, line, reviewable }: { jobId: string; line: Line; reviewable: boolean }) {
  // Format-only lines have nothing to mark; the rest are diffed once per line.
  const diff = useMemo(() => (line.outcome === "ตรง" || line.outcome === "ต่างแค่รูปแบบ" ? null : torDiff(line.socText, line.torText)), [line]);
  const plain = (text: string | null): DiffPart[] => (text ? [{ text, changed: false }] : []);
  // A SOC row shows its side even with an empty TOR cell; TOR text no row covers has none.
  const soc = line.socRow !== null;
  const tor = line.torText !== null;
  return <li className="flex flex-col gap-2 border-t border-line p-3 first:border-t-0">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span title={OUTCOME_HINTS[line.outcome]} className={`rounded-full px-2 py-0.5 font-medium ${ISSUE[line.outcome] ? "border border-danger-border text-danger" : "bg-chip text-label"}`}>{line.outcome}</span>
      {line.item ? <span className="font-medium">ข้อ {line.item}</span> : null}
      {soc ? reviewable ? <a href={socRowHash(line.socRow!)} onClick={refireSameHash} title="เปิดแถวนี้ในตรวจทานผลด้านล่าง" className="text-label underline hover:text-ink">SOC แถว {line.socRow}</a> : line.majorItemId ? <a href={socMajorItemHash(line.majorItemId)} onClick={refireSameHash} title="แถวนี้ยังไม่มีผลตรวจ ไปที่ข้อใหญ่ของแถวนี้เพื่อกดตรวจ" className="text-label underline hover:text-ink">SOC แถว {line.socRow} · ไปที่{majorItemName(line.majorItemLabel ?? "", "ข้อใหญ่")}</a> : <span className="text-muted" title="แถวนี้ยังไม่มีผลตรวจ จึงยังไม่อยู่ในตรวจทานผล">SOC แถว {line.socRow}</span> : null}
      {line.torPage ? <a href={`/api/soc/jobs/${jobId}/tor/pages/${line.torPage}`} target="_blank" rel="noreferrer" title="เปิดหน้านี้ของ TOR ต้นฉบับ" className="text-label underline hover:text-ink">TOR หน้า {line.torPage} ↗</a> : null}
    </div>
    {/* Claude's verdict on its own line under the row's header, so a long reason reads easily. */}
    {line.claudeOutcome ? <p className="text-xs text-label">Claude: <span className="font-medium text-ink">{line.claudeOutcome}</span>{line.claudeReason ? <span className="mt-0.5 block text-ink">{line.claudeReason}</span> : null}</p> : null}
    <div className={`grid grid-cols-1 gap-2 text-sm ${soc && tor ? "md:grid-cols-2" : ""}`}>
      {soc ? <Side label="SOC" parts={diff ? diff.soc : plain(line.socText)} /> : null}
      {tor ? <Side label="TOR ต้นฉบับ" parts={diff ? diff.tor : plain(line.torText)} /> : null}
    </div>
  </li>;
}

// The browser fires no hashchange for the hash it already has: the review
// panel is told again, so the same row can be opened twice.
function refireSameHash(event: MouseEvent<HTMLAnchorElement>) {
  if (window.location.hash === event.currentTarget.hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function Side({ label, parts }: { label: string; parts: DiffPart[] }) {
  return <div className="min-w-0 rounded-input bg-ground p-2">
    <p className="text-[11px] font-medium text-muted">{label}</p>
    <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{parts.length ? parts.map((part, i) => (part.changed ? <mark key={i} className="rounded-sm bg-danger-border px-0.5 text-danger">{part.text}</mark> : <span key={i}>{part.text}</span>)) : <span className="text-muted">ไม่มีข้อความ</span>}</p>
  </div>;
}
