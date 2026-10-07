import {
  GridIcon,
  ListIcon,
  CalculatorIcon,
  BanknoteIcon,
  FileCheckIcon,
  SettingsIcon,
  ClipboardCheckIcon,
  ShieldUserIcon,
  SearchIcon,
  type IconProps,
} from "@/components/icons";
import type { AppPermission } from "@/lib/access";

// Single source of truth for the app-shell sidebar. Add a route (a future
// subsystem, a settings page) = add one entry here. `disabled` entries are
// hidden from the sidebar entirely (still routable directly by URL).
export interface NavItem {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  // Active when this returns true for the current pathname. Defaults to
  // exact match on `href`.
  match?: (pathname: string) => boolean;
  disabled?: boolean;
  adminOnly?: boolean;
  // Shown only to users with this app access (lib/access.ts).
  access?: AppPermission;
  // Reachable from the homepage app-launcher's tile grid (app/(app)/page.tsx),
  // not the sidebar rail — the sidebar only shows this item's icon while the
  // user is actually on one of its pages (i.e. while `match` is true), so
  // the rail stays short when browsing elsewhere.
  hiddenUnlessActive?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    // The Applications launcher — the portal front door ("ศูนย์รวมระบบงานภายใน").
    href: "/",
    label: "หน้าหลัก",
    icon: GridIcon,
    match: (p) => p === "/",
  },
  {
    href: "/records",
    label: "รายการทั้งหมด",
    icon: ListIcon,
    match: (p) => p.startsWith("/records"),
    access: "expense",
  },
  {
    href: "/travel",
    label: "คำนวณค่าเดินทาง",
    icon: CalculatorIcon,
    match: (p) => p.startsWith("/travel"),
    access: "expense",
    hiddenUnlessActive: true,
  },
  {
    // Short label to fit the 230px expanded rail — the mockup uses
    // "Expense Claim" here.
    href: "/bill/entry/fa017",
    label: "Expense Claim",
    icon: BanknoteIcon,
    match: (p) => p.startsWith("/bill/entry/fa017"),
    access: "expense",
    hiddenUnlessActive: true,
  },
  {
    href: "/bill/entry/fa018",
    label: "ใบรับรองแทนใบเสร็จ",
    icon: FileCheckIcon,
    match: (p) => p.startsWith("/bill/entry/fa018"),
    access: "expense",
    hiddenUnlessActive: true,
  },
  {
    href: "/project-card",
    label: "ค้นหาโครงการ",
    icon: SearchIcon,
    match: (p) => p.startsWith("/project-card"),
    access: "project-card",
    hiddenUnlessActive: true,
  },
  {
    href: "/soc",
    label: "ตรวจสอบ SOC",
    icon: ClipboardCheckIcon,
    match: (p) => p.startsWith("/soc"),
    access: "soc",
    // Paused 2026-09-07 (no affordable engine); back 2026-10-07 now that each
    // reviewer's SOC Runner runs the check on their own Claude (ADR 0008).
    hiddenUnlessActive: true,
  },
  {
    href: "/admin",
    label: "Admin Center",
    icon: ShieldUserIcon,
    match: (p) => p.startsWith("/admin"),
    adminOnly: true,
  },
  {
    href: "/settings",
    label: "ตั้งค่า",
    icon: SettingsIcon,
    match: (p) => p.startsWith("/settings"),
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.disabled) return false;
  return item.match ? item.match(pathname) : pathname === item.href;
}
