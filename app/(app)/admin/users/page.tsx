import { prisma } from "@/lib/prisma";
import AdminUsersManager from "@/components/AdminUsersManager";
export default async function AdminUsersPage() { const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, displayName: true, role: true, appAccess: true, isActive: true, mustChangePassword: true, createdAt: true } }); return <section><h2 className="mb-4 font-display text-xl font-bold">จัดการผู้ใช้</h2><AdminUsersManager users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))} /></section>; }
