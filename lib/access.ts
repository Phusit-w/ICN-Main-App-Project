// Per-app access (docs/adr/0007-per-app-access.md): which apps a USER may
// open, kept in User.appAccess. ADMIN may open everything regardless.
// Plain data and pure functions only — imported by client components
// (sidebar, Admin user list) as well as by the server-side checks in
// lib/authorization.ts.
//
// APPS is the one list of apps: the Admin access dialog, the access chips,
// the Activity log text and every check read it. A new app = one entry here,
// then requirePageAccess / requireAccess on its pages and actions and
// `access` on its lib/nav.ts item and launcher tile. No migration needed:
// User.appAccess is a plain list of the `access` strings below.
//
// Each app's levels go from lowest to highest; a higher level includes the
// ones below it, so a user holds at most one level per app.
export const APPS = [
  {
    key: "expense",
    name: "เบิกค่าใช้จ่าย",
    description: "ฟอร์ม FA-017/018, รายการทั้งหมด และคำนวณค่าเดินทาง",
    levels: [{ access: "expense", label: "ใช้งาน" }],
  },
  {
    key: "project-card",
    name: "ค้นหาโครงการ",
    description: "ค้นหาโครงการจากคลังไฟล์ PS พร้อมงบ หมวดหมู่ และรายละเอียด",
    levels: [
      { access: "project-card", label: "ดู" },
      { access: "project-card-edit", label: "ดูและแก้ไข" },
    ],
  },
  {
    key: "soc",
    name: "ตรวจสอบ SOC",
    description: "ตรวจสอบเอกสารอ้างอิงและ Statement of Compliance",
    levels: [{ access: "soc", label: "ใช้งาน" }],
  },
] as const;

export type App = (typeof APPS)[number];
// A value stored in User.appAccess, and what a page or action asks for.
export type AppPermission = App["levels"][number]["access"];

// What a new account gets unless the admin changes it — the highest level
// of every app, same as prisma/schema.prisma's User.appAccess default.
export const DEFAULT_APP_ACCESS: AppPermission[] = APPS.map((app) => app.levels[app.levels.length - 1].access);

export type AccessHolder = { role: string; appAccess: readonly string[] };

function findLevel(access: string): { app: App; index: number } | null {
  for (const app of APPS) {
    const index = app.levels.findIndex((l) => l.access === access);
    if (index >= 0) return { app, index };
  }
  return null;
}

// The level index a user holds in `app`, or -1 for none.
export function heldLevel(appAccess: readonly string[], app: App): number {
  let held = -1;
  app.levels.forEach((l, i) => {
    if (appAccess.includes(l.access)) held = i;
  });
  return held;
}

export function hasAccess(user: AccessHolder, permission: AppPermission): boolean {
  if (user.role === "ADMIN") return true;
  const wanted = findLevel(permission);
  if (!wanted) return false;
  return heldLevel(user.appAccess, wanted.app) >= wanted.index;
}

// Known values only, at most one (the highest) level per app, in APPS order.
export function cleanAppAccess(raw: readonly string[]): AppPermission[] {
  return APPS.flatMap((app) => {
    const held = heldLevel(raw, app);
    return held >= 0 ? [app.levels[held].access] : [];
  });
}

// One short label per app held, e.g. ["เบิกค่าใช้จ่าย", "ค้นหาโครงการ · ดู"].
// The level is named only for apps that have more than one.
export function appAccessLabels(appAccess: readonly string[]): string[] {
  return APPS.flatMap((app) => {
    const held = heldLevel(appAccess, app);
    if (held < 0) return [];
    return [app.levels.length > 1 ? `${app.name} · ${app.levels[held].label}` : app.name];
  });
}

// For the Activity log, e.g. "เบิกค่าใช้จ่าย, ค้นหาโครงการ · ดู".
export function describeAppAccess(appAccess: readonly string[]): string {
  const labels = appAccessLabels(appAccess);
  return labels.length ? labels.join(", ") : "ไม่มีสิทธิ์เข้า app ใด";
}
