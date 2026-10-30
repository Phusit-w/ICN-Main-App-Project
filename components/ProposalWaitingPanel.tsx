"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelSocCheckRequest } from "@/actions/socCheckRequests";
import Button from "@/components/ui/Button";
import SocRefreshWhile from "@/components/SocRefreshWhile";
import type { WaitingRequestView } from "@/lib/soc-check-requests";

const formatTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

// What this Proposal sent to รอคนรับ and has not finished (ADR 0013): still
// waiting, taken by a teammate ("ข รับแล้ว"), or running. The asker or an ADMIN
// may cancel before the run starts; a taker who goes quiet puts it back.
export default function ProposalWaitingPanel({ requests, viewerId, viewerIsAdmin }: { requests: WaitingRequestView[]; viewerId: string; viewerIsAdmin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  if (!requests.length) return null;
  function cancel(request: WaitingRequestView) {
    setError("");
    startTransition(async () => {
      try {
        const result = await cancelSocCheckRequest(request.jobId, request.id);
        if (!result.ok) setError(result.error);
      } catch {
        setError("ยกเลิกไม่สำเร็จ กรุณาลองใหม่");
      }
      router.refresh();
    });
  }
  return <section className="rounded-card bg-surface p-5 shadow-card" aria-label="รอคนรับ">
    <SocRefreshWhile active />
    <h2 className="font-display text-lg font-semibold">รอคนรับ</h2>
    <p className="mt-1 text-xs text-muted">งานของ Proposal นี้ที่ส่งให้คนอื่นตรวจแทน ยกเลิกได้ก่อนเริ่มตรวจ ถ้าคนรับปิดเครื่องไปงานจะกลับมารอคนรับใหม่</p>
    <ul className="mt-3 flex flex-col divide-y divide-line text-sm">{requests.map((request) => <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p><span className="font-medium">{request.step}</span> · {request.item}{request.rowCount ? ` · ${request.rowCount} แถว` : ""}</p>
        <p className="text-xs text-muted">{request.takerName ? `${request.takerName} รับแล้ว${request.state === "running" ? " · กำลังตรวจ" : ""}` : "รอคนรับ"} · ขอโดย {request.askerId === viewerId ? "คุณ" : request.askerName} · {formatTime(request.createdAt)} · <Link href={`/soc/${request.jobId}`} className="text-muted underline">ดูงานตรวจ</Link></p>
      </div>
      {request.askerId === viewerId || viewerIsAdmin ? <Button size="sm" variant="outline" disabled={pending} onClick={() => cancel(request)}>ยกเลิก</Button> : null}
    </li>)}</ul>
    {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
  </section>;
}
