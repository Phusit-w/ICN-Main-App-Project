"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import CopyButton from "@/components/CopyButton";
import { SOC_CLAUDE_LOGIN_LABELS, SOC_RUNNER_CONFIG_FILE, SOC_RUNNER_STATE_LABELS, type SocRunnerState, type SocRunnerView } from "@/lib/soc-shared";

const DOT: Record<SocRunnerState, string> = { online: "bg-[#22a06b]", offline: "bg-danger", never_seen: "bg-muted" };
const formatTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

type InstallCommand = { command: string; expiresAt: string };

// The signed-in user's SOC Runner on /soc (tickets 12, 16): whether it is
// online, when it was last seen, and the install command tied to them (or,
// for a runner run from source, the bare config, offered to ADMIN only: one
// stray click would replace a reviewer's installed runner).
export default function SocRunnerPanel({ runner: latest, showConfigDownload }: {
  runner: SocRunnerView | null; showConfigDownload: boolean;
}) {
  // A revoked latest link means an admin revoked it (a replaced link always
  // has a newer active one): show it as unlinked, with a note.
  const runner = latest && !latest.revokedAt ? latest : null;
  const revokedAt = latest?.revokedAt ?? null;
  const router = useRouter();
  const [error, setError] = useState("");
  const [install, setInstall] = useState<InstallCommand | null>(null);
  const [confirmingConfig, setConfirmingConfig] = useState(false);
  const [pending, startTransition] = useTransition();

  // Links nothing yet: the command does, when it is pasted.
  function createCommand() {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/soc/runner-install-command", { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as Partial<InstallCommand> & { error?: string };
        if (!response.ok || !body.command || !body.expiresAt) {
          setError(body.error || "สร้างคำสั่งติดตั้งไม่สำเร็จ");
          return;
        }
        setInstall({ command: body.command, expiresAt: body.expiresAt });
      } catch {
        setError("สร้างคำสั่งติดตั้งไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  // Links this account anew and stops the previous config.
  function downloadConfig() {
    setConfirmingConfig(false);
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
        anchor.download = SOC_RUNNER_CONFIG_FILE;
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
          {runner.state === "never_seen" ? `เชื่อมเมื่อ ${formatTime(runner.linkedAt)} · รอ SOC Runner บนเครื่องของคุณเชื่อมต่อครั้งแรก` : null}
          {runner.runnerVersion ? `เวอร์ชัน ${runner.runnerVersion}` : null}
          {runner.claudeLogin ? ` · ${SOC_CLAUDE_LOGIN_LABELS[runner.claudeLogin]}` : null}
        </div>
      </> : <>
        <div className="font-medium">{revokedAt ? "ลิงก์ของเครื่องคุณถูกยกเลิก" : "ยังไม่ได้เชื่อมเครื่อง"}</div>
        {revokedAt ? <div className="text-xs text-muted">ผู้ดูแลยกเลิกเมื่อ {formatTime(revokedAt)} · ติดตั้งใหม่เพื่อใช้ SOC Runner อีกครั้ง</div> : null}
        <div className="text-xs text-muted">ติดตั้งบนเครื่องของคุณด้วยคำสั่งเดียว (ไม่ต้องใช้สิทธิ์ admin) เครื่องนั้นจะรับเฉพาะงานตรวจของคุณ ด้วยบัญชี Claude ของคุณเอง</div>
      </>}
      {runner?.claudeLogin === "logged_out" ? <p role="alert" className="text-xs text-danger">SOC Runner ต้องการให้คุณเข้าสู่ระบบ Claude ใหม่บนเครื่องนั้น: เปิดโปรแกรม claude แล้วพิมพ์ /login คำขอที่รออยู่จะตรวจต่อเอง</p> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={runner ? "outline" : "primary"} disabled={pending} onClick={createCommand}>
        {pending ? "กำลังสร้าง…" : runner ? "สร้างคำสั่งติดตั้งใหม่ (ซ่อม/ย้ายเครื่อง)" : "สร้างคำสั่งติดตั้ง SOC Runner"}
      </Button>
      {showConfigDownload ? <button type="button" className="text-[11px] text-muted underline hover:text-ink disabled:opacity-50" disabled={pending} onClick={() => runner ? setConfirmingConfig(true) : downloadConfig()}>
        ดาวน์โหลดเฉพาะไฟล์เชื่อม ({SOC_RUNNER_CONFIG_FILE}) สำหรับรันจาก source
      </button> : null}
    </div>
    {install ? <InstallSteps install={install} replacing={runner !== null} /> : null}
    <ConfirmDialog
      open={confirmingConfig}
      title="ดาวน์โหลดไฟล์เชื่อมใหม่?"
      message="เครื่องที่เชื่อมอยู่เดิมจะรับงานตรวจไม่ได้ทันที จนกว่าจะใช้ไฟล์เชื่อมใหม่นี้"
      confirmLabel="ดาวน์โหลดใหม่"
      busy={pending}
      onConfirm={downloadConfig}
      onCancel={() => setConfirmingConfig(false)}
    />
  </div>;
}

// The command and how to use it, in Thai (spec story 41). Nothing is
// downloaded by the browser, so there is no SmartScreen warning to explain.
function InstallSteps({ install, replacing }: { install: InstallCommand; replacing: boolean }) {
  return <div className="w-full space-y-3 rounded-input border border-line p-3 text-xs leading-relaxed">
    <div className="flex items-start gap-2">
      <code className="block max-h-24 flex-1 select-all overflow-auto break-all rounded-input bg-chip p-2 font-mono text-[11px]">{install.command}</code>
      <CopyButton value={install.command} />
    </div>
    <ol className="list-decimal space-y-1.5 pl-5">
      <li>กด <b>คัดลอก</b></li>
      <li>เปิด <b>Windows PowerShell</b>: กดปุ่ม Windows พิมพ์ <code>powershell</code> แล้วเลือก <b>Windows PowerShell</b> (ไม่ต้อง Run as administrator)</li>
      <li>คลิกขวาในหน้าต่าง PowerShell เพื่อวางคำสั่ง แล้วกด <b>Enter</b></li>
      <li>รอให้ติดตั้งเสร็จ: ครั้งแรกจะดาวน์โหลด Python และ Claude Code (ประมาณ 250 MB) แล้วเปิดเบราว์เซอร์ให้<b>เข้าสู่ระบบ Claude ด้วยบัญชีของคุณเอง</b>หนึ่งครั้ง
        เมื่อขึ้นว่า <i>ติดตั้ง SOC Runner เสร็จแล้ว</i> ปิดหน้าต่างได้ SOC Runner จะทำงานเบื้องหลังและเริ่มเองทุกครั้งที่เข้า Windows</li>
    </ol>
    <p className="text-muted">
      คำสั่งนี้ใช้ได้ครั้งเดียว ถึง {formatTime(install.expiresAt)} และผูกกับบัญชีของคุณ อย่าส่งต่อให้ผู้อื่น
      {replacing ? " เมื่อวางคำสั่งนี้ เครื่องที่เชื่อมอยู่เดิมจะหยุดรับงานตรวจ" : ""}
      {" "}ถ้ามีหน้าต่างขอรหัส admin ให้กดยกเลิกแล้วแจ้งผู้ดูแล ถ้า SOC Runner มีปัญหา สร้างคำสั่งใหม่แล้ววางอีกครั้งได้เลย
    </p>
  </div>;
}
