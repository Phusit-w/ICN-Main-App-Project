"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProposalAction } from "@/actions/proposal";
import Button from "@/components/ui/Button";
import { SOC_TITLE_MAX } from "@/lib/soc-shared";

// "+ Proposal ใหม่": a title, then the Proposal's page opens.
export default function ProposalCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    start(async () => {
      try {
        const result = await createProposalAction(title);
        if (!result.ok) { setError(result.error); return; }
        router.push(`/soc/proposals/${result.id}`);
      } catch {
        setError("สร้างไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }
  if (!open) return <Button onClick={() => setOpen(true)}>+ Proposal ใหม่</Button>;
  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex flex-col items-end gap-2">
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={SOC_TITLE_MAX} autoFocus placeholder="ชื่อ Proposal" aria-label="ชื่อ Proposal" aria-invalid={Boolean(error)} className="min-w-[260px] rounded-input border border-line bg-surface px-3 py-2 text-sm" />
      <Button type="submit" disabled={pending}>{pending ? "กำลังสร้าง…" : "สร้าง"}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={() => { setOpen(false); setError(""); }}>ยกเลิก</Button>
    </div>
    {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
  </form>;
}
