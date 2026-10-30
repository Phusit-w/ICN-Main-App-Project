import Link from "next/link";

// The parts of the SOC app: Proposals (ADR 0012, the way in), and the SOC
// jobs and SOC Builds made before them. All need SOC access. A user with a
// SOC Runner also sees รอคนรับ (ADR 0013) with how many requests wait there:
// `waiting` is that count (lib/soc-waiting-tab.ts), null for no tab.
const TABS = [
  { key: "proposal", href: "/soc", label: "Proposal" },
  { key: "check", href: "/soc/jobs", label: "งานตรวจเดิม" },
  { key: "build", href: "/soc/builds", label: "สร้าง SOC เดิม" },
] as const;

type TabKey = (typeof TABS)[number]["key"] | "waiting";

export default function SocSectionTabs({ active, waiting = null }: { active: TabKey; waiting?: number | null }) {
  const tabs: { key: TabKey; href: string; label: string }[] = [...TABS, ...(waiting === null ? [] : [{ key: "waiting" as const, href: "/soc/waiting", label: waiting ? `รอคนรับ (${waiting})` : "รอคนรับ" }])];
  return <nav aria-label="เมนู SOC" className="flex flex-wrap gap-2">{tabs.map((tab) => <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium no-underline ${tab.key === active ? "bg-ink text-ground" : "bg-chip text-label hover:bg-hover"}`}>{tab.label}</Link>)}</nav>;
}
