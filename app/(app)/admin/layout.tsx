import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
const links = [["/admin", "ภาพรวม"], ["/admin/users", "ผู้ใช้"], ["/admin/activity", "ประวัติกิจกรรม"], ["/admin/project-card-terms", "หมวดหมู่โครงการ"], ["/admin/soc-skills", "SOC skill"], ["/admin/trash", "ถังขยะ"], ["/admin/system", "สถานะระบบ"]];
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/");

  return <div className="space-y-6"><div><h1 className="font-display text-3xl font-bold">Admin Center</h1><p className="mt-1 text-sm text-muted">จัดการสิทธิ์ ตรวจสอบกิจกรรม และดูแลข้อมูลทุกระบบ</p></div><nav className="flex flex-wrap gap-2">{links.map(([href, label]) => <Link key={href} href={href} className="rounded-input border border-line bg-surface px-4 py-2 text-sm hover:bg-hover">{label}</Link>)}</nav>{children}</div>;
}
