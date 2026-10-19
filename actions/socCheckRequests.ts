"use server";

import { revalidatePath } from "next/cache";
import { authorizeSocJob } from "@/lib/soc";
import { cancelCheckRequest, requestAllUncheckedChecks, requestMajorItemCheck, requestRowRechecks, resumeCheckRequestNow, setMajorItemSkipped } from "@/lib/soc-check-requests";
import { requestTorJudge } from "@/lib/soc-tor-judge";

// Check Requests (ticket 13). Any user who may open the job may ask for a
// check; it runs only on their own SOC Runner.

export async function requestSocCheck(jobId: string, majorItemId: string, replaceConfirmed: number[] = []) {
  const { actor, job } = await authorizeSocJob(jobId);
  const result = await requestMajorItemCheck(actor, job, majorItemId, replaceConfirmed.filter(Number.isInteger));
  revalidatePath(`/soc/${jobId}`);
  return result;
}

// [ตรวจต่อโดยไม่มีไฟล์นี้]: the same request again, acknowledging the
// documents its runner reported missing.
export async function continueSocCheckWithoutMissing(jobId: string, majorItemId: string, replaceConfirmed: number[] = []) {
  const { actor, job } = await authorizeSocJob(jobId);
  const result = await requestMajorItemCheck(actor, job, majorItemId, replaceConfirmed.filter(Number.isInteger), { continueWithoutMissing: true });
  revalidatePath(`/soc/${jobId}`);
  return result;
}

export async function requestAllSocChecks(jobId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  // A scanned PDF SOC still being read has only its first items; ตรวจทั้งชุด waits for the whole table.
  if (job.status === "READING" || job.status === "READ_FAILED") return { ok: false as const, error: "ตรวจทั้งชุดได้เมื่ออ่านตารางครบทั้งไฟล์ ตอนนี้ตรวจรายข้อที่อ่านแล้วได้" };
  const result = await requestAllUncheckedChecks(actor, job);
  revalidatePath(`/soc/${jobId}`);
  return result;
}

// ส่งให้ Claude ตรวจใหม่: the rows picked on the review page.
export async function requestSocRowRechecks(jobId: string, resultIds: string[]) {
  const { actor, job } = await authorizeSocJob(jobId);
  const result = await requestRowRechecks(actor, job, Array.isArray(resultIds) ? resultIds.filter((id) => typeof id === "string").slice(0, 5000) : []);
  revalidatePath(`/soc/${jobId}`);
  return result;
}

// ส่งให้ Claude ตัดสิน in TOR Match: the lines code could not settle, as one
// request on the clicking user's SOC Runner.
export async function requestSocTorJudge(jobId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  const result = await requestTorJudge(actor, job);
  revalidatePath(`/soc/${jobId}`);
  return result;
}

// The requester or ADMIN, before the runner claims it.
export async function cancelSocCheckRequest(jobId: string, requestId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  const result = await cancelCheckRequest(actor, job, requestId);
  revalidatePath(`/soc/${jobId}`);
  return result;
}

// ตรวจต่อเลย: the requester or ADMIN, while the request waits for the Claude quota.
export async function resumeSocCheckRequestNow(jobId: string, requestId: string) {
  const { actor, job } = await authorizeSocJob(jobId);
  const result = await resumeCheckRequestNow(actor, job, requestId);
  revalidatePath(`/soc/${jobId}`);
  return result;
}

// ไม่ต้องตรวจ / ตรวจข้อนี้: anyone who may request a check may set an item aside.
export async function setSocMajorItemSkipped(jobId: string, majorItemId: string, skipped: boolean) {
  const { actor, job } = await authorizeSocJob(jobId);
  const result = await setMajorItemSkipped(actor, job, majorItemId, skipped === true);
  revalidatePath(`/soc/${jobId}`);
  revalidatePath("/soc");
  return result;
}
