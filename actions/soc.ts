"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeSocJob, SOC_CHECK_STATUSES, SOC_HEADING_STATUSES } from "@/lib/soc";
import { writeAudit } from "@/lib/authorization";

function isCheckStatus(value: string): boolean {
  return (SOC_CHECK_STATUSES as readonly string[]).includes(value);
}

function isHeadingStatus(value: string): boolean {
  return (SOC_HEADING_STATUSES as readonly string[]).includes(value);
}

export async function updateSocResult(input: {
  jobId: string;
  resultId: string;
  referenceCheck: string;
  headingTitleCheck: string;
  detail: string;
}) {
  const { actor, job } = await authorizeSocJob(input.jobId);
  if (job.status !== "NEEDS_REVIEW") throw new Error("งานนี้ไม่ได้อยู่ในขั้นตรวจทาน");
  if (!isCheckStatus(input.referenceCheck) || !isHeadingStatus(input.headingTitleCheck)) throw new Error("สถานะผลตรวจไม่ถูกต้อง");
  const detail = input.detail.trim();
  if (!detail || detail.length > 2000) throw new Error("กรุณาระบุรายละเอียดไม่เกิน 2,000 ตัวอักษร");
  const updated = await prisma.socCheckResult.updateMany({
    where: { id: input.resultId, jobId: input.jobId },
    data: {
      finalReferenceCheck: input.referenceCheck,
      finalHeadingTitleCheck: input.headingTitleCheck,
      finalDetail: detail,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    },
  });
  if (updated.count !== 1) throw new Error("ไม่พบผลตรวจ");
  await prisma.socAuditEvent.create({ data: { jobId: input.jobId, actorId: actor.id, action: "RESULT_REVIEWED", detail: { resultId: input.resultId } } });
  await writeAudit({ actorId: actor.id, action: "SOC_RESULT_REVIEWED", entityType: "SOC_JOB", entityId: input.jobId, summary: `ตรวจทานผลในงาน ${job.title}`, metadata: { resultId: input.resultId } });
  revalidatePath(`/soc/${input.jobId}`);
}

export async function confirmSocJob(jobId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  if (job.status !== "NEEDS_REVIEW") throw new Error("งานนี้ไม่ได้อยู่ในขั้นตรวจทาน");
  const [total, unreviewed] = await Promise.all([
    prisma.socCheckResult.count({ where: { jobId } }),
    prisma.socCheckResult.count({ where: { jobId, reviewedAt: null } }),
  ]);
  await writeAudit({ actorId: actor.id, action: "SOC_CONFIRMED", entityType: "SOC_JOB", entityId: jobId, summary: `ยืนยันงาน SOC ${job.title}` });
  if (!total) throw new Error("งานนี้ยังไม่มีผลตรวจ");
  if (unreviewed) throw new Error(`ยังมี ${unreviewed} รายการที่ยังไม่ได้ยืนยัน`);
  await prisma.$transaction([
    prisma.socJob.update({ where: { id: jobId }, data: { status: "CONFIRMED", stage: "รอสร้างเอกสาร", progress: 90, confirmedAt: new Date(), errorMessage: null } }),
    prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "JOB_CONFIRMED" } }),
  ]);
  revalidatePath(`/soc/${jobId}`);
  revalidatePath("/soc");
}

export async function retrySocJob(jobId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  if (job.status !== "FAILED") throw new Error("ลองใหม่ได้เฉพาะงานที่เกิดข้อผิดพลาด");
  const hasResults = await prisma.socCheckResult.count({ where: { jobId } });
  const status = hasResults ? "CONFIRMED" : "QUEUED";
  await prisma.$transaction([
    prisma.socJob.update({ where: { id: jobId }, data: { status, stage: "รอลองใหม่", progress: hasResults ? 90 : 5, errorMessage: null } }),
    prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "JOB_RETRIED" } }),
  ]);
  revalidatePath(`/soc/${jobId}`);
  revalidatePath("/soc");
}

export async function trashSocJob(jobId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  const now = new Date();
  await prisma.socJob.update({ where: { id: jobId }, data: { deletedAt: now, deletedById: actor.id, purgeAfter: new Date(now.getTime() + 30 * 86400000) } });
  await writeAudit({ actorId: actor.id, action: "SOC_TRASHED", entityType: "SOC_JOB", entityId: jobId, summary: `ย้ายงาน SOC ${job.title} ไปถังขยะ` });
  revalidatePath("/soc"); revalidatePath(`/soc/${jobId}`);
}
