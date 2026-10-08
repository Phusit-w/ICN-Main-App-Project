"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeSocRunner } from "@/actions/socRunners";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SOC_CLAUDE_LOGIN_LABELS, SOC_RUNNER_REVOKE_REASON_LABELS, SOC_RUNNER_STATE_LABELS, type SocRunnerView } from "@/lib/soc-shared";

export type AdminSocRunnerLink = SocRunnerView & { id: string; username: string; userDisplayName: string; revokedByName: string | null };
const formatTime = (value: string) => new Date(value).toLocaleString("th-TH");

export default function AdminSocRunners({ links }: { links: AdminSocRunnerLink[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [target, setTarget] = useState<AdminSocRunnerLink | null>(null);
  const [pending, startTransition] = useTransition();
  function revoke() {
    if (!target) return;
    setError("");
    startTransition(async () => {
      const result = await revokeSocRunner(target.id);
      if (!result.ok) setError(result.error);
      setTarget(null);
      router.refresh();
    });
  }
  if (!links.length) return <p className="text-sm text-muted">ยังไม่มีผู้ใช้เชื่อม SOC Runner</p>;
  return <div className="overflow-x-auto rounded-card border border-line bg-surface">
    {error ? <p role="alert" className="p-4 text-xs text-danger">{error}</p> : null}
    <table className="w-full text-left text-sm"><thead className="bg-chip text-xs text-label"><tr><th className="px-5 py-3">ผู้ใช้</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">เห็นล่าสุด</th><th className="px-5 py-3">เชื่อมเมื่อ</th><th className="px-5 py-3" aria-label="การทำงาน" /></tr></thead>
      <tbody>{links.map((l) => <tr key={l.id} className={`border-t border-line ${l.revokedAt ? "text-muted" : ""}`}>
        <td className="px-5 py-3">{l.userDisplayName}<div className="text-xs text-muted">{l.username}</div></td>
        <td className="px-5 py-3 text-xs">{l.revokedAt
          ? <>ยกเลิกแล้ว{l.revokeReason ? ` · ${SOC_RUNNER_REVOKE_REASON_LABELS[l.revokeReason]}` : ""}{l.revokedByName && l.revokeReason === "admin" ? ` (${l.revokedByName})` : ""}<div>{formatTime(l.revokedAt)}</div></>
          : <><span className="rounded-full bg-chip px-3 py-1 font-medium">{SOC_RUNNER_STATE_LABELS[l.state]}</span>{l.claudeLogin ? <div className="mt-1.5">{SOC_CLAUDE_LOGIN_LABELS[l.claudeLogin]}</div> : null}</>}</td>
        <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{l.lastSeenAt ? formatTime(l.lastSeenAt) : "–"}{l.runnerVersion ? <div className="font-mono">v{l.runnerVersion}</div> : null}</td>
        <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{formatTime(l.linkedAt)}</td>
        <td className="whitespace-nowrap px-5 py-3 text-right">{l.revokedAt ? null : <Button size="sm" variant="danger" disabled={pending} onClick={() => setTarget(l)}>ยกเลิกลิงก์</Button>}</td>
      </tr>)}</tbody>
    </table>
    <ConfirmDialog
      open={Boolean(target)}
      title="ยกเลิกลิงก์ SOC Runner?"
      message={`SOC Runner ของ ${target?.userDisplayName ?? ""} จะรับงานตรวจไม่ได้ทันที ผู้ใช้ต้องดาวน์โหลดไฟล์เชื่อมใหม่จากหน้า SOC จึงจะใช้ได้อีกครั้ง`}
      confirmLabel="ยกเลิกลิงก์"
      danger
      busy={pending}
      onConfirm={revoke}
      onCancel={() => setTarget(null)}
    />
  </div>;
}
