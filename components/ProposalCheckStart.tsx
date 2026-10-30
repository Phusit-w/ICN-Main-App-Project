"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startProposalCheckAction } from "@/actions/proposal";
import Button from "@/components/ui/Button";
import type { CheckStatus } from "@/lib/proposal-check";

const link = "inline-flex h-9 items-center rounded-input bg-chip px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-hover";

// The start button and links of a check step (ตรวจ TOR ตรงต้นฉบับ, ตรวจหลักฐาน):
// the first ตรวจ of the current SOC Version makes its SOC job and opens it; the
// job and review pages are the existing ones. A step with an older result
// (ต้องทำใหม่) links to it. `blocked` says why a check can't start yet.
export default function ProposalCheckStart({ proposalId, kind, status, jobId, staleJobId, blocked }: {
  proposalId: string; kind: "tor" | "evidence"; status: CheckStatus;
  jobId: string | null; staleJobId: string | null; blocked: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function start() {
    setError("");
    startTransition(async () => {
      const result = await startProposalCheckAction(proposalId, kind);
      if (!result.ok) return setError(result.error);
      router.push(`/soc/${result.jobId}`);
    });
  }
  const canStart = !blocked && (status === "todo" || status === "stale");
  return <div className="mt-3 flex flex-wrap items-center gap-3">
    {canStart ? <Button size="sm" onClick={start} disabled={pending}>{pending ? "กำลังเตรียมงานตรวจ…" : jobId ? "ไปที่งานตรวจ" : status === "stale" ? "ตรวจใหม่" : "เริ่มตรวจ"}</Button> : null}
    {jobId && (status === "doing" || status === "done") ? <Link href={`/soc/${jobId}`} className={link}>เปิดงานตรวจ ↗</Link> : null}
    {staleJobId ? <Link href={`/soc/${staleJobId}`} className={link}>ดูผลเก่า ↗</Link> : null}
    {blocked && (status === "todo" || status === "stale") ? <span className="text-xs text-muted">{blocked}</span> : null}
    {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
  </div>;
}
