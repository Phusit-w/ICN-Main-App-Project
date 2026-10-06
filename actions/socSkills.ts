"use server";

import { revalidatePath } from "next/cache";
import { setCurrentSocSkillPackage } from "@/lib/soc-skill-package";

// ADMIN only (checked in lib/soc-skill-package.ts).
export async function setCurrentSocSkill(packageId: string) {
  const result = await setCurrentSocSkillPackage(packageId);
  revalidatePath("/admin/soc-skills");
  revalidatePath("/soc", "layout");
  return result;
}
