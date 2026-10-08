"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { trashSocJob } from "@/actions/soc";
import Button from "@/components/ui/Button";

// ลบ: moves a SOC job to the trash for 30 days (its owner or ADMIN). ADMIN can
// restore it, or delete it for good, from /admin/trash.
export default function SocTrashJobButton({ jobId, title, goToList = false }: { jobId: string; title: string; goToList?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="danger" disabled={pending} onClick={() => {
    if (!window.confirm(`ย้ายงาน "${title}" ไปถังขยะ? กู้คืนได้ภายใน 30 วันที่ผู้ดูแลระบบ > ถังขยะ`)) return;
    start(async () => {
      await trashSocJob(jobId);
      if (goToList) router.push("/soc");
      router.refresh();
    });
  }}>{pending ? "กำลังลบ…" : "ลบ"}</Button>;
}
