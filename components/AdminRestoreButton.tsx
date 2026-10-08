"use client";
import { useTransition } from "react";
import { purgeSocJob, restoreExpense, restoreSocJob } from "@/actions/admin";
import Button from "@/components/ui/Button";
export default function AdminRestoreButton({ id, kind }: { id: string; kind: "expense" | "soc" }) { const [pending, start] = useTransition(); return <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { if (kind === "expense") await restoreExpense(id); else await restoreSocJob(id); })}>{pending ? "กำลังกู้คืน…" : "กู้คืน"}</Button>; }

// ลบถาวร: a SOC job in the trash, with its files. Can't be undone.
export function AdminPurgeSocJobButton({ id, title }: { id: string; title: string }) { const [pending, start] = useTransition(); return <Button size="sm" variant="danger" disabled={pending} onClick={() => { if (!window.confirm(`ลบงาน "${title}" ถาวร? ไฟล์ SOC, PDF และผลตรวจทั้งหมดจะถูกลบและกู้คืนไม่ได้`)) return; start(async () => { await purgeSocJob(id); }); }}>{pending ? "กำลังลบ…" : "ลบถาวร"}</Button>; }
