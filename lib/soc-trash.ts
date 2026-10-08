// SOC jobs in the trash are deleted for good 30 days after they were trashed
// (`purgeAfter`, set by trashSocJob): by an admin's ลบถาวร, or automatically
// by the server (instrumentation.ts runs purgeExpiredSocJobs at start and
// every few hours). Expense records in the trash are never purged
// automatically: they are financial records (user decision 2026-10-08).
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { resolveStorageKey } from "@/lib/soc";

const PURGE_EVERY_MS = 6 * 3600 * 1000;
const FIRST_PURGE_DELAY_MS = 60 * 1000; // after start, so the server is up first

// Deletes a trashed job's rows (every SOC table cascades from SocJob) and its
// storage folder. The AuditLog entry stays: by the admin, or by the server
// (no actor) when the 30 days ran out.
export async function deleteTrashedSocJob(id: string, actorId: string | null): Promise<boolean> {
  const job = await prisma.socJob.findUnique({ where: { id }, include: { _count: { select: { documents: true, results: true } } } });
  if (!job || !job.deletedAt) return false;
  await prisma.socJob.delete({ where: { id } });
  await rm(resolveStorageKey(id), { recursive: true, force: true });
  const automatic = actorId === null;
  await writeAudit({
    actorId, action: "SOC_PURGED", entityType: "SOC_JOB", entityId: id,
    summary: `ลบงาน SOC ${job.title} ถาวร${automatic ? " (อัตโนมัติ ครบ 30 วันในถังขยะ)" : ""}`,
    metadata: { title: job.title, ownerId: job.ownerId, documents: job._count.documents, results: job._count.results, automatic, deletedAt: job.deletedAt, purgeAfter: job.purgeAfter },
  });
  return true;
}

// Every trashed job whose 30 days are over. Returns how many were deleted;
// one that fails is logged and left for the next round.
export async function purgeExpiredSocJobs(now = new Date(), log: (message: string) => void = console.error): Promise<number> {
  const due = await prisma.socJob.findMany({ where: { deletedAt: { not: null }, purgeAfter: { lte: now } }, select: { id: true } });
  let purged = 0;
  for (const { id } of due) {
    try {
      if (await deleteTrashedSocJob(id, null)) purged += 1;
    } catch (error) {
      log(`[soc-trash] ลบงาน SOC ${id} ถาวรไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return purged;
}

let started = false;

// Called once by instrumentation.ts on the Node.js server.
export function startSocTrashPurge(): void {
  if (started) return;
  started = true;
  const run = () => {
    purgeExpiredSocJobs().catch((error) => console.error("[soc-trash] ล้างถังขยะไม่สำเร็จ:", error));
  };
  setTimeout(run, FIRST_PURGE_DELAY_MS).unref();
  setInterval(run, PURGE_EVERY_MS).unref();
}
