"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

// ลบ: deletes a SOC Build and its files for good (its owner or ADMIN).
export default function SocBuildDeleteButton({ buildId, title, goToList = false }: { buildId: string; title: string; goToList?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <>
    <Button size="sm" variant="danger" disabled={pending} onClick={() => {
      if (!window.confirm(`ลบ SOC ที่สร้าง "${title}"? ไฟล์ SOC และ TOR ที่เก็บไว้จะถูกลบถาวร`)) return;
      setError("");
      start(async () => {
        const response = await fetch(`/api/soc/builds/${buildId}`, { method: "DELETE" });
        if (!response.ok) return setError((await response.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
        if (goToList) router.push("/soc/builds");
        router.refresh();
      });
    }}>{pending ? "กำลังลบ…" : "ลบ"}</Button>
    {error ? <span role="alert" className="ml-2 text-xs text-danger">{error}</span> : null}
  </>;
}
