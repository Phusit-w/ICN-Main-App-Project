import Link from "next/link";

// The two parts of the SOC app: checking a SOC against datasheets, and
// building a SOC from a TOR (สร้าง SOC, ADR 0011). Both need SOC access.
const TABS = [
  { key: "check", href: "/soc", label: "ตรวจสอบ SOC" },
  { key: "build", href: "/soc/builds", label: "สร้าง SOC" },
] as const;

export default function SocSectionTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return <nav aria-label="เมนู SOC" className="flex gap-2">{TABS.map((tab) => <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium no-underline ${tab.key === active ? "bg-ink text-ground" : "bg-chip text-label hover:bg-hover"}`}>{tab.label}</Link>)}</nav>;
}
