import { requirePageAccess } from "@/lib/authorization";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSocActor, SOC_STATUS_LABELS } from "@/lib/soc";

export const dynamic = "force-dynamic";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function SocJobsPage() {
  await requirePageAccess("soc");
  const actor = await requireSocActor();
  const jobs = await prisma.socJob.findMany({ where: { deletedAt: null, ...(actor.role === "ADMIN" ? {} : { ownerId: actor.id }) }, include: { owner: { select: { displayName: true } }, _count: { select: { results: true } } }, orderBy: { updatedAt: "desc" } });
  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-[28px] font-bold">ตรวจสอบ SOC</h1><p className="mt-1 text-sm text-muted">ตรวจ Word เทียบ Datasheet และยืนยันผลก่อนสร้างเอกสาร</p></div><Link href="/soc/new" className="rounded-input bg-accent px-5 py-3 font-display text-sm font-bold text-black no-underline hover:bg-[#f08d10]">+ สร้างงานตรวจ</Link></div>
    <div className="overflow-hidden rounded-card bg-surface shadow-card">{jobs.length ? <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead className="bg-chip text-left text-xs text-label"><tr><th className="px-5 py-3">โครงการ</th>{actor.role === "ADMIN" ? <th className="px-5 py-3">เจ้าของ</th> : null}<th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">ความคืบหน้า</th><th className="px-5 py-3">จำนวนข้อ</th><th className="px-5 py-3">อัปเดตล่าสุด</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="border-t border-line hover:bg-hover"><td className="px-5 py-4"><Link href={`/soc/${job.id}`} className="font-medium text-ink no-underline hover:underline">{job.title}</Link><div className="mt-1 text-xs text-muted">{job.stage}</div></td>{actor.role === "ADMIN" ? <td className="px-5 py-4">{job.owner.displayName}</td> : null}<td className="px-5 py-4"><span className="rounded-full bg-chip px-3 py-1 text-xs font-medium">{SOC_STATUS_LABELS[job.status] || job.status}</span></td><td className="px-5 py-4"><div className="h-2 w-28 overflow-hidden rounded-full bg-chip"><div className="h-full bg-accent" style={{ width: `${job.progress}%` }} /></div></td><td className="px-5 py-4 tabular-nums">{job._count.results}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-muted">{formatDate(job.updatedAt)}</td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><div className="font-display text-lg font-semibold">ยังไม่มีงานตรวจ SOC</div><p className="mt-2 text-sm text-muted">เริ่มต้นด้วย DOCX หนึ่งไฟล์และ PDF หลักฐานอย่างน้อยหนึ่งไฟล์</p></div>}</div>
    <p className="text-xs text-muted">ไฟล์จะถูกลบอัตโนมัติหลัง 90 วัน · AI ภายนอกถูกปิดเป็นค่าเริ่มต้น</p>
  </div>;
}
