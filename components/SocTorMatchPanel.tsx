"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker from "@/components/SocFilePicker";
import type { TorMatchView } from "@/lib/soc-tor";
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
// outcome. A report only: it never changes the datasheet check above.
// `socReady`: the SOC is fully read (a scanned PDF SOC may still be reading).
export default function SocTorMatchPanel({ jobId, torMatch, socReady }: { jobId: string; torMatch: TorMatchView | null; socReady: boolean }) {
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
    </div> : null}
    {socReady ? <form action={submit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <SocFilePicker files={files} onChange={setFiles} disabled={pending} label={torMatch ? "เลือก PDF TOR ต้นฉบับฉบับใหม่" : "เลือกไฟล์ PDF ของ TOR ต้นฉบับ"} accept=".pdf,application/pdf" />
      <p className="text-xs text-muted">ตอนนี้รองรับ PDF ที่มีข้อความ (TOR ต้นฉบับแบบสแกนกำลังพัฒนา)</p>
      {files.length ? <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังเทียบกับ SOC…" : torMatch ? "แทนที่ TOR ต้นฉบับ" : "แนบ TOR ต้นฉบับ"}</Button></div> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </form> : <p className="mt-4 text-xs text-muted">แนบ TOR ต้นฉบับได้หลังอ่านตาราง SOC ครบแล้ว</p>}
  </section>;
}
