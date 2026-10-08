"use client";

// A file picker for SOC uploads: add files one at a time, several at once or
// (with `folders`) a whole folder, see what is chosen, and remove any before
// sending. An <input type="file"> can't drop one of its files, so the choice
// lives in the caller's state and the caller sends it.
import { useRef } from "react";
import { uploadBatches } from "@/lib/soc-upload";

// A file's place in what was picked: "2.5 …/1.…/tc22.pdf" from a folder, its
// name otherwise. The SOC cites folders, so the folders travel with the file.
export const pickedPath = (file: File) => file.webkitRelativePath || file.name;

// Path and size only: a file picked twice doesn't always keep its lastModified.
const sameFile = (a: File, b: File) => pickedPath(a) === pickedPath(b) && a.size === b.size;

// A folder pick brings every file in it: keep those `accept` names by
// extension, and drop hidden and Office lock files (Thumbs.db, ~$x.docx).
function accepted(file: File, accept: string) {
  const name = file.name.toLowerCase();
  if (name.startsWith(".") || name.startsWith("~$") || name === "thumbs.db") return false;
  return accept.split(",").some((type) => type.trim().startsWith(".") && name.endsWith(type.trim().toLowerCase()));
}

export function appendEvidence(form: FormData, files: readonly File[]) {
  for (const file of files) {
    form.append("evidence", file);
    form.append("evidencePath", pickedPath(file));
  }
}

// Sends evidence to a job in batches that each fit through IIS, one after
// another. `onBatch(done, total)` reports progress. Throws on the first
// batch the server refuses, naming how many files were already added.
export async function sendEvidenceBatches(jobId: string, files: readonly File[], onBatch: (done: number, total: number) => void = () => {}) {
  const batches = uploadBatches(files);
  let sent = 0;
  for (const [i, batch] of batches.entries()) {
    onBatch(i, batches.length);
    const form = new FormData();
    appendEvidence(form, batch);
    const response = await fetch(`/api/soc/jobs/${jobId}/evidence`, { method: "POST", body: form });
    const body = await readUploadResponse<{ error?: string }>(response);
    if (!response.ok) throw new Error(`${body.error || "เพิ่มเอกสารไม่สำเร็จ"}${sent ? ` (เพิ่มไปแล้ว ${sent} ไฟล์)` : ""}`);
    sent += batch.length;
  }
  onBatch(batches.length, batches.length);
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// An upload response's JSON body. A proxy in front of the app (IIS) answers a
// too-large upload with an HTML page, which would otherwise surface as
// "Unexpected token ... is not valid JSON" (seen on prod 2026-10-08).
export async function readUploadResponse<T extends { error?: string }>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    const tooLarge = response.status === 413 || response.status === 404;
    return { error: tooLarge ? "ไฟล์รวมกันใหญ่เกินที่ server รับได้ ลองแบ่งอัปโหลดทีละน้อยไฟล์ หรือแจ้งผู้ดูแลระบบ" : `server ตอบกลับผิดรูปแบบ (HTTP ${response.status}) กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ` } as T;
  }
}

export default function SocFilePicker({ files, onChange, accept, multiple = false, folders = false, label, disabled = false }: {
  files: File[]; onChange: (files: File[]) => void; accept: string; multiple?: boolean; folders?: boolean; label: string; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  function add(list: FileList | null, target: HTMLInputElement | null) {
    const picked = [...(list ?? [])].filter((file) => !file.webkitRelativePath || accepted(file, accept));
    if (picked.length) onChange(multiple ? [...files, ...picked.filter((f) => !files.some((g) => sameFile(f, g)))] : picked.slice(0, 1));
    // Lets the same file be picked again after it was removed.
    if (target) target.value = "";
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return <div className="flex flex-col gap-2">
    <input ref={input} type="file" accept={accept} multiple={multiple} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => add(e.target.files, e.target)} />
    {folders ? <input ref={folderInput} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => add(e.target.files, e.target)} {...{ webkitdirectory: "" }} /> : null}
    {files.length > 1 ? <p className="text-xs text-muted">{files.length} ไฟล์ · รวม {formatFileSize(total)}</p> : null}
    {files.length ? <ul className="flex max-h-80 flex-col divide-y divide-line overflow-y-auto rounded-input border border-line bg-ground">{files.map((file, i) => <li key={`${pickedPath(file)}-${file.size}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate" title={pickedPath(file)}>{pickedPath(file)}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted">{formatFileSize(file.size)}</span>
      <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))} className="ui-btn shrink-0 rounded-input px-2 py-1 text-xs font-medium text-danger hover:bg-hover disabled:opacity-50" aria-label={`ลบ ${file.name}`}>ลบ</button>
    </li>)}</ul> : null}
    <div className="flex gap-2">
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="ui-btn flex-1 rounded-input border border-dashed border-line bg-ground p-4 text-sm font-medium text-ink hover:bg-hover disabled:opacity-50">
        {files.length ? (multiple ? "+ เพิ่มไฟล์" : "เปลี่ยนไฟล์") : label}
      </button>
      {folders ? <button type="button" disabled={disabled} onClick={() => folderInput.current?.click()} title="เลือกทั้งโฟลเดอร์ (เช่น บทที่ 2) ระบบเก็บชื่อโฟลเดอร์ย่อยไว้ให้ SOC ที่อ้างชื่อโฟลเดอร์หาไฟล์เจอ ไฟล์อื่นที่ไม่ใช่ PDF จะถูกข้าม" className="ui-btn flex-1 rounded-input border border-dashed border-line bg-ground p-4 text-sm font-medium text-ink hover:bg-hover disabled:opacity-50">
        + เลือกโฟลเดอร์
      </button> : null}
    </div>
  </div>;
}
