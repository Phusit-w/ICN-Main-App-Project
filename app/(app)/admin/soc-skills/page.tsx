import AdminSocSkills from "@/components/AdminSocSkills";
import { listSocSkillPackages } from "@/lib/soc-skill-package";

export const dynamic = "force-dynamic";

// Admin Center: versions of the SOC skill that SOC Runners download (ADR
// 0008). The admin layout already restricts this page to ADMIN; the lib
// functions check again.
export default async function AdminSocSkillsPage() {
  const packages = await listSocSkillPackages();
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-bold">SOC skill</h2>
      <p className="text-sm text-muted">
        เวอร์ชันของ skill ตรวจ SOC ที่ SOC Runner ทุกเครื่องดาวน์โหลดไปใช้ในการตรวจครั้งถัดไป มีเวอร์ชันปัจจุบันได้ครั้งละหนึ่งเวอร์ชัน
        ข้อใหญ่ที่ตรวจด้วยเวอร์ชันเก่ากว่าจะมีป้ายเตือนในหน้างาน
      </p>
      <AdminSocSkills packages={packages.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))} />
    </section>
  );
}
