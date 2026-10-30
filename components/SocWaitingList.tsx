"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { takeSocCheckRequests } from "@/actions/socCheckRequests";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import type { WaitingRequestView } from "@/lib/soc-check-requests";

const formatTime = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

// The รอคนรับ list (ADR 0013): requests teammates sent away, grouped by SOC
// job. Taking one, or "รับทั้งชุด" for a whole job, is the viewer's own click
// after a popup saying it uses their Claude quota; it then runs on their
// Runner only. Without a Runner of their own the viewer can only look.
export default function SocWaitingList({ requests, canTake }: { requests: WaitingRequestView[]; canTake: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [dialog, confirm] = useConfirmDialog();
  const byJob = new Map<string, WaitingRequestView[]>();
  for (const request of requests) byJob.set(request.jobId, [...(byJob.get(request.jobId) ?? []), request]);
  const groups = [...byJob.values()];

  async function take(target: { requestId: string } | { jobId: string }, what: string, count: number) {
    setError("");
    // Not in a transition: a transition would hold the confirm dialog back until it ended.
    if (!(await confirm({ title: `รับ${what}?`, message: `SOC Runner บนเครื่องของคุณจะตรวจ${what}${count > 1 ? ` (${count} คำขอ ทีละข้อ)` : ""} ด้วยโควตา Claude ของคุณเอง ผลจะบันทึกว่าขอโดยเพื่อนและตรวจโดยคุณ`, confirmLabel: "รับงานนี้" }))) return;
    startTransition(async () => {
      const result = await takeSocCheckRequests(target, true);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  if (!requests.length) return <p className="rounded-card bg-surface p-5 text-sm text-muted shadow-card">ตอนนี้ไม่มีงานรอคนรับ</p>;
  return <div className="flex flex-col gap-4">
    {dialog}
    {error ? <p role="alert" className="rounded-input border border-danger-border p-3 text-sm text-danger">{error}</p> : null}
    {groups.map((group) => {
      const first = group[0];
      return <section key={first.jobId} className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h2 className="font-display font-semibold">{first.proposalId ? <Link href={`/soc/proposals/${first.proposalId}`} className="text-ink no-underline hover:underline">{first.proposalTitle}</Link> : first.jobTitle}</h2>
            <p className="text-xs text-muted">ขอโดย {first.askerName} · <Link href={`/soc/${first.jobId}`} className="text-muted underline">งานตรวจ {first.jobTitle}</Link></p>
          </div>
          {canTake && group.length > 1 ? <Button size="sm" disabled={pending} onClick={() => take({ jobId: first.jobId }, `ทั้งชุด ${group.length} ข้อใหญ่`, group.length)}>รับทั้งชุด ({group.length})</Button> : null}
        </div>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead className="bg-chip text-left text-xs text-label"><tr><th className="px-5 py-2">ขั้น</th><th className="px-5 py-2">ข้อใหญ่</th><th className="px-5 py-2">แถว</th><th className="px-5 py-2">ขอเมื่อ</th><th className="px-5 py-2" aria-label="รับ" /></tr></thead>
          <tbody>{group.map((request) => <tr key={request.id} className="border-t border-line"><td className="px-5 py-2">{request.step}</td><td className="px-5 py-2">{request.item}</td><td className="px-5 py-2 text-muted">{request.rowCount ? `${request.rowCount} แถว` : "ทั้งข้อ"}</td><td className="px-5 py-2 text-muted">{formatTime(request.createdAt)}</td><td className="px-5 py-2 text-right">{canTake ? <Button size="sm" variant="outline" disabled={pending} onClick={() => take({ requestId: request.id }, request.item, 1)}>รับ</Button> : null}</td></tr>)}</tbody></table></div>
      </section>;
    })}
  </div>;
}
