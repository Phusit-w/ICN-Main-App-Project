"use server";

import { revalidatePath } from "next/cache";
import { authorizeSocJob } from "@/lib/soc";
import { cancelCheckRequest, requestAllUncheckedChecks, requestMajorItemCheck } from "@/lib/soc-check-requests";

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
  const result = await requestAllUncheckedChecks(actor, job);
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
