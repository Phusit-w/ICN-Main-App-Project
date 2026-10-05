"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, writeAudit } from "@/lib/authorization";
import { APP_ACCESS, describeAppAccess, type AppAccess } from "@/lib/access";

function temporaryPassword() {
  return `Icn-${randomBytes(9).toString("base64url")}7`;
}

// Keeps only known values, each once, and never both Project Card levels.
function cleanAppAccess(raw: readonly string[]): AppAccess[] {
  const access = APP_ACCESS.filter((a) => raw.includes(a));
  return access.includes("project-card-edit") ? access.filter((a) => a !== "project-card") : access;
}

export async function createUser(input: { username: string; displayName: string; role: "USER" | "ADMIN"; appAccess: string[] }) {
  const actor = await requireRole("ADMIN");
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { ok: false as const, error: "Username ต้องเป็น a-z, 0-9, จุด ขีดกลาง หรือขีดล่าง 3–40 ตัว" };
  if (displayName.length < 2) return { ok: false as const, error: "กรุณาระบุชื่อที่แสดง" };
  if (await prisma.user.findUnique({ where: { username } })) return { ok: false as const, error: "Username นี้มีอยู่แล้ว" };
  const password = temporaryPassword();
  const appAccess = cleanAppAccess(input.appAccess);
  const user = await prisma.user.create({ data: { username, displayName, role: input.role, appAccess, passwordHash: hashPassword(password), mustChangePassword: true } });
  await writeAudit({ actorId: actor.id, targetUserId: user.id, action: "USER_CREATED", entityType: "USER", entityId: user.id, summary: `สร้างผู้ใช้ ${username} (${user.role === "ADMIN" ? "Admin ใช้ได้ทุกระบบ" : describeAppAccess(appAccess)})`, after: { role: user.role, isActive: true, appAccess } });
  revalidatePath("/admin"); revalidatePath("/admin/users");
  return { ok: true as const, temporaryPassword: password };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const actor = await requireRole("ADMIN");
  if (!isActive && userId === actor.id) return { ok: false as const, error: "ไม่สามารถปิดบัญชีของตนเอง" };
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isActive && target.role === "ADMIN" && await prisma.user.count({ where: { role: "ADMIN", isActive: true } }) <= 1) return { ok: false as const, error: "ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน" };
  const user = await prisma.user.update({ where: { id: userId }, data: { isActive, disabledAt: isActive ? null : new Date(), sessionVersion: { increment: 1 } } });
  await writeAudit({ actorId: actor.id, targetUserId: user.id, action: isActive ? "USER_ENABLED" : "USER_DISABLED", entityType: "USER", entityId: user.id, summary: `${isActive ? "เปิด" : "ปิด"}บัญชี ${user.username}`, before: { isActive: target.isActive }, after: { isActive } });
  revalidatePath("/admin/users"); return { ok: true as const };
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN") {
  const actor = await requireRole("ADMIN");
  if (userId === actor.id && role !== "ADMIN") return { ok: false as const, error: "ไม่สามารถลดสิทธิ์ของตนเอง" };
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === "ADMIN" && role === "USER" && target.isActive && await prisma.user.count({ where: { role: "ADMIN", isActive: true } }) <= 1) return { ok: false as const, error: "ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน" };
  const user = await prisma.user.update({ where: { id: userId }, data: { role, sessionVersion: { increment: 1 } } });
  await writeAudit({ actorId: actor.id, targetUserId: user.id, action: "USER_ROLE_CHANGED", entityType: "USER", entityId: user.id, summary: `เปลี่ยนสิทธิ์ ${user.username} เป็น ${role}`, before: { role: target.role }, after: { role } });
  revalidatePath("/admin/users"); return { ok: true as const };
}

// Which apps a USER may open (lib/access.ts). No session bump needed: every
// request re-reads the user from the DB, so the change applies on the
// user's next page load or action.
export async function setUserAppAccess(userId: string, rawAccess: string[]) {
  const actor = await requireRole("ADMIN");
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const appAccess = cleanAppAccess(rawAccess);
  const user = await prisma.user.update({ where: { id: userId }, data: { appAccess } });
  await writeAudit({ actorId: actor.id, targetUserId: user.id, action: "USER_APP_ACCESS_CHANGED", entityType: "USER", entityId: user.id, summary: `เปลี่ยนสิทธิ์เข้าใช้งาน ${user.username}: ${describeAppAccess(target.appAccess)} → ${describeAppAccess(appAccess)}`, before: { appAccess: target.appAccess }, after: { appAccess } });
  revalidatePath("/admin/users"); return { ok: true as const };
}

export async function changeUsername(userId: string, requestedUsername: string) {
  const actor = await requireRole("ADMIN");
  const username = requestedUsername.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return { ok: false as const, error: "Username ต้องเป็น a-z, 0-9, จุด ขีดกลาง หรือขีดล่าง 3–40 ตัว" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false as const, error: "ไม่พบบัญชีผู้ใช้" };
  if (target.username === username) return { ok: false as const, error: "Username ใหม่เหมือน Username ปัจจุบัน" };
  if (await prisma.user.findFirst({ where: { username, id: { not: userId } } })) {
    return { ok: false as const, error: "Username นี้มีอยู่แล้ว" };
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { username, sessionVersion: { increment: 1 } },
    });
    await writeAudit({
      actorId: actor.id,
      targetUserId: user.id,
      action: "USER_USERNAME_CHANGED",
      entityType: "USER",
      entityId: user.id,
      summary: `เปลี่ยน Username จาก ${target.username} เป็น ${username}`,
      before: { username: target.username },
      after: { username },
    });
    revalidatePath("/admin");
    revalidatePath("/admin/users");
    return {
      ok: true as const,
      message: `เปลี่ยน Username จาก ${target.username} เป็น ${username} แล้ว`,
      selfChanged: actor.id === user.id,
    };
  } catch {
    return { ok: false as const, error: "เปลี่ยน Username ไม่สำเร็จ อาจมีบัญชีอื่นใช้ชื่อนี้แล้ว" };
  }
}

const PASSWORD_MIN_LENGTH = 6;

function passwordMeetsPolicy(value: string) {
  return value.length >= PASSWORD_MIN_LENGTH;
}

// Admin sets the account's new password directly. Bumping sessionVersion
// invalidates every existing session for that user (proxy.ts / getCurrentUser
// check it), so anyone still logged in with the old password is forced to
// sign in again with the new one.
export async function resetUserPassword(userId: string, newPassword: string) {
  const actor = await requireRole("ADMIN");
  const password = (newPassword ?? "").trim();
  if (!password) return { ok: false as const, error: "กรุณากรอกรหัสผ่านใหม่" };
  if (!passwordMeetsPolicy(password)) return { ok: false as const, error: `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัว` };
  const user = await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password), mustChangePassword: false, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } } });
  await writeAudit({ actorId: actor.id, targetUserId: user.id, action: "USER_PASSWORD_RESET", entityType: "USER", entityId: user.id, summary: `รีเซ็ตรหัสผ่าน ${user.username}` });
  revalidatePath("/admin/users");
  return { ok: true as const, username: user.username };
}

export async function restoreExpense(id: string) {
  const actor = await requireRole("ADMIN");
  const row = await prisma.expenseRecord.update({ where: { id }, data: { deletedAt: null, deletedById: null, purgeAfter: null, restoredAt: new Date() } });
  await writeAudit({ actorId: actor.id, action: "EXPENSE_RESTORED", entityType: "EXPENSE", entityId: id, summary: `กู้คืนเอกสาร ${row.type}` });
  revalidatePath("/admin/trash"); revalidatePath("/records");
}

export async function restoreSocJob(id: string) {
  const actor = await requireRole("ADMIN");
  const row = await prisma.socJob.update({ where: { id }, data: { deletedAt: null, deletedById: null, purgeAfter: null, restoredAt: new Date() } });
  await writeAudit({ actorId: actor.id, action: "SOC_RESTORED", entityType: "SOC_JOB", entityId: id, summary: `กู้คืนงาน SOC ${row.title}` });
  revalidatePath("/admin/trash"); revalidatePath("/soc");
}
