"use client";

// A file picker for SOC uploads: add files one at a time or several at once,
// see what is chosen, and remove any before sending. An <input type="file">
// can't drop one of its files, so the choice lives in the caller's state and
// the caller appends it to the FormData it sends.
import { useRef } from "react";

// Name and size only: a file picked twice doesn't always keep its lastModified.
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size;

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

export default function SocFilePicker({ files, onChange, accept, multiple = false, label, disabled = false }: {
  files: File[]; onChange: (files: File[]) => void; accept: string; multiple?: boolean; label: string; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  function add(list: FileList | null) {
    const picked = [...(list ?? [])];
    if (picked.length) onChange(multiple ? [...files, ...picked.filter((f) => !files.some((g) => sameFile(f, g)))] : picked.slice(0, 1));
    // Lets the same file be picked again after it was removed.
    if (input.current) input.current.value = "";
  }
  return <div className="flex flex-col gap-2">
    <input ref={input} type="file" accept={accept} multiple={multiple} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => add(e.target.files)} />
    {files.length ? <ul className="flex flex-col divide-y divide-line rounded-input border border-line bg-ground">{files.map((file, i) => <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted">{formatFileSize(file.size)}</span>
      <button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))} className="ui-btn shrink-0 rounded-input px-2 py-1 text-xs font-medium text-danger hover:bg-hover disabled:opacity-50" aria-label={`ลบ ${file.name}`}>ลบ</button>
    </li>)}</ul> : null}
    <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="ui-btn w-full rounded-input border border-dashed border-line bg-ground p-4 text-sm font-medium text-ink hover:bg-hover disabled:opacity-50">
      {files.length ? (multiple ? "+ เพิ่มไฟล์" : "เปลี่ยนไฟล์") : label}
    </button>
  </div>;
}
