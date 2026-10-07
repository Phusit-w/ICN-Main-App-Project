"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeSocJob, authorizeSocJobOwner, SOC_CHECK_STATUSES, SOC_HEADING_STATUSES } from "@/lib/soc";
import { writeAudit } from "@/lib/authorization";
import { isHeadingRow, isSocFinalDecision, SOC_FINAL_DECISION_LABELS, SOC_REVIEW_NOTE_MAX } from "@/lib/soc-review";

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
  // An imported job's Final Decision is set with decideSocRow.
  if (job.kind === "IMPORTED") throw new Error("งานนำเข้าผลตั้ง Final Decision ในหน้าตรวจทาน");
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

// The Final Decision for one row of an Imported SOC Check, with the reviewer's
// note. Any user with `soc` access may set or change it, including whoever ran
// the check; there is deliberately no way to decide several rows at once. It
// is stored apart from the System Recommendation and sets reviewedAt, which a
// re-check treats as "confirmed" (lib/soc-import.ts).
export async function decideSocRow(input: { jobId: string; resultId: string; decision: string; note: string }) {
  const { actor, job } = await authorizeSocJob(input.jobId);
  if (job.kind !== "IMPORTED") throw new Error("ตั้ง Final Decision ได้เฉพาะงานนำเข้าผล");
  if (job.status !== "NEEDS_REVIEW") throw new Error("งานนี้ไม่ได้อยู่ในขั้นตรวจทาน");
  if (!isSocFinalDecision(input.decision)) throw new Error(`Final Decision ต้องเป็น ${Object.values(SOC_FINAL_DECISION_LABELS).join(", ")}`);
  const note = input.note.trim();
  if (note.length > SOC_REVIEW_NOTE_MAX) throw new Error(`หมายเหตุต้องไม่เกิน ${SOC_REVIEW_NOTE_MAX.toLocaleString("en-US")} ตัวอักษร`);
  const row = await prisma.socCheckResult.findFirst({ where: { id: input.resultId, jobId: input.jobId } });
  if (!row) throw new Error("ไม่พบผลตรวจ");
  if (isHeadingRow(row.rowType)) throw new Error("แถวหัวข้อไม่ต้องตั้ง Final Decision");
  // A re-check may have replaced (deleted) the row meanwhile.
  const updated = await prisma.socCheckResult.updateMany({
    where: { id: row.id },
    data: { finalDecision: input.decision, finalNote: note || null, reviewedById: actor.id, reviewedAt: new Date() },
  });
  if (updated.count !== 1) throw new Error("ไม่พบผลตรวจ แถวนี้อาจถูกตรวจซ้ำ กรุณาโหลดหน้าใหม่");
  const detail = { resultId: row.id, rowNumber: row.rowNumber, item: row.item, decision: input.decision, note: note || null, previousDecision: row.finalDecision, recommendation: row.torDecision };
  await prisma.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: "ROW_DECIDED", detail } });
  await writeAudit({ actorId: actor.id, action: "SOC_ROW_DECIDED", entityType: "SOC_JOB", entityId: job.id, summary: `ตั้ง Final Decision ข้อ ${row.item} เป็น ${SOC_FINAL_DECISION_LABELS[input.decision]} ในงาน ${job.title}`, metadata: detail });
  revalidatePath(`/soc/${job.id}`);
}

export async function confirmSocJob(jobId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  if (job.status !== "NEEDS_REVIEW") throw new Error("งานนี้ไม่ได้อยู่ในขั้นตรวจทาน");
  // soc-worker builds the DOCX for confirmed check jobs only; an imported
  // job's SOC_Check download is a later ticket (10).
  if (job.kind === "IMPORTED") throw new Error("งานนำเข้ายังยืนยันทั้งงานไม่ได้");
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
  if (job.status !== "FAILED" || job.kind === "IMPORTED") throw new Error("ลองใหม่ได้เฉพาะงานที่เกิดข้อผิดพลาด");
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
  const { actor, job } = await authorizeSocJobOwner(jobId);
  const now = new Date();
  await prisma.socJob.update({ where: { id: jobId }, data: { deletedAt: now, deletedById: actor.id, purgeAfter: new Date(now.getTime() + 30 * 86400000) } });
  await writeAudit({ actorId: actor.id, action: "SOC_TRASHED", entityType: "SOC_JOB", entityId: jobId, summary: `ย้ายงาน SOC ${job.title} ไปถังขยะ` });
  revalidatePath("/soc"); revalidatePath(`/soc/${jobId}`);
}
