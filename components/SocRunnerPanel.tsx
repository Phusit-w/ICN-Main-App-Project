"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SOC_CLAUDE_LOGIN_LABELS, SOC_RUNNER_STATE_LABELS, type SocRunnerState } from "@/lib/soc-shared";

export type MySocRunner = {
  state: SocRunnerState; lastSeenAt: string | null; runnerVersion: string | null; claudeLogin: string | null; linkedAt: string;
} | null;

const DOT: Record<SocRunnerState, string> = { online: "bg-[#22a06b]", offline: "bg-danger", never_seen: "bg-muted" };
const formatTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

// The signed-in user's SOC Runner on /soc (ticket 12): whether it is online,
// when it was last seen, and the download of the runner config tied to them.
export default function SocRunnerPanel({ runner }: { runner: MySocRunner }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function download() {
    setConfirming(false);
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/soc/runner-link", { method: "POST" });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error || "ดาวน์โหลดไม่สำเร็จ");
          return;
        }
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "soc-runner.json";
        anchor.click();
        URL.revokeObjectURL(url);
        router.refresh();
      } catch {
        setError("ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  return <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface p-5 shadow-card">
    <div className="space-y-1">
      <div className="text-xs font-medium text-label">SOC Runner ของคุณ</div>
      {runner ? <>
        <div className="flex items-center gap-2 font-medium"><span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[runner.state]}`} />{SOC_RUNNER_STATE_LABELS[runner.state]}
          {runner.lastSeenAt ? <span className="text-xs font-normal text-muted">· เห็นล่าสุด {formatTime(runner.lastSeenAt)}</span> : null}
        </div>
        <div className="text-xs text-muted">
          {runner.state === "never_seen" ? `ดาวน์โหลดไฟล์เชื่อมเมื่อ ${formatTime(runner.linkedAt)} · รอ SOC Runner บนเครื่องของคุณเชื่อมต่อครั้งแรก` : null}
          {runner.runnerVersion ? `เวอร์ชัน ${runner.runnerVersion}` : null}
          {runner.claudeLogin ? ` · ${SOC_CLAUDE_LOGIN_LABELS[runner.claudeLogin] ?? runner.claudeLogin}` : null}
        </div>
      </> : <>
        <div className="font-medium">ยังไม่ได้เชื่อมเครื่อง</div>
        <div className="text-xs text-muted">ดาวน์โหลดไฟล์เชื่อม (soc-runner.json) แล้ววางไว้ข้างโปรแกรม SOC Runner เครื่องนั้นจะรับเฉพาะงานตรวจของคุณ</div>
      </>}
      {runner?.claudeLogin === "logged_out" ? <p role="alert" className="text-xs text-danger">SOC Runner ต้องการให้คุณเข้าสู่ระบบ Claude ใหม่บนเครื่องนั้น</p> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={runner ? "outline" : "primary"} disabled={pending} onClick={() => (runner ? setConfirming(true) : download())}>
        {pending ? "กำลังสร้างไฟล์…" : runner ? "ดาวน์โหลดไฟล์เชื่อมใหม่" : "ดาวน์โหลดไฟล์เชื่อม SOC Runner"}
      </Button>
      <span className="text-[11px] text-muted">ไฟล์นี้ใช้แทนรหัสผ่านของคุณสำหรับ SOC Runner อย่าส่งต่อให้ผู้อื่น</span>
    </div>
    <ConfirmDialog
      open={confirming}
      title="ดาวน์โหลดไฟล์เชื่อมใหม่?"
      message="ไฟล์เชื่อมเดิมจะใช้ไม่ได้ทันที เครื่องที่ใช้ไฟล์เดิมจะรับงานตรวจไม่ได้จนกว่าจะเปลี่ยนเป็นไฟล์ใหม่"
      confirmLabel="ดาวน์โหลดใหม่"
      busy={pending}
      onConfirm={download}
      onCancel={() => setConfirming(false)}
    />
  </div>;
}
