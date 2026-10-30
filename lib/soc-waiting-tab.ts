import { getCurrentUser } from "@/lib/session";
import { waitingCheckRequestCount } from "@/lib/soc-request-pool";
import { hasActiveRunnerLink } from "@/lib/soc-runner";

// What the SOC menu's รอคนรับ tab shows (ADR 0013): how many requests wait
// there, or null for no tab. Only a user with a SOC Runner sees it: they are
// the ones who can take.
export async function waitingTab(): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user || !(await hasActiveRunnerLink(user.id))) return null;
  return waitingCheckRequestCount();
}
