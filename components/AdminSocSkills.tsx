"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCurrentSocSkill } from "@/actions/socSkills";
import Button from "@/components/ui/Button";

export type AdminSocSkill = {
  id: string; version: string; originalName: string; sizeBytes: number; checksum: string;
  createdAt: string; uploadedByName: string | null; isCurrent: boolean;
};

const field = "rounded-input border border-line bg-surface px-3 py-2 text-sm font-normal";

export default function AdminSocSkills({ packages }: { packages: AdminSocSkill[] }) {
  return <div className="space-y-4"><UploadForm first={packages.length === 0} /><PackageList packages={packages} /></div>;
}

function UploadForm({ first }: { first: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/soc-skills", { method: "POST", body: formData });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) { setError(body.error || "อัปโหลดไม่สำเร็จ"); return; }
        form.reset();
        router.refresh();
      } catch {
        setError("อัปโหลดไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }
  return <form onSubmit={submit} className="space-y-3 rounded-card border border-line bg-surface p-5">
    <h3 className="font-medium">อัปโหลดเวอร์ชันใหม่</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-xs font-medium text-label">ไฟล์ skill (.skill หรือ .zip)<input name="package" type="file" required accept=".skill,.zip,application/zip" className={field} /></label>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-label">เวอร์ชัน<input name="version" maxLength={100} placeholder="เว้นว่างเพื่อใช้ sha256 ของไฟล์" className={field} /></label>
    </div>
    <p className="text-xs text-muted">{first ? "เวอร์ชันแรกที่อัปโหลดจะเป็นเวอร์ชันปัจจุบันทันที" : "เวอร์ชันใหม่ยังไม่ถูกใช้จนกว่าจะกด \"ตั้งเป็นเวอร์ชันปัจจุบัน\""} — server จะเพิ่มคำสั่งโหมด headless (HEADLESS.md) ให้ package ที่ SOC Runner ดาวน์โหลด</p>
    {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "กำลังอัปโหลด…" : "อัปโหลด"}</Button></div>
  </form>;
}

function PackageList({ packages }: { packages: AdminSocSkill[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function makeCurrent(id: string) {
    setError("");
    startTransition(async () => {
      const result = await setCurrentSocSkill(id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }
  if (!packages.length) return <p className="text-sm text-muted">ยังไม่มี skill บน server</p>;
  return <div className="overflow-x-auto rounded-card border border-line bg-surface">
    {error ? <p role="alert" className="p-4 text-xs text-danger">{error}</p> : null}
    <table className="w-full text-left text-sm"><thead className="bg-chip text-xs text-label"><tr><th className="px-5 py-3">เวอร์ชัน</th><th className="px-5 py-3">ไฟล์</th><th className="px-5 py-3">อัปโหลด</th><th className="px-5 py-3" aria-label="การทำงาน" /></tr></thead>
      <tbody>{packages.map((p) => <tr key={p.id} className="border-t border-line">
        <td className="px-5 py-3"><span className="font-mono text-xs">{p.version}</span>{p.isCurrent ? <span className="ml-2 rounded-full bg-chip px-3 py-1 text-xs font-medium">เวอร์ชันปัจจุบัน</span> : null}</td>
        <td className="px-5 py-3 text-xs text-muted">{p.originalName} · {(p.sizeBytes / 1024).toFixed(0)} KB<br /><span className="font-mono" title={p.checksum}>sha256 {p.checksum.slice(0, 16)}</span></td>
        <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{new Date(p.createdAt).toLocaleString("th-TH")}{p.uploadedByName ? ` · ${p.uploadedByName}` : ""}</td>
        <td className="whitespace-nowrap px-5 py-3 text-right"><a href={`/api/admin/soc-skills/${p.id}`} className="mr-3 text-xs underline">ดาวน์โหลด</a>{p.isCurrent ? null : <Button size="sm" variant="outline" disabled={pending} onClick={() => makeCurrent(p.id)}>ตั้งเป็นเวอร์ชันปัจจุบัน</Button>}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
