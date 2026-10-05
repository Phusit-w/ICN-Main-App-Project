// Per-app access (docs/adr/0007-per-app-access.md): which apps a USER may
// open, kept in User.appAccess. ADMIN may open everything regardless.
// Plain data and pure functions only — imported by client components
// (sidebar, Admin user list) as well as by the server-side checks in
// lib/authorization.ts.

// Values stored in User.appAccess. Project Card has two levels: a user with
// "project-card-edit" may also view, so only one of the two is ever stored.
export const APP_ACCESS = ["expense", "soc", "project-card", "project-card-edit"] as const;
export type AppAccess = (typeof APP_ACCESS)[number];

// What a page or action asks for. "project-card" means view.
export type AppPermission = "expense" | "soc" | "project-card" | "project-card-edit";

export type AccessHolder = { role: string; appAccess: readonly string[] };

export function hasAccess(user: AccessHolder, permission: AppPermission): boolean {
  if (user.role === "ADMIN") return true;
  if (permission === "project-card") {
    return user.appAccess.includes("project-card") || user.appAccess.includes("project-card-edit");
  }
  return user.appAccess.includes(permission);
}

export type ProjectCardLevel = "none" | "view" | "edit";

export function projectCardLevel(appAccess: readonly string[]): ProjectCardLevel {
  if (appAccess.includes("project-card-edit")) return "edit";
  if (appAccess.includes("project-card")) return "view";
  return "none";
}

// The Admin user list's controls, turned back into the stored list.
export function toAppAccess(input: { expense: boolean; soc: boolean; projectCard: ProjectCardLevel }): AppAccess[] {
  const access: AppAccess[] = [];
  if (input.expense) access.push("expense");
  if (input.soc) access.push("soc");
  if (input.projectCard === "view") access.push("project-card");
  if (input.projectCard === "edit") access.push("project-card-edit");
  return access;
}

// Thai summary for the Activity log, e.g. "เบิกค่าใช้จ่าย, ค้นหาโครงการ (ดูอย่างเดียว)".
export function describeAppAccess(appAccess: readonly string[]): string {
  const parts: string[] = [];
  if (appAccess.includes("expense")) parts.push("เบิกค่าใช้จ่าย");
  if (appAccess.includes("soc")) parts.push("SOC");
  const level = projectCardLevel(appAccess);
  if (level === "view") parts.push("ค้นหาโครงการ (ดูอย่างเดียว)");
  if (level === "edit") parts.push("ค้นหาโครงการ (ดูและแก้ไข)");
  return parts.length ? parts.join(", ") : "ไม่มีสิทธิ์เข้า app ใด";
}
