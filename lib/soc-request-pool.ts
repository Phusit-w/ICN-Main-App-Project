// The รอคนรับ pool (ADR 0013): Check Requests sent away that nobody has taken.
// Kept apart from lib/soc-check-requests.ts so that a page menu can show the
// count without loading the whole import and runner machinery.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export const UNTAKEN: Prisma.SocCheckRequestWhereInput = { waiting: true, takerId: null, state: "requested", job: { deletedAt: null } };

export async function waitingCheckRequestCount(): Promise<number> {
  return prisma.socCheckRequest.count({ where: UNTAKEN });
}
