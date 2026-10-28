import { requirePageAccess } from "@/lib/authorization";
import { requireSocActor } from "@/lib/soc";
import { listSocTemplates } from "@/lib/soc-templates";
import SocBuildForm from "@/components/SocBuildForm";
import SocSectionTabs from "@/components/SocSectionTabs";

export const dynamic = "force-dynamic";

export default async function NewSocBuildPage() {
  await requirePageAccess("soc");
  const actor = await requireSocActor();
  const templates = (await listSocTemplates()).map((t) => ({ id: t.id, name: t.name, addedByName: t.addedByName, canDelete: t.addedById === actor.id || actor.role === "ADMIN" }));
  return <div className="flex flex-col gap-6">
    <SocSectionTabs active="build" />
    <div><h1 className="font-display text-[28px] font-bold">สร้าง SOC ใหม่</h1><p className="mt-1 text-sm text-muted">เลือก TOR ช่วงหน้า และเทมเพลต ระบบแยกเป็นข้อให้ด้วยโค้ด (ไม่ใช้ AI) แล้วเติมลงตารางของเทมเพลต</p></div>
    <SocBuildForm templates={templates} />
  </div>;
}
