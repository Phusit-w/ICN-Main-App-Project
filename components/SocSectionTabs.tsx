import Link from "next/link";

// The parts of the SOC app: Proposals (ADR 0012, the way in), and the SOC
// jobs and SOC Builds made before them. All need SOC access.
const TABS = [
  { key: "proposal", href: "/soc", label: "Proposal" },
  { key: "check", href: "/soc/jobs", label: "งานตรวจเดิม" },
  { key: "build", href: "/soc/builds", label: "สร้าง SOC เดิม" },
] as const;

export default function SocSectionTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return <nav aria-label="เมนู SOC" className="flex gap-2">{TABS.map((tab) => <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium no-underline ${tab.key === active ? "bg-ink text-ground" : "bg-chip text-label hover:bg-hover"}`}>{tab.label}</Link>)}</nav>;
}
