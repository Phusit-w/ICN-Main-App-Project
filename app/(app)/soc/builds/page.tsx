import Link from "next/link";
import { requirePageAccess } from "@/lib/authorization";
import { requireSocActor, SOC_BUILD_STATUS_LABELS } from "@/lib/soc";
import { listSocBuilds } from "@/lib/soc-builds";
import SocBuildDeleteButton from "@/components/SocBuildDeleteButton";
import SocSectionTabs from "@/components/SocSectionTabs";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(value);

export default async function SocBuildsPage() {
  await requirePageAccess("soc");
  const builds = await listSocBuilds(await requireSocActor());
  return <div className="flex flex-col gap-6">
    <SocSectionTabs active="build" />
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-[28px] font-bold">สร้าง SOC</h1><p className="mt-1 text-sm text-muted">สร้างตาราง SOC จาก TOR ตามเทมเพลตของลูกค้า ได้ไฟล์ Word ที่เติมเลขข้อและข้อกำหนด TOR ให้แล้ว</p></div><Link href="/soc/builds/new" className="rounded-input bg-accent px-5 py-3 font-display text-sm font-bold text-black no-underline hover:bg-[#f08d10]">+ สร้าง SOC ใหม่</Link></div>
    <div className="overflow-hidden rounded-card bg-surface shadow-card">{builds.length ? <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead className="bg-chip text-left text-xs text-label"><tr><th className="px-5 py-3">ชื่อ</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">จำนวนแถว</th><th className="px-5 py-3">ข้อควรตรวจ</th><th className="px-5 py-3">สร้างเมื่อ</th><th className="px-5 py-3" aria-label="การทำงาน" /></tr></thead><tbody>{builds.map((build) => <tr key={build.id} className="border-t border-line hover:bg-hover"><td className="px-5 py-4"><Link href={`/soc/builds/${build.id}`} className="font-medium text-ink no-underline hover:underline">{build.title}</Link><div className="mt-1 text-xs text-muted">หน้า {build.pageRanges}</div></td><td className="px-5 py-4"><span className="rounded-full bg-chip px-3 py-1 text-xs font-medium">{SOC_BUILD_STATUS_LABELS[build.status] || build.status}</span></td><td className="px-5 py-4 tabular-nums">{build.rowCount ?? "-"}</td><td className="px-5 py-4 tabular-nums">{build.warnings.length || "-"}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-muted">{formatDate(build.createdAt)}</td><td className="whitespace-nowrap px-5 py-4 text-right">{build.status === "READY" ? <a href={`/api/soc/builds/${build.id}/download`} className="mr-2 inline-flex h-9 items-center rounded-input bg-chip px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-hover">ดาวน์โหลด</a> : null}<SocBuildDeleteButton buildId={build.id} title={build.title} /></td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><div className="font-display text-lg font-semibold">ยังไม่มี SOC ที่สร้าง</div><p className="mt-2 text-sm text-muted">เริ่มด้วย TOR (PDF) หนึ่งไฟล์ ช่วงหน้าที่ต้องการ และเทมเพลต SOC ของลูกค้า</p></div>}</div>
    <p className="text-xs text-muted">ไฟล์ที่สร้างจะถูกลบอัตโนมัติหลัง 30 วัน · สร้างโดยโค้ด ไม่ใช้ AI และไม่ส่งข้อมูลออกนอกระบบ</p>
  </div>;
}
