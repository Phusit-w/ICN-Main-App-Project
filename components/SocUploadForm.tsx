"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function SocUploadForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/soc/jobs", { method: "POST", body: formData });
        const body = (await response.json()) as { id?: string; error?: string };
        if (!response.ok || !body.id) throw new Error(body.error || "ไม่สามารถสร้างงานตรวจได้");
        router.push(`/soc/${body.id}`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "ไม่สามารถสร้างงานตรวจได้");
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
        <FileInput name="soc" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </UploadSection>
      <UploadSection number="3" title="Datasheet / Catalog" description="แนบ PDF ได้ 1–10 ไฟล์ ไฟล์ละไม่เกิน 120 MB และรวมไม่เกิน 250 MB">
        <FileInput name="evidence" accept=".pdf,application/pdf" multiple />
      </UploadSection>
      {error ? <p role="alert" className="rounded-input border border-danger-border bg-surface px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/soc")} disabled={pending}>ยกเลิก</Button>
        <Button type="submit" disabled={pending}>{pending ? "กำลังอัปโหลด…" : "สร้างงานตรวจ"}</Button>
      </div>
    </form>
  );
}

function UploadSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-card bg-surface p-6 shadow-card"><div className="mb-5 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-ground">{number}</span><div><h2 className="font-display text-base font-semibold">{title}</h2><p className="text-xs text-muted">{description}</p></div></div>{children}</section>;
}

function FileInput({ name, accept, multiple = false }: { name: string; accept: string; multiple?: boolean }) {
  return <input name={name} type="file" required multiple={multiple} accept={accept} className="block w-full rounded-input border border-dashed border-line bg-ground p-4 text-sm file:mr-4 file:rounded-input file:border-0 file:bg-ink file:px-4 file:py-2 file:text-ground" />;
}
