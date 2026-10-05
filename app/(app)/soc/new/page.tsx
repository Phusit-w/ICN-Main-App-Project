import { requirePageAccess } from "@/lib/authorization";
import SocUploadForm from "@/components/SocUploadForm";

export const dynamic = "force-dynamic";

export default async function NewSocJobPage() {
  await requirePageAccess("soc");
  return <div className="flex flex-col gap-6"><div><h1 className="font-display text-[28px] font-bold">สร้างงานตรวจ SOC</h1><p className="mt-1 text-sm text-muted">อัปโหลด SOC และเอกสารหลักฐาน ระบบจะประมวลผลในคิวเบื้องหลัง</p></div><SocUploadForm /></div>;
}
