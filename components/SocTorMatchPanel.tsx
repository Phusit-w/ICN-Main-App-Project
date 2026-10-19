"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker from "@/components/SocFilePicker";
import type { TorMatchView } from "@/lib/soc-tor";
import { majorItemName, socMajorItemHash, socRowHash } from "@/lib/soc-shared";
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
export default function SocTorMatchPanel({ jobId, torMatch, socReady, reviewRows }: { jobId: string; torMatch: TorMatchView | null; socReady: boolean; reviewRows: number[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [dialog, confirm] = useConfirmDialog();
  async function submit() {
    const file = files[0];
    if (!file) return;
    if (torMatch && !(await confirm({ title: "แทนที่ TOR ต้นฉบับ?", message: `${torMatch.name} และผลเทียบ TOR ต้นฉบับเดิมจะถูกลบ แล้วเทียบ SOC กับ ${file.name} ใหม่`, confirmLabel: "แทนที่", danger: true }))) return;
    setError("");
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("tor", file);
        const response = await fetch(`/api/soc/jobs/${jobId}/tor`, { method: "POST", body: form });
        if (!response.ok) {
          setError(((await response.json().catch(() => null)) as { error?: string } | null)?.error || "แนบ TOR ต้นฉบับไม่สำเร็จ");
          return;
        }
        setFiles([]);
        router.refresh();
      } catch {
        setError("แนบ TOR ต้นฉบับไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }
  const counts = torMatch?.counts;
  return <section id="soc-tor-match" className="rounded-card bg-surface p-5 shadow-card">
    {dialog}
    <h2 className="font-display font-semibold">ตรวจ TOR ตรงต้นฉบับ</h2>
    <p className="mt-1 text-xs text-muted">เทียบข้อความ TOR ในตาราง SOC กับ TOR ต้นฉบับทีละแถว เป็นรายงานเท่านั้น ไม่เปลี่ยนผลตรวจ Datasheet</p>
    {torMatch ? <div className="mt-4 flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-label">TOR ต้นฉบับ</span><a href={`/api/soc/documents/${torMatch.documentId}`} target="_blank" rel="noreferrer" className="min-w-0 break-all text-ink">{torMatch.name}</a></p>
      {torMatch.state === "failed" ? <p role="alert" className="text-sm text-danger">{torMatch.errorMessage || "เทียบ TOR ต้นฉบับไม่สำเร็จ"}</p> : null}
      {counts ? <ul className="flex flex-wrap gap-2" aria-label="จำนวนตามผลเทียบ TOR ต้นฉบับ">{TOR_MATCH_OUTCOMES.map((outcome) => <li key={outcome} title={OUTCOME_HINTS[outcome]} className={`rounded-full px-3 py-1 text-xs font-medium ${ISSUE[outcome] && counts[outcome] ? "border border-danger-border text-danger" : "bg-chip text-label"}`}>{outcome} <span className="tabular-nums">{counts[outcome]}</span></li>)}</ul> : null}
      {torMatch.warnings.length ? <ul role="status" className="list-disc rounded-input border border-danger-border p-3 pl-8 text-sm text-label">{torMatch.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      {torMatch.lines.length ? <IssueList jobId={jobId} lines={torMatch.lines} reviewRows={reviewRows} /> : null}
    </div> : null}
    {/* onSubmit, not a form action: an action is a transition, which holds the replace confirm dialog back until the action ends, and the action waits on the dialog. */}
    {socReady ? <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <SocFilePicker files={files} onChange={setFiles} disabled={pending} label={torMatch ? "เลือก PDF TOR ต้นฉบับฉบับใหม่" : "เลือกไฟล์ PDF ของ TOR ต้นฉบับ"} accept=".pdf,application/pdf" />
      <p className="text-xs text-muted">ตอนนี้รองรับ PDF ที่มีข้อความ (TOR ต้นฉบับแบบสแกนกำลังพัฒนา)</p>
      {files.length ? <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังเทียบกับ SOC…" : torMatch ? "แทนที่ TOR ต้นฉบับ" : "แนบ TOR ต้นฉบับ"}</Button></div> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </form> : <p className="mt-4 text-xs text-muted">แนบ TOR ต้นฉบับได้หลังอ่านตาราง SOC ครบแล้ว</p>}
  </section>;
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
      {line.claudeOutcome ? <span className="text-label">Claude: <span className="font-medium text-ink">{line.claudeOutcome}</span>{line.claudeReason ? ` · ${line.claudeReason}` : ""}</span> : null}
    </div>
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
