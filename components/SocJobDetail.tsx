"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSocJob, retrySocJob, trashSocJob, updateSocResult } from "@/actions/soc";
import Button from "@/components/ui/Button";
import type { ConfirmedRow } from "@/lib/soc-import";
import { CHECK_LABELS, majorItemProgress, SOC_AXIS_VALUE_LABELS, SOC_MAJOR_ITEM_STATE_LABELS, SOC_RUN_SOURCE_LABELS, SOC_STATUS_LABELS } from "@/lib/soc-shared";

type DocumentItem = { id: string; type: string; name: string };
type ResultItem = {
  id: string; rowNumber: number; item: string; rowType: string; socText: string;
  referenceText: string; referencePages: number[]; evidenceDocumentId: string | null;
  aiReferenceCheck: string; aiHeadingTitleCheck: string; aiDetail: string; aiConfidence: string;
  finalReferenceCheck: string; finalHeadingTitleCheck: string; finalDetail: string; reviewed: boolean;
};
type MajorItem = { id: string; label: string; title: string | null; state: string; skillVersion: string | null; model: string | null; runSource: string | null; ranByName: string | null; socCheckDocumentId: string | null };
// A row of a Local Check Run, shown as a plain list until the review page (ticket 08).
type ImportedRow = { id: string; majorItemId: string | null; item: string; reference: string; referenceCheck: string; highlightCheck: string | null; evidenceSupport: string | null; torDecision: string | null; declaredStatusCheck: string | null; keyIssue: string };
type Job = { id: string; kind: string; title: string; status: string; stage: string; progress: number; errorMessage: string | null; ownerName: string; canTrash: boolean; results: ResultItem[]; importedRows: ImportedRow[]; documents: DocumentItem[]; majorItems: MajorItem[] };

const ACTIVE = new Set(["QUEUED", "PROCESSING", "CONFIRMED", "EXPORTING"]);
const FILTERS = ["all", "match", "mismatch", "review", "not_found", "unverifiable", "not_applicable"];

export default function SocJobDetail({ job }: { job: Job }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => job.results.filter((r) => filter === "all" || r.finalReferenceCheck === filter), [filter, job.results]);
  const [selectedId, setSelectedId] = useState(filtered[0]?.id || job.results[0]?.id || "");
  const selected = job.results.find((r) => r.id === selectedId) || filtered[0] || job.results[0];

  useEffect(() => {
    if (!ACTIVE.has(job.status)) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [job.status, router]);

  const outputs = job.documents.filter((d) => d.type === "OUTPUT" || d.type === "PREVIEW");
  const unreviewed = job.results.filter((r) => !r.reviewed).length;
  const imported = job.kind === "IMPORTED";

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/soc" className="text-xs text-muted no-underline hover:underline">← งานตรวจ SOC</Link><h1 className="mt-2 font-display text-[28px] font-bold">{job.title}</h1><p className="mt-1 text-sm text-muted">เจ้าของงาน: {job.ownerName}</p></div><div className="flex items-center gap-2">{job.canTrash ? <TrashJobButton jobId={job.id} /> : null}<span className="rounded-full bg-chip px-4 py-2 text-sm font-medium">{SOC_STATUS_LABELS[job.status] || job.status}</span></div></div>
    {imported ? <><MajorItemsPanel jobId={job.id} items={job.majorItems} /><DocumentsPanel jobId={job.id} documents={job.documents} /><ImportedRowsPanel items={job.majorItems} rows={job.importedRows} /></> : <JobProgress job={job} />}
    {job.status === "FAILED" ? <FailurePanel job={job} /> : null}
    {outputs.length ? <section className="rounded-card bg-surface p-5 shadow-card"><h2 className="font-display font-semibold">ไฟล์ผลลัพธ์</h2><div className="mt-3 flex flex-wrap gap-3">{outputs.map((doc) => <a key={doc.id} href={`/api/soc/documents/${doc.id}`} target={doc.type === "PREVIEW" ? "_blank" : undefined} className="rounded-input border border-line bg-surface px-4 py-2 text-sm font-medium text-ink no-underline hover:bg-hover">{doc.type === "PREVIEW" ? "เปิดตัวอย่าง PDF" : "ดาวน์โหลด DOCX"}</a>)}</div></section> : null}
    {job.status === "NEEDS_REVIEW" && !imported ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-5 shadow-card"><div><div className="font-medium">ตรวจทานแล้ว {job.results.length - unreviewed}/{job.results.length} รายการ</div><p className="mt-1 text-xs text-muted">ผลจากระบบเป็นเพียงคำแนะนำ ต้องยืนยันทุกข้อก่อนสร้าง DOCX</p></div><ReviewActions jobId={job.id} unreviewed={unreviewed} /></div> : null}
    {job.results.length ? <>
      <div className="flex flex-wrap gap-2">{FILTERS.map((value) => { const count = value === "all" ? job.results.length : job.results.filter((r) => r.finalReferenceCheck === value).length; return <button key={value} onClick={() => setFilter(value)} className={`ui-btn rounded-full px-3 py-1.5 text-xs transition-colors ${filter === value ? "bg-ink text-ground" : "bg-chip text-label hover:text-ink"}`}>{value === "all" ? "ทั้งหมด" : CHECK_LABELS[value]} ({count})</button>; })}</div>
      <div className="grid min-h-[540px] gap-5 lg:grid-cols-[360px_minmax(0,1fr)]"><div className="overflow-hidden rounded-card bg-surface shadow-card"><div className="max-h-[680px] overflow-y-auto">{filtered.map((result) => <button key={result.id} onClick={() => setSelectedId(result.id)} className={`ui-btn w-full border-b border-line p-4 text-left transition-colors ${selected?.id === result.id ? "bg-chip" : "bg-surface hover:bg-hover"}`}><div className="flex items-center gap-2"><span className="font-medium">ข้อ {result.item}</span><StatusPill status={result.finalReferenceCheck} /><span className={`ml-auto size-2 rounded-full ${result.reviewed ? "bg-green-500" : "bg-accent"}`} title={result.reviewed ? "ตรวจทานแล้ว" : "ยังไม่ตรวจทาน"} /></div><p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{result.socText}</p></button>)}</div></div>{selected ? <ResultEditor key={`${selected.id}-${selected.reviewed}-${selected.finalReferenceCheck}`} jobId={job.id} result={selected} evidence={job.documents.find((d) => d.id === selected.evidenceDocumentId)} editable={job.status === "NEEDS_REVIEW"} /> : <div className="rounded-card bg-surface p-8 text-center text-muted shadow-card">ไม่พบรายการในตัวกรองนี้</div>}</div>
    </> : null}
  </div>;
}

function TrashJobButton({ jobId }: { jobId: string }) { const router = useRouter(); const [pending, start] = useTransition(); return <Button size="sm" variant="danger" disabled={pending} onClick={() => { if (!window.confirm("ย้ายงานนี้ไปถังขยะ 30 วัน?")) return; start(async () => { await trashSocJob(jobId); router.push("/soc"); router.refresh(); }); }}>{pending ? "กำลังลบ…" : "ลบ"}</Button>; }

function MajorItemsPanel({ jobId, items }: { jobId: string; items: MajorItem[] }) {
  const { checked, total, percent } = majorItemProgress(items);
  const [importing, setImporting] = useState<string | null>(null);
  return <section className="overflow-hidden rounded-card bg-surface shadow-card">
    <div className="p-5"><div className="flex items-center justify-between gap-4 text-sm"><span className="font-medium">ตรวจแล้ว {checked}/{total} ข้อใหญ่</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-chip"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} /></div></div>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead className="bg-chip text-left text-xs text-label"><tr><th className="px-5 py-3">ข้อใหญ่</th><th className="px-5 py-3">หัวข้อ</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">ตรวจโดย</th><th className="px-5 py-3" aria-label="นำเข้าผล" /></tr></thead><tbody>{items.map((item) => <MajorItemRow key={item.id} jobId={jobId} item={item} open={importing === item.id} onToggle={() => setImporting(importing === item.id ? null : item.id)} onDone={() => setImporting(null)} />)}</tbody></table></div>
  </section>;
}

function MajorItemRow({ jobId, item, open, onToggle, onDone }: { jobId: string; item: MajorItem; open: boolean; onToggle: () => void; onDone: () => void }) {
  // A checked item can be imported again: a re-check replaces its rows.
  const canImport = item.state === "not_checked" || item.state === "checked";
  const recheck = item.state === "checked";
  return <>
    <tr className="border-t border-line"><td className="px-5 py-3 font-medium tabular-nums">ข้อ {item.label}</td><td className="px-5 py-3 text-muted"><span className="line-clamp-2">{item.title || "—"}</span></td><td className="whitespace-nowrap px-5 py-3"><span className="rounded-full bg-chip px-3 py-1 text-xs font-medium">{SOC_MAJOR_ITEM_STATE_LABELS[item.state] || item.state}</span></td><td className="px-5 py-3 text-xs text-muted">{item.ranByName ? <>{item.ranByName}{item.model ? ` · ${item.model}` : ""}{item.skillVersion ? ` · skill ${item.skillVersion}` : ""}{item.runSource ? ` · ${SOC_RUN_SOURCE_LABELS[item.runSource] || item.runSource}` : ""}{item.socCheckDocumentId ? <> · <a href={`/api/soc/documents/${item.socCheckDocumentId}`}>SOC_Check</a></> : null}</> : "—"}</td><td className="whitespace-nowrap px-5 py-3 text-right">{canImport ? <Button size="sm" variant="outline" onClick={onToggle}>{open ? "ปิด" : recheck ? "ตรวจซ้ำ" : "นำเข้าผล"}</Button> : null}</td></tr>
    {open && canImport ? <tr className="border-t border-line bg-ground"><td colSpan={5} className="px-5 py-4"><ImportRunForm jobId={jobId} item={item} onDone={onDone} /></td></tr> : null}
  </>;
}

// Phase 1 manual upload of one Local Check Run's results.json + SOC_Check.
function ImportRunForm({ jobId, item, onDone }: { jobId: string; item: MajorItem; onDone: () => void }) {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  // Set when a re-check would replace rows that have a Final Decision.
  const [confirmedRows, setConfirmedRows] = useState<ConfirmedRow[]>([]);
  const [pending, startTransition] = useTransition();
  const recheck = item.state === "checked";
  // onSubmit rather than a form action, which would clear the chosen files
  // when the import is rejected.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrors([]);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/soc/jobs/${jobId}/major-items/${item.id}/import`, { method: "POST", body: formData });
        const body = (await response.json()) as { error?: string; errors?: string[]; confirmedRows?: ConfirmedRow[] };
        if (response.status === 409 && body.confirmedRows) { setConfirmedRows(body.confirmedRows); return; }
        setConfirmedRows([]);
        if (!response.ok) { setErrors(body.errors?.length ? body.errors : [body.error || "นำเข้าผลไม่สำเร็จ"]); return; }
        onDone();
        router.refresh();
      } catch {
        setErrors(["นำเข้าผลไม่สำเร็จ กรุณาลองใหม่"]);
      }
    });
  }
  const field = "rounded-input border border-line bg-surface px-3 py-2 text-sm font-normal";
  return <form onSubmit={submit} className="flex flex-col gap-3">
    <p className="text-xs text-muted">แนบผลจากการรัน skill ใน Claude Code สำหรับข้อ {item.label} เท่านั้น (โหมด Full audit พร้อม evidence_support และ tor_decision)</p>
    {recheck ? <p className="text-xs text-muted">ข้อนี้มีผลตรวจแล้ว ผลใหม่จะแทนที่ผลเดิมทั้งข้อ ผลเดิมยังเก็บไว้ในประวัติการแก้ไข</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-xs font-medium text-label">results.json<input name="results" type="file" required accept=".json,application/json" className={field} /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-label">SOC_Check (.docx)<input name="socCheck" type="file" required accept=".docx" className={field} /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-label">เวอร์ชัน skill<input name="skillVersion" maxLength={200} placeholder="เว้นว่างเพื่อใช้ค่า skill_version ในไฟล์" className={field} /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-label">โมเดล Claude<input name="model" maxLength={200} placeholder="เว้นว่างเพื่อใช้ค่า model ในไฟล์" className={field} /></label>
    </div>
    {errors.length ? <div role="alert" className="rounded-input border border-danger-border p-3 text-xs text-danger"><p className="font-medium">ไม่ได้นำเข้า ไฟล์มีปัญหา:</p><ul className="mt-1 list-disc pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div> : null}
    {confirmedRows.length ? <div role="alert" className="rounded-input border border-danger-border p-3 text-xs text-danger"><p className="font-medium">มี {confirmedRows.length} แถวที่ยืนยันผลแล้ว การตรวจซ้ำจะแทนที่แถวเหล่านี้:</p><p className="mt-1">{confirmedRows.map((r) => `ข้อ ${r.item}`).join(", ")}</p><label className="mt-2 flex items-center gap-2 font-medium text-ink"><input name="replaceConfirmed" type="checkbox" value={confirmedRows.map((r) => r.rowNumber).join(",")} required />แทนที่แถวที่ยืนยันแล้ว</label></div> : null}
    <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังนำเข้า…" : recheck ? "ตรวจซ้ำ" : "นำเข้าผล"}</Button></div>
  </form>;
}

function ImportedRowsPanel({ items, rows }: { items: MajorItem[]; rows: ImportedRow[] }) {
  if (!rows.length) return null;
  const label = (value: string | null) => (value ? SOC_AXIS_VALUE_LABELS[value] || value : "—");
  return <section className="overflow-hidden rounded-card bg-surface shadow-card">
    <h2 className="p-5 font-display font-semibold">ผลตรวจที่นำเข้า</h2>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead className="bg-chip text-left text-xs text-label"><tr><th className="px-4 py-3">ข้อ</th><th className="px-4 py-3">หน้าอ้างอิง</th><th className="px-4 py-3">ผลอ้างอิง</th><th className="px-4 py-3">Highlight</th><th className="px-4 py-3">หลักฐาน</th><th className="px-4 py-3">ผล TOR</th><th className="px-4 py-3">Comply/Better เดิม</th><th className="px-4 py-3">ประเด็นหลัก</th></tr></thead>
      <tbody>{items.flatMap((item) => rows.filter((r) => r.majorItemId === item.id)).map((row) => <tr key={row.id} className="border-t border-line align-top"><td className="whitespace-nowrap px-4 py-3 font-medium">{row.item}</td><td className="px-4 py-3 text-xs text-muted"><span className="line-clamp-2">{row.reference || "—"}</span></td><td className="whitespace-nowrap px-4 py-3 text-xs">{label(row.referenceCheck)}</td><td className="whitespace-nowrap px-4 py-3 text-xs">{label(row.highlightCheck)}</td><td className="whitespace-nowrap px-4 py-3 text-xs">{label(row.evidenceSupport)}</td><td className="whitespace-nowrap px-4 py-3 text-xs">{label(row.torDecision)}</td><td className="whitespace-nowrap px-4 py-3 text-xs">{label(row.declaredStatusCheck)}</td><td className="min-w-[280px] px-4 py-3 text-xs text-muted"><span className="line-clamp-3">{row.keyIssue}</span></td></tr>)}</tbody>
    </table></div>
  </section>;
}

function DocumentsPanel({ jobId, documents }: { jobId: string; documents: DocumentItem[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const inputs = documents.filter((d) => d.type === "SOC" || d.type === "EVIDENCE");
  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/soc/jobs/${jobId}/evidence`, { method: "POST", body: formData });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "เพิ่มเอกสารไม่สำเร็จ");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "เพิ่มเอกสารไม่สำเร็จ");
      }
    });
  }
  return <section className="rounded-card bg-surface p-5 shadow-card">
    <h2 className="font-display font-semibold">เอกสารในงาน</h2>
    <ul className="mt-3 flex flex-col gap-1.5 text-sm">{inputs.map((doc) => <li key={doc.id} className="flex items-center gap-2"><span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-label">{doc.type === "SOC" ? "SOC" : "PDF"}</span><a href={`/api/soc/documents/${doc.id}`} target={doc.type === "EVIDENCE" ? "_blank" : undefined} rel="noreferrer" className="text-ink">{doc.name}</a></li>)}</ul>
    <form key={inputs.length} action={submit} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <input name="evidence" type="file" required multiple accept=".pdf,application/pdf" className="min-w-0 flex-1 rounded-input border border-dashed border-line bg-ground p-3 text-sm file:mr-4 file:rounded-input file:border-0 file:bg-ink file:px-4 file:py-2 file:text-ground" />
      <Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังอัปโหลด…" : "เพิ่ม PDF หลักฐาน"}</Button>
      {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
    </form>
  </section>;
}

function JobProgress({ job }: { job: Job }) {
  return <section className="rounded-card bg-surface p-5 shadow-card"><div className="flex items-center justify-between gap-4 text-sm"><span className="font-medium">{job.stage}</span><span className="tabular-nums text-muted">{job.progress}%</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-chip"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${job.progress}%` }} /></div>{ACTIVE.has(job.status) ? <p className="mt-3 text-xs text-muted">งานทำในเบื้องหลัง ปิดหน้านี้แล้วกลับมาดูภายหลังได้</p> : null}</section>;
}

function StatusPill({ status }: { status: string }) {
  const color = status === "match" ? "bg-green-100 text-green-800" : status === "mismatch" || status === "not_found" ? "bg-red-100 text-red-800" : status === "not_applicable" ? "bg-chip text-label" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{CHECK_LABELS[status] || status}</span>;
}

function ResultEditor({ jobId, result, evidence, editable }: { jobId: string; result: ResultItem; evidence?: DocumentItem; editable: boolean }) {
  const router = useRouter();
  const [referenceCheck, setReferenceCheck] = useState(result.finalReferenceCheck);
  const [headingCheck, setHeadingCheck] = useState(result.finalHeadingTitleCheck);
  const [detail, setDetail] = useState(result.finalDetail);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function save() { setMessage(""); startTransition(async () => { try { await updateSocResult({ jobId, resultId: result.id, referenceCheck, headingTitleCheck: headingCheck, detail }); setMessage("บันทึกแล้ว"); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); } }); }
  return <section className="rounded-card bg-surface p-6 shadow-card"><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-lg font-semibold">ข้อ {result.item}</h2><StatusPill status={result.finalReferenceCheck} /><span className="text-xs text-muted">แถว {result.rowNumber} · {result.rowType}</span></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-label">ข้อกำหนด SOC</h3><p className="mt-2 whitespace-pre-wrap rounded-input bg-ground p-4 text-sm leading-relaxed">{result.socText}</p></div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-label">เอกสารอ้างอิง</h3><p className="mt-2 rounded-input bg-ground p-4 text-sm leading-relaxed">{result.referenceText || "ไม่พบเลขหน้าอ้างอิง"}</p>{evidence ? <a href={`/api/soc/documents/${evidence.id}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm">เปิด {evidence.name}{result.referencePages.length ? ` — หน้า ${result.referencePages.join(", ")}` : ""} ↗</a> : null}</div></div>
    <div className="mt-5 rounded-input border border-line p-4"><div className="text-xs font-semibold text-label">ผลจากระบบ · confidence {result.aiConfidence}</div><p className="mt-2 text-sm leading-relaxed">{result.aiDetail}</p><div className="mt-2 flex flex-wrap gap-2"><StatusPill status={result.aiReferenceCheck} /><span className="text-xs text-muted">ชื่อหัวข้อ: {CHECK_LABELS[result.aiHeadingTitleCheck] || result.aiHeadingTitleCheck}</span></div></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium">ผลตรวจอ้างอิง<select value={referenceCheck} onChange={(e) => setReferenceCheck(e.target.value)} disabled={!editable} className="h-11 rounded-input border border-line bg-surface px-3">{Object.entries(CHECK_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="flex flex-col gap-2 text-sm font-medium">ผลตรวจชื่อหัวข้อ<select value={headingCheck} onChange={(e) => setHeadingCheck(e.target.value)} disabled={!editable} className="h-11 rounded-input border border-line bg-surface px-3">{["match", "mismatch", "unverifiable", "not_applicable"].map((value) => <option key={value} value={value}>{CHECK_LABELS[value]}</option>)}</select></label></div>
    <label className="mt-4 flex flex-col gap-2 text-sm font-medium">รายละเอียด<textarea value={detail} onChange={(e) => setDetail(e.target.value)} disabled={!editable} maxLength={2000} rows={4} className="rounded-input border border-line bg-surface p-3 leading-relaxed" /></label>
    {editable ? <div className="mt-4 flex items-center justify-end gap-3">{message ? <span className="text-xs text-muted">{message}</span> : null}<Button onClick={save} disabled={pending}>{pending ? "กำลังบันทึก…" : result.reviewed ? "บันทึกการแก้ไข" : "ยืนยันรายการนี้"}</Button></div> : null}
  </section>;
}

function ReviewActions({ jobId, unreviewed }: { jobId: string; unreviewed: number }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  function run(action: () => Promise<void>) { setError(""); startTransition(async () => { try { await action(); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ดำเนินการไม่สำเร็จ"); } }); }
  return <div className="flex flex-wrap items-center justify-end gap-2">{error ? <span className="text-xs text-danger">{error}</span> : null}{unreviewed ? <span className="text-xs text-muted">ต้องยืนยันทีละรายการอีก {unreviewed} ข้อ</span> : null}<Button size="sm" disabled={pending || unreviewed > 0} onClick={() => run(() => confirmSocJob(jobId))}>ยืนยันและสร้าง DOCX</Button></div>;
}

function FailurePanel({ job }: { job: Job }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  return <section className="rounded-card border border-danger-border bg-surface p-5 shadow-card"><h2 className="font-semibold text-danger">ประมวลผลไม่สำเร็จ</h2><p className="mt-2 text-sm text-label">{job.errorMessage || "เกิดข้อผิดพลาดที่ worker"}</p><Button className="mt-4" variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => { await retrySocJob(job.id); router.refresh(); })}>ลองใหม่</Button></section>;
}
