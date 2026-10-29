import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/authorization";
import { getProposalPage, STEP_STATUS_LABELS, type StepStatus } from "@/lib/proposal";
import { mySocRunner } from "@/lib/soc-runner";
import ProposalHeaderActions from "@/components/ProposalHeaderActions";

export const dynamic = "force-dynamic";

const BADGE: Record<StepStatus, string> = {
  done: "bg-accent text-black",
  doing: "bg-peach text-black",
  todo: "bg-chip text-label",
  stale: "bg-danger/15 text-danger",
  reserved: "bg-chip text-muted",
};

const formatDate = (value: Date) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(value);

// A Proposal's page: file chips, then the six Proposal Steps as a vertical
// stepper (spec "Proposal page layout"). Step statuses come from lib/proposal.
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageAccess("soc");
  let proposal;
  try { proposal = await getProposalPage(id); } catch { notFound(); }
  const link = await mySocRunner(proposal.viewerId);
  const hasRunner = Boolean(link && !link.revokedAt);
  return <div className="flex flex-col gap-6">
    <div>
      <Link href="/soc" className="text-xs text-muted no-underline hover:underline">← Proposal ทั้งหมด</Link>
      <ProposalHeaderActions id={proposal.id} title={proposal.title} canManage={proposal.canManage} />
      <p className="mt-1 text-sm text-muted">ผู้สร้าง: {proposal.creatorName} · อัปเดตล่าสุด {formatDate(proposal.updatedAt)}</p>
    </div>
    <div className="flex flex-wrap gap-2 text-xs" aria-label="ไฟล์ของ Proposal">
      <span className="rounded-full bg-chip px-3 py-1.5 text-label">TOR: ยังไม่มี</span>
      <span className="rounded-full bg-chip px-3 py-1.5 text-label">SOC ปัจจุบัน: ยังไม่มี</span>
      <span className="rounded-full bg-chip px-3 py-1.5 text-label">Datasheet: ยังไม่มี</span>
    </div>
    <ol className="flex flex-col">{proposal.steps.map((step, index) => <li key={step.no} className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.status === "done" ? "bg-accent text-black" : "bg-chip text-label"}`} aria-hidden="true">{step.status === "done" ? "✓" : step.no}</span>
        {index < proposal.steps.length - 1 ? <span className="w-px flex-1 bg-line" aria-hidden="true" /> : null}
      </div>
      <section className={`mb-4 flex-1 rounded-card bg-surface p-5 shadow-card ${step.status === "reserved" ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">{step.title}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${BADGE[step.status]}`}>{STEP_STATUS_LABELS[step.status]}</span>
          {step.status === "reserved" ? null : <span className="rounded-full bg-chip px-3 py-1 text-xs text-label">{step.ai}{step.ai === "ไม่ใช้ AI" ? "" : hasRunner ? " · Runner ของคุณ" : " · ไม่มี Runner → รอคนรับ"}</span>}
        </div>
        <p className="mt-2 text-sm">{step.now}</p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2"><div><dt className="inline font-medium text-label">ใช้: </dt><dd className="inline">{step.needs}</dd></div><div><dt className="inline font-medium text-label">ได้: </dt><dd className="inline">{step.gives}</dd></div></dl>
      </section>
    </li>)}</ol>
  </div>;
}
