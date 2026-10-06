"use server";

import { revalidatePath } from "next/cache";
import { revokeSocRunnerLink } from "@/lib/soc-runner";

// ADMIN only (checked in lib/soc-runner.ts).
export async function revokeSocRunner(linkId: string) {
  const result = await revokeSocRunnerLink(linkId);
  revalidatePath("/admin/soc-runners");
  revalidatePath("/soc");
  return result;
}
