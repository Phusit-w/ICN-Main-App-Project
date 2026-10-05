"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/authorization";
import type { EmployeeSnapshot, SavedEmployeeEntry } from "@/lib/types";

// Prefill for "who am I" (History page's card, entry forms, a brand-new
// bill) used to come from one shared EmployeeProfile DB row that every
// visitor's browser wrote to on every field blur — with no login, that
// meant two people at the office at the same time could silently overwrite
// each other's name/position/etc, and every new visitor inherited whatever
// the last person left behind. Replaced with a cookie that remembers which
// SavedEmployee entry *this browser* last used — per-browser like the
// entry forms' own sessionStorage drafts, never written by anyone else's
// browser, so there's nothing left to collide over. The EmployeeProfile
// table/model still exists in prisma/schema.prisma (left alone to avoid a
// migration) but nothing reads or writes it anymore.
const LAST_EMPLOYEE_COOKIE = "lastEmployeeName";
const BLANK_PROFILE: EmployeeSnapshot = {
  name: "",
  position: "",
  department: "",
  office: "",
  employeeNo: "",
  projectCC: "",
};

async function rememberedEmployeeName(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(LAST_EMPLOYEE_COOKIE)?.value;
}

// Cookie writes are only allowed from a Server Action/Route Handler
// context, which every caller of this already is (saveEmployeeForReuse and
// rememberLastEmployee below).
async function rememberEmployeeName(name: string): Promise<void> {
  const store = await cookies();
  store.set(LAST_EMPLOYEE_COOKIE, name, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400, // ~400 days — Chrome's own cap on cookie lifetime
  });
}

// Employee details belong to the expense forms, so every action here needs
// expense access (lib/access.ts).
export async function getProfile(): Promise<EmployeeSnapshot> {
  await requireAccess("expense");
  const name = await rememberedEmployeeName();
  if (!name) return BLANK_PROFILE;
  // The cookie can point at a name that's since been deleted from
  // SavedEmployee (or renamed) — findUnique just returns null and this
  // falls back to blank rather than erroring, same as "never saved before".
  const row = await prisma.savedEmployee.findUnique({ where: { name } });
  if (!row) return BLANK_PROFILE;
  return {
    name: row.name,
    position: row.position,
    department: row.department,
    office: row.office,
    employeeNo: row.employeeNo,
    projectCC: row.projectCC,
  };
}

// Called when a saved name is picked from a datalist (ProfileCard,
// EntryEmployeeFields) without necessarily re-saving it — remembers it as
// this browser's default for next time, same as saveEmployeeForReuse below
// does implicitly.
export async function rememberLastEmployee(name: string): Promise<void> {
  await requireAccess("expense");
  await rememberEmployeeName(name);
}

// Several different people share this same login-less app, so each can
// save their own details once under their own name ("บันทึกไว้ใช้ซ้ำ" —
// EntryEmployeeFields) and pick themselves back out of the saved-name list
// next time, rather than retyping every time. name is the lookup key —
// saving again under the same name updates that entry in place instead of
// creating a duplicate.
export async function listSavedEmployees(): Promise<SavedEmployeeEntry[]> {
  await requireAccess("expense");
  const rows = await prisma.savedEmployee.findMany({ orderBy: { name: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    department: row.department,
    office: row.office,
    employeeNo: row.employeeNo,
    projectCC: row.projectCC,
  }));
}

// Returns the saved row (with its id) rather than void — callers keep a
// local optimistic copy of the saved-employees list and need the id to let
// a just-saved entry be deleted again without a page reload. Returns null
// when there's nothing to save (blank name), same no-op as before.
export async function saveEmployeeForReuse(
  employee: EmployeeSnapshot
): Promise<SavedEmployeeEntry | null> {
  await requireAccess("expense");
  const name = employee.name.trim();
  if (!name) return null; // no name typed yet — nothing to key the saved entry by
  const row = await prisma.savedEmployee.upsert({
    where: { name },
    update: {
      position: employee.position,
      department: employee.department,
      office: employee.office,
      employeeNo: employee.employeeNo,
      projectCC: employee.projectCC,
    },
    create: { ...employee, name },
  });
  // Saving yourself for reuse also makes you this browser's remembered
  // default (rememberEmployeeName, above) — no separate step needed to
  // become "who this computer prefills as" next time.
  await rememberEmployeeName(name);
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    department: row.department,
    office: row.office,
    employeeNo: row.employeeNo,
    projectCC: row.projectCC,
  };
}

export async function deleteSavedEmployee(id: string): Promise<void> {
  await requireAccess("expense");
  await prisma.savedEmployee.delete({ where: { id } });
}
