"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker, { readUploadResponse } from "@/components/SocFilePicker";
import SocRefreshWhile from "@/components/SocRefreshWhile";
import { SOC_BUILD_STATUS_LABELS } from "@/lib/soc-shared";
import type { ProposalBuildView } from "@/lib/soc-builds";

type Template = { id: string; name: string };
type BuildRow = Omit<ProposalBuildView, "createdAt"> & { createdAt: string };

const INPUT = "h-10 rounded-input border border-line bg-ground px-3 text-sm text-ink outline-none focus:border-ink";
const formatDate = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

// The สร้าง SOC step: builds of this Proposal (with a ↗ link to each build's
// page) and a form that builds from the Proposal's TOR, so the TOR is not sent
// again. A scanned TOR asks for the OCR confirm first; cancelling sends nothing.
export default function ProposalBuildForm({ proposalId, hasTor, templates, builds }: { proposalId: string; hasTor: boolean; templates: Template[]; builds: BuildRow[] }) {
  const router = useRouter();
  const [pageRanges, setPageRanges] = useState("");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [uploaded, setUploaded] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dialog, confirm] = useConfirmDialog();
  const fromList = templates.length > 0 && !uploaded.length;
  // Not in a transition: a transition would hold the confirm dialog back until it ended.
  async function submit() {
    setError("");
    if (!fromList && !uploaded.length) return setError("กรุณาเลือกเทมเพลต SOC จากรายการ หรืออัปโหลดไฟล์เทมเพลต");
    setPending(true);
    try {
      const form = new FormData();
      form.set("pageRanges", pageRanges.trim());
      if (title.trim()) form.set("title", title.trim());
      if (fromList) form.set("templateId", templateId);
      else form.set("template", uploaded[0]);
      const send = async () => {
        const response = await fetch(`/api/proposals/${proposalId}/builds`, { method: "POST", body: form });
        return { ok: response.ok, body: await readUploadResponse<{ error?: string; needsOcrConfirm?: boolean }>(response) };
      };
      let answer = await send();
      if (answer.body.needsOcrConfirm) {
        if (!(await confirm({ title: "ไฟล์นี้จะส่งไป OCR ภายนอก (Beta)", message: "TOR นี้เป็น PDF แบบสแกน ระบบจะส่งภาพของหน้าที่คุณเลือกไปอ่านที่บริการ OCR ภายนอก อ่านในเบื้องหลังต่อคิวหลังงานอ่านอื่น แล้วจึงสร้างไฟล์ Word ผลอ่านจาก OCR ยังไม่แม่นยำ 100% ต้องทวนทุกข้อเทียบ TOR จริง ต้องการดำเนินการต่อหรือไม่", confirmLabel: "ยืนยันและส่ง OCR" }))) return;
        form.set("ocrConfirmed", "1");
        answer = await send();
      }
      if (!answer.ok) return setError(answer.body.error || "สร้าง SOC ไม่สำเร็จ");
      setPageRanges(""); setTitle(""); setUploaded([]);
      router.refresh();
    } catch {
      setError("สร้าง SOC ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(false);
    }
  }
  return <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
    {dialog}
    <SocRefreshWhile active={builds.some((build) => build.status === "QUEUED" || build.status === "READING")} />
    {builds.length ? <ul className="flex flex-col divide-y divide-line text-sm">{builds.map((build) => <li key={build.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="break-all font-medium">{build.title}</span><span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium">{SOC_BUILD_STATUS_LABELS[build.status] ?? build.status}{build.stage ? ` · ${build.stage}` : ""}</span>{build.versionNumber ? <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-black">เป็นฉบับ {build.versionNumber}</span> : null}</div>
        <div className="mt-0.5 text-xs text-muted">{build.ownerName} · {formatDate(build.createdAt)}</div>
        {build.errorMessage ? <p className="mt-1 text-xs text-danger">{build.errorMessage}</p> : null}
      </div>
      <Link href={`/soc/builds/${build.id}`} className="text-xs text-label underline hover:text-ink">หน้าสร้าง SOC ↗</Link>
    </li>)}</ul> : null}
    {hasTor ? <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex flex-col gap-3">
      <p className="text-xs text-muted">สร้างจาก TOR ของ Proposal นี้ ไม่ต้องอัปโหลด TOR อีก เมื่อสร้างเสร็จ ระบบเพิ่มเป็นฉบับ SOC ใหม่ให้เอง</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">ช่วงหน้าของ TOR (เว้นว่างให้ระบบเลือก)
          <input value={pageRanges} onChange={(event) => setPageRanges(event.target.value)} disabled={pending} placeholder="เว้นว่าง = ให้ระบบเลือก เช่น 12-40, 55-60" className={`${INPUT} w-72`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">ชื่อ (ไม่บังคับ)
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={pending} maxLength={120} placeholder="ใช้ชื่อไฟล์ TOR" className={`${INPUT} w-64 max-w-full`} />
        </label>
        {templates.length ? <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">เทมเพลต SOC
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={pending || !fromList} aria-label="เทมเพลต" className={`${INPUT} w-64 max-w-full`}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label> : null}
      </div>
      <SocFilePicker files={uploaded} onChange={setUploaded} disabled={pending} label={templates.length ? "หรืออัปโหลดไฟล์เทมเพลต (.docx) ใช้เฉพาะครั้งนี้" : "เลือกไฟล์เทมเพลต SOC (.docx)"} accept=".docx" />
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังสร้าง…" : "สร้าง SOC จาก TOR"}</Button></div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </form> : <p className="text-xs text-muted">อัปโหลด TOR ในขั้นแรกก่อน จึงจะสร้าง SOC ได้</p>}
  </div>;
}
