"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameProposalAction, trashProposalAction } from "@/actions/proposal";
import Button from "@/components/ui/Button";
import { SOC_TITLE_MAX } from "@/lib/soc-shared";

// The Proposal page's title with rename (✎) and ลบ: both for the creator and
// ADMIN only (`canManage`). ADMIN restores or purges from /admin/trash.
export default function ProposalHeaderActions({ id, title, canManage }: { id: string; title: string; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      try {
        const result = await renameProposalAction(id, draft);
        if (!result.ok) { setError(result.error); return; }
        setEditing(false);
        router.refresh();
      } catch {
        setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }
  function trash() {
    if (!window.confirm(`ย้าย Proposal "${title}" ไปถังขยะ? กู้คืนได้ภายใน 30 วันที่ผู้ดูแลระบบ > ถังขยะ หลังจากนั้นจะลบถาวรพร้อมไฟล์`)) return;
    start(async () => {
      await trashProposalAction(id);
      router.push("/soc");
    });
  }
  if (editing) {
    return <form className="mt-2" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={SOC_TITLE_MAX} autoFocus aria-label="ชื่อ Proposal" aria-invalid={Boolean(error)} className="min-w-[260px] rounded-input border border-line bg-surface px-3 py-2 text-sm" />
        <Button size="sm" type="submit" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึก"}</Button>
        <Button size="sm" type="button" variant="outline" disabled={pending} onClick={() => setEditing(false)}>ยกเลิก</Button>
      </div>
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </form>;
  }
  return <div className="mt-2 flex flex-wrap items-center gap-2">
    <h1 className="font-display text-[28px] font-bold">{title}</h1>
    {canManage ? <>
      <Button size="sm" variant="ghost" onClick={() => { setDraft(title); setError(""); setEditing(true); }} aria-label="เปลี่ยนชื่อ Proposal">✎ เปลี่ยนชื่อ</Button>
      <Button size="sm" variant="danger" disabled={pending} onClick={trash}>ลบ</Button>
    </> : null}
  </div>;
}
