"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import SocFilePicker, { appendEvidence, readUploadResponse, sendEvidenceBatches } from "@/components/SocFilePicker";
import { evidenceSelectionProblem, MAX_SOC_FILE_BYTES } from "@/lib/soc-shared";
import { uploadBatches } from "@/lib/soc-upload";

export default function SocUploadForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [soc, setSoc] = useState<File[]>([]);
  const [evidence, setEvidence] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  // Set when the job was created but a later batch of PDFs didn't go up.
  const [partialJobId, setPartialJobId] = useState("");

  function submit(formData: FormData) {
    setError("");
    if (!soc.length) return setError("กรุณาเลือกไฟล์ SOC (DOCX)");
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
        const response = await fetch("/api/soc/jobs", { method: "POST", body: formData });
        const body = await readUploadResponse<{ id?: string; error?: string }>(response);
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
        <label className="flex max-w-2xl flex-col gap-2 text-sm font-medium">
          ชื่อโครงการ
          <input name="title" required maxLength={160} placeholder="เช่น Udon CASRI-H3C" className="h-[46px] rounded-input border border-line bg-surface px-4 text-ink outline-none focus:border-ink" />
        </label>
      </UploadSection>
      <UploadSection number="2" title="เอกสาร SOC" description="รองรับ DOCX ขนาดไม่เกิน 25 MB">
        <SocFilePicker files={soc} onChange={setSoc} disabled={pending} label="เลือกไฟล์ SOC (DOCX)" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </UploadSection>
      <UploadSection number="3" title="Datasheet / Catalog" description="แนบ PDF ได้ไม่เกิน 200 ไฟล์ ไฟล์ละไม่เกิน 120 MB รวมไม่เกิน 1 GB ถ้า SOC อ้างชื่อโฟลเดอร์ (เช่น 2.5 …) ให้กดเลือกโฟลเดอร์ ระบบจะเก็บโฟลเดอร์ย่อยไว้ให้">
        <SocFilePicker files={evidence} onChange={setEvidence} disabled={pending} multiple folders label="เลือกไฟล์ PDF" accept=".pdf,application/pdf" />
      </UploadSection>
      {error ? <p role="alert" className="rounded-input border border-danger-border bg-surface px-4 py-3 text-sm text-danger">{error}{partialJobId ? <> <Link href={`/soc/${partialJobId}`} className="font-medium text-danger underline">เปิดหน้างานเพื่อเพิ่มไฟล์ที่เหลือ</Link></> : null}</p> : null}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/soc")} disabled={pending}>ยกเลิก</Button>
        <Button type="submit" disabled={pending}>{pending ? progress || "กำลังอัปโหลด…" : "สร้างงานตรวจ"}</Button>
      </div>
    </form>
  );
}

function UploadSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-card bg-surface p-6 shadow-card"><div className="mb-5 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-ground">{number}</span><div><h2 className="font-display text-base font-semibold">{title}</h2><p className="text-xs text-muted">{description}</p></div></div>{children}</section>;
}
