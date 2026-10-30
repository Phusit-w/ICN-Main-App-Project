import Link from "next/link";
import { requirePageAccess } from "@/lib/authorization";
import { listProposals, requireSocUser } from "@/lib/proposal";
import { mySocRunner } from "@/lib/soc-runner";
import { latestSocRunnerVersion } from "@/lib/soc-runner-install";
import SocRunnerPanel from "@/components/SocRunnerPanel";
import { waitingTab } from "@/lib/soc-waiting-tab";
import SocSectionTabs from "@/components/SocSectionTabs";
import ProposalCreateForm from "@/components/ProposalCreateForm";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(value);

export default async function ProposalListPage() {
  await requirePageAccess("soc");
  const actor = await requireSocUser();
  const [proposals, runner, latestVersion] = await Promise.all([listProposals(), mySocRunner(actor.id), latestSocRunnerVersion()]);
  return <div className="flex flex-col gap-6">
    <SocSectionTabs active="proposal" waiting={await waitingTab()} />
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-[28px] font-bold">Proposal & SOC</h1><p className="mt-1 text-sm text-muted">เตรียมข้อเสนอตั้งแต่ TOR ถึงตรวจหลักฐาน ทุกคนที่ใช้แอปนี้เห็นและช่วยกันทำ Proposal เดียวกันได้</p></div><ProposalCreateForm /></div>
    <SocRunnerPanel runner={runner} latestVersion={latestVersion} showConfigDownload={actor.role === "ADMIN"} />
    <div className="overflow-hidden rounded-card bg-surface shadow-card">{proposals.length ? <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead className="bg-chip text-left text-xs text-label"><tr><th className="px-5 py-3">Proposal</th><th className="px-5 py-3">ผู้สร้าง</th><th className="px-5 py-3">ความคืบหน้า</th><th className="px-5 py-3">SOC ปัจจุบัน</th><th className="px-5 py-3">รอคนรับ</th><th className="px-5 py-3">อัปเดตล่าสุด</th></tr></thead><tbody>{proposals.map((proposal) => <tr key={proposal.id} className="border-t border-line hover:bg-hover"><td className="px-5 py-4"><Link href={`/soc/proposals/${proposal.id}`} className="font-medium text-ink no-underline hover:underline">{proposal.title}</Link></td><td className="px-5 py-4">{proposal.creatorName}</td><td className="whitespace-nowrap px-5 py-4 tabular-nums">เสร็จ {proposal.progress.done}/{proposal.progress.total}</td><td className="px-5 py-4 tabular-nums">{proposal.currentVersion ? `ฉบับ ${proposal.currentVersion}` : "—"}</td><td className="px-5 py-4 tabular-nums">{proposal.waitingCount}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-muted">{formatDate(proposal.updatedAt)}</td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><div className="font-display text-lg font-semibold">ยังไม่มี Proposal</div><p className="mt-2 text-sm text-muted">กด “+ Proposal ใหม่” แล้วตั้งชื่อเพื่อเริ่มเตรียมข้อเสนอ</p></div>}</div>
  </div>;
}
