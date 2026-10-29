"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker from "@/components/SocFilePicker";

// The TOR step's upload: the Proposal's one TOR PDF, or a replacement. A
// scanned TOR asks for the OCR confirm first; cancelling stores and sends nothing.
export default function ProposalTorForm({ proposalId, hasTor }: { proposalId: string; hasTor: boolean }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dialog, confirm] = useConfirmDialog();
  // Not in a transition: a transition would hold the confirm dialogs back until it ended.
  async function submit() {
    const file = files[0];
    if (!file) return;
    if (hasTor && !(await confirm({ title: "แทนที่ TOR?", message: "TOR เดิมจะถูกลบและใช้ไฟล์ใหม่แทน" }))) return;
    setError("");
    setPending(true);
    try {
      const form = new FormData();
      form.set("tor", file);
      const send = async () => {
        const response = await fetch(`/api/proposals/${proposalId}/tor`, { method: "POST", body: form });
        return { ok: response.ok, body: ((await response.json().catch(() => null)) ?? {}) as { error?: string; needsOcrConfirm?: boolean } };
      };
      let answer = await send();
      if (answer.body.needsOcrConfirm) {
        if (!(await confirm({ title: "ไฟล์นี้จะส่งไป OCR ภายนอก (Beta)", message: "TOR นี้เป็น PDF แบบสแกน ระบบจะส่งหน้า TOR ไปอ่านที่บริการ OCR ภายนอกเมื่อขั้นตอนที่ใช้ TOR ทำงาน ยืนยันส่งหรือไม่" }))) return;
        form.set("ocrConfirmed", "1");
        answer = await send();
      }
      if (!answer.ok) {
        setError(answer.body.error || "อัปโหลด TOR ไม่สำเร็จ");
        return;
      }
      setFiles([]);
      router.refresh();
    } catch {
      setError("อัปโหลด TOR ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
    {dialog}
    <SocFilePicker files={files} onChange={setFiles} disabled={pending} label={hasTor ? "เลือก PDF TOR ฉบับใหม่" : "เลือกไฟล์ PDF ของ TOR"} accept=".pdf,application/pdf" />
    {files.length ? <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังอัปโหลด…" : hasTor ? "แทนที่ TOR" : "อัปโหลด TOR"}</Button></div> : null}
    {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
  </form>;
}
