"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resumeSocVersionReadAction } from "@/actions/proposal";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker from "@/components/SocFilePicker";
import SocRefreshWhile from "@/components/SocRefreshWhile";
import { SOC_FILE_ACCEPT } from "@/lib/soc-shared";
import type { SocVersionView } from "@/lib/proposal-soc";

const SOURCE_LABELS: Record<string, string> = { upload: "อัปโหลด", build: "สร้าง SOC", reference_fill: "กรอกอ้างอิง" };
const formatDate = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

// The Proposal's SOC Versions: upload a SOC (the next version, which becomes
// the current one once it is readable) and the history with downloads. A
// scanned PDF asks for the OCR confirm first; cancelling stores nothing. The
// versions are plain data for the browser (dates as ISO strings).
export default function ProposalSocPanel({ proposalId, versions }: { proposalId: string; versions: (Omit<SocVersionView, "createdAt"> & { createdAt: string })[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resuming, startResume] = useTransition();
  const [dialog, confirm] = useConfirmDialog();
  // Not in a transition: a transition would hold the confirm dialog back until it ended.
  async function submit() {
    const file = files[0];
    if (!file) return;
    setError("");
    setPending(true);
    try {
      const form = new FormData();
      form.set("soc", file);
      const send = async () => {
        const response = await fetch(`/api/proposals/${proposalId}/soc-versions`, { method: "POST", body: form });
        return { ok: response.ok, body: ((await response.json().catch(() => null)) ?? {}) as { error?: string; needsOcrConfirm?: boolean } };
      };
      let answer = await send();
      if (answer.body.needsOcrConfirm) {
        if (!(await confirm({ title: "ไฟล์นี้จะส่งไป OCR ภายนอก (Beta)", message: "SOC นี้เป็น PDF แบบสแกน ระบบจะส่งภาพตารางไปอ่านที่บริการ OCR ภายนอกในเบื้องหลัง ใช้เวลานาน ยืนยันส่งหรือไม่" }))) return;
        form.set("ocrConfirmed", "1");
        answer = await send();
      }
      if (!answer.ok) {
        setError(answer.body.error || "อัปโหลด SOC ไม่สำเร็จ");
        return;
      }
      setFiles([]);
      router.refresh();
    } catch {
      setError("อัปโหลด SOC ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(false);
    }
  }
  function resume(versionId: string) {
    setError("");
    startResume(async () => {
      const result = await resumeSocVersionReadAction(proposalId, versionId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }
  return <section className="rounded-card bg-surface p-5 shadow-card" aria-label="ฉบับ SOC">
    {dialog}
    <SocRefreshWhile active={versions.some((version) => version.state === "reading")} />
    <h2 className="font-display text-lg font-semibold">ฉบับ SOC</h2>
    <p className="mt-1 text-xs text-muted">SOC ทุกไฟล์ที่เข้ามาใน Proposal เป็นฉบับใหม่ ฉบับล่าสุดที่อ่านได้คือฉบับปัจจุบันที่ทุกขั้นใช้ ฉบับเก่ายังเปิดและดาวน์โหลดได้</p>
    {versions.length ? <ul className="mt-3 flex flex-col divide-y divide-line text-sm">{versions.map((version) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">ฉบับ {version.number}</span>{version.current ? <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-black">ปัจจุบัน</span> : null}{version.state === "reading" ? <span className="rounded-full bg-peach px-2 py-0.5 text-[11px] font-semibold text-black">กำลังอ่าน{version.stage ? ` · ${version.stage}` : ""}</span> : null}{version.state === "failed" ? <span className="rounded-full border border-danger-border px-2 py-0.5 text-[11px] font-semibold text-danger">อ่านไม่สำเร็จ</span> : null}</div>
        <div className="mt-0.5 break-all text-xs text-muted">{version.name?.split("/").pop()} · {SOURCE_LABELS[version.source] ?? version.source} · {version.createdByName} · {formatDate(version.createdAt)}</div>
        {version.errorMessage ? <p role="alert" className="mt-1 text-xs text-danger">{version.errorMessage}</p> : null}
        {version.warnings.length ? <ul className="mt-1 list-disc pl-5 text-xs text-muted">{version.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      </div>
      <div className="flex items-center gap-2">
        {version.state === "failed" ? <Button size="sm" variant="outline" disabled={resuming} onClick={() => resume(version.id)}>{resuming ? "กำลังอ่านต่อ…" : "อ่านต่อ"}</Button> : null}
        {version.state === "ready" ? <a href={`/api/proposals/${proposalId}/soc-versions/${version.id}`} className="inline-flex h-9 items-center rounded-input bg-chip px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-hover">ดาวน์โหลด</a> : null}
        {version.hasSourcePdf ? <a href={`/api/proposals/${proposalId}/soc-versions/${version.id}?file=source`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-input bg-chip px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-hover">PDF ต้นฉบับ</a> : null}
      </div>
    </li>)}</ul> : <p className="mt-3 text-sm text-muted">ยังไม่มี SOC</p>}
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <SocFilePicker files={files} onChange={setFiles} disabled={pending} label={versions.length ? "เลือกไฟล์ SOC ฉบับใหม่ (Word, Excel หรือ PDF)" : "เลือกไฟล์ SOC (Word, Excel หรือ PDF)"} accept={SOC_FILE_ACCEPT} />
      <p className="text-xs text-muted">PDF แบบสแกนจะถามยืนยันก่อนส่งไปอ่านที่บริการ OCR ภายนอก (Beta) และอ่านในเบื้องหลัง ใช้เวลานาน</p>
      {files.length ? <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังอัปโหลด…" : "อัปโหลดเป็นฉบับใหม่"}</Button></div> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </form>
  </section>;
}
