"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeProposalDatasheetAction, renameDatasheetCitationAction } from "@/actions/proposal";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker, { sendEvidenceBatches } from "@/components/SocFilePicker";
import { formatFileSize } from "@/lib/soc-upload";

type DatasheetRow = { id: string; originalName: string; citationName: string; sizeBytes: number };

// One Datasheet's ชื่อที่ใช้อ้างอิง, saved when the field loses focus or Enter is pressed.
function CitationNameField({ proposalId, datasheet, onError }: { proposalId: string; datasheet: DatasheetRow; onError: (message: string) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(datasheet.citationName);
  const [saving, startSave] = useTransition();
  function save() {
    if (value.trim() === datasheet.citationName) return;
    onError("");
    startSave(async () => {
      const result = await renameDatasheetCitationAction(proposalId, datasheet.id, value);
      if (!result.ok) {
        onError(result.error);
        setValue(datasheet.citationName);
      }
      router.refresh();
    });
  }
  return <input value={value} disabled={saving} maxLength={120} aria-label={`ชื่อที่ใช้อ้างอิงของ ${datasheet.originalName}`}
    onChange={(event) => setValue(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    className="h-9 w-full rounded-input border border-line bg-ground px-3 text-sm sm:w-72" />;
}

// The Proposal's Datasheets: upload (folders kept, in batches that fit
// through IIS), the list with each file's ชื่อที่ใช้อ้างอิง, and removal.
export default function ProposalDatasheetPanel({ proposalId, datasheets }: { proposalId: string; datasheets: DatasheetRow[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [pending, setPending] = useState(false);
  const [removing, startRemove] = useTransition();
  const [dialog, confirm] = useConfirmDialog();
  async function submit() {
    if (!files.length) return;
    setError("");
    setPending(true);
    try {
      await sendEvidenceBatches(`/api/proposals/${proposalId}/datasheets`, files, (done, total) => setProgress(total > 1 ? `กำลังอัปโหลดชุดที่ ${Math.min(done + 1, total)}/${total}…` : ""));
      setFiles([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เพิ่ม Datasheet ไม่สำเร็จ");
    } finally {
      setPending(false);
      setProgress("");
      router.refresh(); // batches sent before a failure are already on the list
    }
  }
  async function remove(datasheet: DatasheetRow) {
    if (!(await confirm({ title: "ลบ Datasheet?", message: `${datasheet.originalName} จะถูกลบออกจาก Proposal` }))) return;
    setError("");
    startRemove(async () => {
      const result = await removeProposalDatasheetAction(proposalId, datasheet.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }
  const total = datasheets.reduce((sum, datasheet) => sum + datasheet.sizeBytes, 0);
  return <section className="rounded-card bg-surface p-5 shadow-card" aria-label="Datasheet">
    {dialog}
    <h2 className="font-display text-lg font-semibold">Datasheet</h2>
    <p className="mt-1 text-xs text-muted">อัปโหลดครั้งเดียว เก็บชื่อโฟลเดอร์ไว้ เพิ่มหรือลบได้ทุกเมื่อ (สูงสุด 200 ไฟล์ · รวม 1 GB · ไฟล์ละ 120 MB) ชื่อที่ใช้อ้างอิงใช้เรียกไฟล์ในอ้างอิงแบบอังกฤษ แก้ได้</p>
    {datasheets.length ? <>
      <p className="mt-3 text-xs text-muted">{datasheets.length} ไฟล์ · รวม {formatFileSize(total)}</p>
      <ul className="mt-1 flex max-h-96 flex-col divide-y divide-line overflow-y-auto text-sm">{datasheets.map((datasheet) => <li key={datasheet.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
        <div className="min-w-0 flex-1 basis-60">
          <div className="break-all" title={datasheet.originalName}>{datasheet.originalName}</div>
          <div className="text-xs text-muted">{formatFileSize(datasheet.sizeBytes)}</div>
        </div>
        <CitationNameField key={datasheet.citationName} proposalId={proposalId} datasheet={datasheet} onError={setError} />
        <Button size="sm" variant="outline" disabled={removing} onClick={() => void remove(datasheet)}>ลบ</Button>
      </li>)}</ul>
    </> : <p className="mt-3 text-sm text-muted">ยังไม่มี Datasheet</p>}
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <SocFilePicker files={files} onChange={setFiles} disabled={pending} multiple folders label="+ เลือกไฟล์ PDF" accept=".pdf" />
      {files.length ? <div className="flex items-center justify-end gap-3">{progress ? <span className="text-xs text-muted">{progress}</span> : null}<Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังอัปโหลด…" : "เพิ่ม Datasheet"}</Button></div> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </form>
  </section>;
}
