"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

// The OCR read of a scanned build: where it is (queue place or page), the page
// refreshing itself while it runs, and stop / resume. Pages already read are
// kept, so a resume goes on from them.
export default function SocBuildReadPanel({ buildId, status, stage, pagesDone, pagesTotal }: { buildId: string; status: string; stage: string | null; pagesDone: number; pagesTotal: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const open = status === "QUEUED" || status === "READING";

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [open, router]);

  function act(action: "cancel" | "resume") {
    setError("");
    start(async () => {
      const response = await fetch(`/api/soc/builds/${buildId}/${action}`, { method: "POST" });
      if (!response.ok) return setError((await response.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
      router.refresh();
    });
  }

  if (!open && status !== "FAILED" && status !== "CANCELLED") return null;
  return <section className="rounded-card bg-surface p-6 shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold">การอ่าน TOR ด้วย OCR</h2>
        <p className="mt-1 text-sm text-muted">{open ? (stage || "รอคิว") + (pagesTotal && !stage?.includes("/") ? ` · อ่านแล้ว ${pagesDone}/${pagesTotal} หน้า` : "") : `อ่านแล้ว ${pagesDone}/${pagesTotal ?? "-"} หน้า`}</p>
        {open ? <p className="mt-1 text-xs text-muted">อ่านในเบื้องหลัง ปิดหน้านี้แล้วกลับมาดูภายหลังได้ ไฟล์ Word จะพร้อมดาวน์โหลดเมื่ออ่านครบ</p> : null}
      </div>
      {open ? <Button size="sm" variant="outline" disabled={pending} onClick={() => act("cancel")}>{pending ? "กำลังยกเลิก…" : "ยกเลิกการอ่าน"}</Button> : <Button size="sm" disabled={pending} onClick={() => act("resume")}>{pending ? "กำลังเริ่ม…" : "อ่านต่อ"}</Button>}
    </div>
    {error ? <p role="alert" className="mt-3 text-xs text-danger">{error}</p> : null}
  </section>;
}
