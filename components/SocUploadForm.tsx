"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker, { appendEvidence, readUploadResponse, sendEvidenceBatches } from "@/components/SocFilePicker";
import { evidenceSelectionProblem, MAX_SOC_FILE_BYTES, SOC_FILE_ACCEPT, SOC_TITLE_MAX, socFileNameProblem } from "@/lib/soc-shared";
import { uploadBatches } from "@/lib/soc-upload";

export default function SocUploadForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmDialog, confirm] = useConfirmDialog();
  const [soc, setSoc] = useState<File[]>([]);
  const [evidence, setEvidence] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  // Set when the job was created but a later batch of PDFs didn't go up.
  const [partialJobId, setPartialJobId] = useState("");

  function submit(formData: FormData) {
    setError("");
    if (!soc.length) return setError("กรุณาเลือกไฟล์ SOC (Word, Excel หรือ PDF)");
    const socProblem = socFileNameProblem(soc[0].name);
    if (socProblem) return setError(socProblem);
    if (soc[0].size > MAX_SOC_FILE_BYTES) return setError(`ไฟล์ ${soc[0].name} ต้องมีขนาดไม่เกิน ${MAX_SOC_FILE_BYTES / 1024 / 1024} MB`);
    const problem = evidenceSelectionProblem(evidence);
    if (problem) return setError(problem);
    // The job is created with the SOC and the first batch of PDFs; the rest
    // follow in batches, so no request goes over the server's size limit.
    const [first, ...rest] = uploadBatches(evidence);
    formData.set("soc", soc[0]);
    appendEvidence(formData, first);
    setPartialJobId("");
    startTransition(async () => {
      let jobId = "";
      try {
        setProgress(rest.length ? `กำลังอัปโหลดชุดที่ 1/${rest.length + 1}…` : "กำลังอัปโหลด…");
        let response = await fetch("/api/soc/jobs", { method: "POST", body: formData });
        let body = await readUploadResponse<{ id?: string; error?: string; needsOcrConfirm?: boolean }>(response);
        if (body.needsOcrConfirm) {
          // A scanned PDF goes to an outside OCR service: ask every time; cancel stores and sends nothing.
          const yes = await confirm({ title: "ไฟล์นี้จะส่งไป OCR ภายนอก", message: "SOC นี้เป็น PDF แบบสแกน ระบบจะส่งภาพของตารางไปอ่านที่บริการ OCR ภายนอก (Typhoon) ฟีเจอร์นี้ยังอยู่ระหว่างการพัฒนา และใช้เวลานานทั้งตอนอ่านตารางและตอนตรวจ (อ่านประมาณ 100–140 นาทีสำหรับ 85 หน้า) ผลอ่านอาจคลาดเคลื่อน ควรตรวจทานก่อนใช้งานจริง ต้องการดำเนินการต่อหรือไม่", confirmLabel: "ยืนยันและส่ง OCR" });
          if (!yes) return;
          formData.set("ocrConfirmed", "1");
          response = await fetch("/api/soc/jobs", { method: "POST", body: formData });
          body = await readUploadResponse<{ id?: string; error?: string }>(response);
        }
        if (!response.ok || !body.id) throw new Error(body.error || "ไม่สามารถสร้างงานตรวจได้");
        jobId = body.id;
        await sendEvidenceBatches(jobId, rest.flat(), (done, total) => setProgress(`กำลังอัปโหลดชุดที่ ${Math.min(done + 2, total + 1)}/${total + 1}…`));
        router.push(`/soc/${jobId}`);
        router.refresh();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "ไม่สามารถสร้างงานตรวจได้";
        if (jobId) setPartialJobId(jobId);
        setError(jobId ? `สร้างงานแล้ว แต่อัปโหลด PDF ไม่ครบ: ${message}` : message);
      } finally {
        setProgress("");
      }
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-6">
      <UploadSection number="1" title="รายละเอียดงาน" description="ใช้สำหรับค้นหาและตั้งชื่อไฟล์ผลลัพธ์">
        <label data-tour="job-title" className="flex max-w-2xl flex-col gap-2 text-sm font-medium">
          ชื่อโครงการ
          <input name="title" required maxLength={SOC_TITLE_MAX} placeholder="เช่น Udon CASRI-H3C" className="h-[46px] rounded-input border border-line bg-surface px-4 text-ink outline-none focus:border-ink" />
        </label>
      </UploadSection>
      <UploadSection number="2" tourTarget="soc-file" title="เอกสาร SOC" description="รองรับ Word (.docx), Excel (.xlsx) และ PDF ขนาดไม่เกิน 25 MB">
        <SocFilePicker files={soc} onChange={setSoc} disabled={pending} label="เลือกไฟล์ SOC (Word, Excel หรือ PDF)" accept={SOC_FILE_ACCEPT} />
        {/\.pdf$/i.test(soc[0]?.name ?? "") ? <p className="mt-3 text-sm text-muted">ถ้ามีไฟล์ Word ต้นฉบับ แนะนำให้อัป Word</p> : null}
      </UploadSection>
      <UploadSection number="3" tourTarget="evidence" title="Datasheet / Catalog" description="แนบ PDF ได้ไม่เกิน 200 ไฟล์ ไฟล์ละไม่เกิน 120 MB รวมไม่เกิน 1 GB ถ้า SOC อ้างชื่อโฟลเดอร์ (เช่น 2.5 …) ให้กดเลือกโฟลเดอร์ ระบบจะเก็บโฟลเดอร์ย่อยไว้ให้">
        <SocFilePicker files={evidence} onChange={setEvidence} disabled={pending} multiple folders label="เลือกไฟล์ PDF" accept=".pdf,application/pdf" />
      </UploadSection>
      {error ? <p role="alert" className="rounded-input border border-danger-border bg-surface px-4 py-3 text-sm text-danger">{error}{partialJobId ? <> <Link href={`/soc/${partialJobId}`} className="font-medium text-danger underline">เปิดหน้างานเพื่อเพิ่มไฟล์ที่เหลือ</Link></> : null}</p> : null}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/soc")} disabled={pending}>ยกเลิก</Button>
        <Button type="submit" data-tour="create-job" disabled={pending}>{pending ? progress || "กำลังอัปโหลด…" : "สร้างงานตรวจ"}</Button>
      </div>
      {confirmDialog}
    </form>
  );
}

function UploadSection({ number, tourTarget, title, description, children }: { number: string; tourTarget?: string; title: string; description: string; children: React.ReactNode }) {
  return <section data-tour={tourTarget} className="rounded-card bg-surface p-6 shadow-card"><div className="mb-5 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-ground">{number}</span><div><h2 className="font-display text-base font-semibold">{title}</h2><p className="text-xs text-muted">{description}</p></div></div>{children}</section>;
}
