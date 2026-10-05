import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { hasAccess, type AppPermission } from "@/lib/access";

export async function requireActor() {
  const actor = await getCurrentUser();
  if (!actor) throw new Error("UNAUTHORIZED");
  return actor;
}

// For server actions and API routes: the signed-in user, if they may use
// this app (lib/access.ts). Read from the DB on every call, so an admin's
// change takes effect on the user's next request.
export async function requireAccess(permission: AppPermission) {
  const actor = await requireActor();
  if (!hasAccess(actor, permission)) throw new Error("FORBIDDEN");
  return actor;
}

// For pages: same check, but sends a user without access back to the app
// launcher instead of throwing. Signed-out users are already redirected to
// /login by app/(app)/layout.tsx.
export async function requirePageAccess(permission: AppPermission) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (!hasAccess(actor, permission)) redirect("/");
  return actor;
}

export async function requireRole(role: "ADMIN") {
  const actor = await requireActor();
  if (actor.role !== role) throw new Error("FORBIDDEN");
  return actor;
}

// No per-owner restriction: any logged-in account may view/edit/delete any
// record, matching this app's "no permission levels" design (see
// listRecords in actions/records.ts).
export async function authorizeExpenseRecord(recordId: string) {
  const actor = await requireAccess("expense");
  const record = await prisma.expenseRecord.findUnique({ where: { id: recordId } });
  if (!record || record.deletedAt) throw new Error("NOT_FOUND");
  return { actor, record };
}

export async function writeAudit(input: {
  actorId?: string | null;
  targetUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: object | null;
  after?: object | null;
  metadata?: object | null;
}) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId || null,
      targetUserId: input.targetUserId || null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      summary: input.summary.slice(0, 500),
      before: input.before || undefined,
      after: input.after || undefined,
      metadata: input.metadata || undefined,
    },
  });
}
