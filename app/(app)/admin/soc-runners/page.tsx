import AdminSocRunners from "@/components/AdminSocRunners";
import { listSocRunnerLinks } from "@/lib/soc-runner";

export const dynamic = "force-dynamic";

// Admin Center: every SOC Runner link (ADR 0008, ticket 12). The admin
// layout already restricts this page to ADMIN; the lib functions check again.
export default async function AdminSocRunnersPage() {
  const links = await listSocRunnerLinks();
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-bold">SOC Runner</h2>
      <p className="text-sm text-muted">
        เครื่องของผู้ใช้ที่เชื่อมกับเว็บเพื่อรับงานตรวจ SOC ผู้ใช้หนึ่งคนมีลิงก์ที่ใช้งานได้ครั้งละหนึ่งลิงก์ (ดาวน์โหลดใหม่ = แทนลิงก์เดิม)
        ยกเลิกลิงก์เมื่อเครื่องหายหรือเปลี่ยนผู้ใช้ เครื่องนั้นจะรับงานไม่ได้ทันที
      </p>
      <AdminSocRunners links={links} />
    </section>
  );
}
