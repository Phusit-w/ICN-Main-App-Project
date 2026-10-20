import { requirePageAccess } from "@/lib/authorization";
import SocUploadForm from "@/components/SocUploadForm";
import SocGuidedTour from "@/components/SocGuidedTour";
import { SOC_NEW_JOB_TOUR } from "@/lib/soc-tours";

export const dynamic = "force-dynamic";

export default async function NewSocJobPage() {
  await requirePageAccess("soc");
  return <div className="flex flex-col gap-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-[28px] font-bold">สร้างงานตรวจ SOC</h1><p className="mt-1 text-sm text-muted">อัปโหลด SOC และเอกสารหลักฐาน ระบบจะแยกข้อใหญ่ของ SOC ให้ตรวจทีละข้อ</p></div><SocGuidedTour tourId="soc-new-job" steps={SOC_NEW_JOB_TOUR} /></div><SocUploadForm /></div>;
}
