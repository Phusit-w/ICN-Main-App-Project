import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/authorization";
import { SOC_BUILD_OCR_BETA_NOTE, SOC_BUILD_STATUS_LABELS } from "@/lib/soc-shared";
import { authorizeSocBuild } from "@/lib/soc-builds";
import SocBuildDeleteButton from "@/components/SocBuildDeleteButton";
import SocBuildReadPanel from "@/components/SocBuildReadPanel";
import { waitingTab } from "@/lib/soc-waiting-tab";
import SocSectionTabs from "@/components/SocSectionTabs";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(value);

export default async function SocBuildPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess("soc");
  const { id } = await params;
  let build;
  try { ({ build } = await authorizeSocBuild(id)); } catch { notFound(); }
  const warnings = Array.isArray(build.warnings) ? build.warnings.filter((w): w is string => typeof w === "string") : [];
  const facts: [string, string][] = [["TOR", build.torName], ["ช่วงหน้า", build.pageRanges], ["เทมเพลต", build.templateName], ["จำนวนแถว", String(build.rowCount ?? "-")], ["สร้างเมื่อ", formatDate(build.createdAt)], ["ลบอัตโนมัติ", formatDate(build.purgeAfter)]];
  return <div className="flex flex-col gap-6">
    <SocSectionTabs active="build" waiting={await waitingTab()} />
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href="/soc/builds" className="text-xs text-muted no-underline hover:underline">← รายการ SOC ที่สร้าง</Link><h1 className="mt-1 font-display text-[28px] font-bold">{build.title}</h1><span className="mt-2 inline-block rounded-full bg-chip px-3 py-1 text-xs font-medium">{SOC_BUILD_STATUS_LABELS[build.status] || build.status}</span></div>
      <div className="flex items-center gap-3">{build.status === "READY" ? <a href={`/api/soc/builds/${build.id}/download`} className="rounded-input bg-accent px-5 py-3 font-display text-sm font-bold text-black no-underline hover:bg-[#f08d10]">ดาวน์โหลด SOC-{build.title}.docx</a> : null}<SocBuildDeleteButton buildId={build.id} title={build.title} goToList /></div>
    </div>
    {build.scanned ? <p className="rounded-input bg-peach p-3 text-xs leading-relaxed text-black">{SOC_BUILD_OCR_BETA_NOTE}</p> : null}
    {build.scanned ? <SocBuildReadPanel buildId={build.id} status={build.status} stage={build.stage} pagesDone={build.pagesDone} pagesTotal={build.pagesTotal} /> : null}
    {build.errorMessage ? <p role="alert" className="rounded-input border border-danger-border bg-surface px-4 py-3 text-sm text-danger">{build.errorMessage}</p> : null}
    <section className="rounded-card bg-surface p-6 shadow-card"><dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">{facts.map(([label, value]) => <div key={label} className="flex gap-3"><dt className="w-28 shrink-0 text-muted">{label}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl></section>
    <section className="rounded-card bg-surface p-6 shadow-card"><h2 className="font-display text-base font-semibold">ข้อที่ควรตรวจเอง ({warnings.length})</h2>{warnings.length ? <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm">{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : <p className="mt-2 text-sm text-muted">ไม่มี ทุกหน้าที่เลือกแยกเป็นข้อได้ครบ</p>}<p className="mt-4 text-xs text-muted">เปิดไฟล์ Word ตรวจเทียบ TOR จริงก่อนส่งลูกค้า ระบบเติมเฉพาะคอลัมน์เลขข้อและข้อกำหนด TOR</p></section>
  </div>;
}
