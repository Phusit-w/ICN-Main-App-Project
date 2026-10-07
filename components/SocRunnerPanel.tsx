"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SOC_CLAUDE_LOGIN_LABELS, SOC_RUNNER_CONFIG_FILE, SOC_RUNNER_INSTALLER_FILE, SOC_RUNNER_STATE_LABELS, type SocRunnerState, type SocRunnerView } from "@/lib/soc-shared";

const DOT: Record<SocRunnerState, string> = { online: "bg-[#22a06b]", offline: "bg-danger", never_seen: "bg-muted" };
const formatTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

type Download = { url: string; fileName: string };
const INSTALLER: Download = { url: "/api/soc/runner-installer", fileName: SOC_RUNNER_INSTALLER_FILE };
const CONFIG: Download = { url: "/api/soc/runner-link", fileName: SOC_RUNNER_CONFIG_FILE };

// The signed-in user's SOC Runner on /soc (tickets 12, 16): whether it is
// online, when it was last seen, and the download of the installer (or, for
// a runner run from source, the bare config, offered to ADMIN only: one
// stray click would replace a reviewer's installed runner) tied to them.
export default function SocRunnerPanel({ runner: latest, installerAvailable, showConfigDownload }: {
  runner: SocRunnerView | null; installerAvailable: boolean; showConfigDownload: boolean;
}) {
  // A revoked latest link means an admin revoked it (a replaced link always
  // has a newer active one): show it as unlinked, with a note.
  const runner = latest && !latest.revokedAt ? latest : null;
  const revokedAt = latest?.revokedAt ?? null;
  const router = useRouter();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<Download | null>(null);
  const [pending, startTransition] = useTransition();

  // Either download links this account anew and stops the previous config.
  function requestDownload(target: Download) {
    if (runner) setConfirming(target);
    else download(target);
  }

  function download(target: Download) {
    setConfirming(null);
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch(target.url, { method: "POST" });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error || "ดาวน์โหลดไม่สำเร็จ");
          return;
        }
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = target.fileName;
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
          {runner.state === "never_seen" ? `ดาวน์โหลดเมื่อ ${formatTime(runner.linkedAt)} · รอ SOC Runner บนเครื่องของคุณเชื่อมต่อครั้งแรก` : null}
          {runner.runnerVersion ? `เวอร์ชัน ${runner.runnerVersion}` : null}
          {runner.claudeLogin ? ` · ${SOC_CLAUDE_LOGIN_LABELS[runner.claudeLogin]}` : null}
        </div>
      </> : <>
        <div className="font-medium">{revokedAt ? "ลิงก์ของเครื่องคุณถูกยกเลิก" : "ยังไม่ได้เชื่อมเครื่อง"}</div>
        {revokedAt ? <div className="text-xs text-muted">ผู้ดูแลยกเลิกเมื่อ {formatTime(revokedAt)} · ดาวน์โหลดตัวติดตั้งใหม่เพื่อใช้ SOC Runner อีกครั้ง</div> : null}
        <div className="text-xs text-muted">ดาวน์โหลดตัวติดตั้งแล้วเปิดบนเครื่องของคุณ (ไม่ต้องใช้สิทธิ์ admin) เครื่องนั้นจะรับเฉพาะงานตรวจของคุณ ด้วยบัญชี Claude ของคุณเอง</div>
      </>}
      {runner?.claudeLogin === "logged_out" ? <p role="alert" className="text-xs text-danger">SOC Runner ต้องการให้คุณเข้าสู่ระบบ Claude ใหม่บนเครื่องนั้น: เปิดโปรแกรม claude แล้วพิมพ์ /login คำขอที่รออยู่จะตรวจต่อเอง</p> : null}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
    <div className="flex flex-col items-end gap-1">
      {installerAvailable
        ? <Button size="sm" variant={runner ? "outline" : "primary"} disabled={pending} onClick={() => requestDownload(INSTALLER)}>
          {pending ? "กำลังเตรียมไฟล์…" : runner ? "ดาวน์โหลดตัวติดตั้งใหม่ (ซ่อม/ย้ายเครื่อง)" : "ดาวน์โหลดตัวติดตั้ง SOC Runner"}
        </Button>
        : <span className="text-xs text-muted">ยังไม่มีตัวติดตั้งบน server ติดต่อ admin</span>}
      {showConfigDownload ? <button type="button" className="text-[11px] text-muted underline hover:text-ink disabled:opacity-50" disabled={pending} onClick={() => requestDownload(CONFIG)}>
        ดาวน์โหลดเฉพาะไฟล์เชื่อม ({SOC_RUNNER_CONFIG_FILE}) สำหรับรันจาก source
      </button> : null}
      <span className="text-[11px] text-muted">ไฟล์ที่ดาวน์โหลดผูกกับบัญชีของคุณ ใช้แทนรหัสผ่าน อย่าส่งต่อให้ผู้อื่น</span>
    </div>
    {installerAvailable ? <SmartScreenHelp open={!runner} /> : null}
    <ConfirmDialog
      open={confirming !== null}
      title={confirming === INSTALLER ? "ดาวน์โหลดตัวติดตั้งใหม่?" : "ดาวน์โหลดไฟล์เชื่อมใหม่?"}
      message="เครื่องที่ใช้ตัวติดตั้งหรือไฟล์เชื่อมเดิมจะรับงานตรวจไม่ได้ทันที จนกว่าจะติดตั้งด้วยไฟล์ใหม่นี้ (ใช้เมื่อซ่อมเครื่องเดิมหรือย้ายไปเครื่องใหม่)"
      confirmLabel="ดาวน์โหลดใหม่"
      busy={pending}
      onConfirm={() => confirming && download(confirming)}
      onCancel={() => setConfirming(null)}
    />
  </div>;
}

// The installer is unsigned (ADR 0008): the browser and Windows SmartScreen
// warn the first time. Told in Thai before it happens (spec story 41).
function SmartScreenHelp({ open }: { open: boolean }) {
  return <details open={open} className="w-full rounded-input border border-line p-3 text-xs leading-relaxed">
    <summary className="cursor-pointer text-sm font-medium">วิธีติดตั้ง และคำเตือนของ Windows ที่จะเห็น</summary>
    <ol className="mt-2 list-decimal space-y-1.5 pl-5">
      <li>กด <b>ดาวน์โหลดตัวติดตั้ง SOC Runner</b> ถ้าเบราว์เซอร์บอกว่าไฟล์นี้<i>ไม่ได้ดาวน์โหลดโดยทั่วไป</i> (not commonly downloaded) ให้กด <b>…</b> แล้วเลือก <b>เก็บไว้</b> (Keep)
        ถ้า Edge ถามต่อ ให้กด <b>แสดงเพิ่มเติม</b> (Show more) แล้ว <b>เก็บไว้ต่อไป</b> (Keep anyway)</li>
      <li>ดับเบิลคลิก <code>{SOC_RUNNER_INSTALLER_FILE}</code> ถ้าขึ้นหน้าจอสีน้ำเงิน <i>Windows ปกป้องพีซีของคุณ</i> (Windows protected your PC) ให้กด <b>ข้อมูลเพิ่มเติม</b> (More info) แล้วกด <b>เรียกใช้ต่อไป</b> (Run anyway)</li>
      <li>หน้าต่างติดตั้งจะดาวน์โหลด Claude Code (ครั้งแรกประมาณ 200 MB) แล้วเปิดเบราว์เซอร์ให้<b>เข้าสู่ระบบ Claude ด้วยบัญชีของคุณเอง</b>หนึ่งครั้ง เสร็จแล้ว SOC Runner จะทำงานเบื้องหลังและเริ่มเองทุกครั้งที่เข้า Windows</li>
      <li>ติดตั้งเสร็จแล้ว<b>ลบไฟล์ {SOC_RUNNER_INSTALLER_FILE} ที่ดาวน์โหลดทิ้ง</b> ไฟล์นี้มีรหัสเชื่อมของคุณ ใครเอาไปติดตั้งก็รับงานตรวจในนามคุณได้</li>
    </ol>
    <p className="mt-2 text-muted">
      Windows เตือนเพราะตัวติดตั้งนี้ทีมเราสร้างเองและยังไม่ได้ลงลายเซ็นดิจิทัล (code signing) ไม่ได้แปลว่าพบไวรัส
      ตัวติดตั้งไม่ต้องใช้สิทธิ์ admin ถ้ามีหน้าต่างขอรหัส admin ให้กดยกเลิกแล้วแจ้งผู้ดูแล
      ดาวน์โหลดจากหน้านี้เท่านั้น ถ้า SOC Runner มีปัญหา ดาวน์โหลดตัวติดตั้งใหม่แล้วติดตั้งซ้ำได้เลย
    </p>
  </details>;
}
