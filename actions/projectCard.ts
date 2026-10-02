"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/authorization";
import { validateClassification, validateWorkTypes } from "@/lib/project-card";

// Confirms (and optionally corrects) an AI-extracted budget — see
// app/(app)/project-card/CONTEXT.md's Budget entry. Once verified, a
// re-crawl from project-card-crawler will never overwrite this value again
// (see lib/project-card.ts's ingest upsert). No role check beyond being
// logged in: Project Card follows the app's existing flat access model
// (see docs/adr/0006-project-card-flat-access-control.md) — any signed-in
// user may verify a budget, same as any signed-in user may already see it.
export async function verifyProjectCardBudget(id: string, budgetAmount: number | null): Promise<void> {
  const actor = await requireActor();
  if (budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0)) {
    throw new Error("จำนวนงบประมาณไม่ถูกต้อง");
  }
  await prisma.projectCard.update({
    where: { id },
    data: {
      budgetAmount,
      budgetVerified: true,
      budgetVerifiedAt: new Date(),
      budgetVerifiedById: actor.id,
    },
  });
  revalidatePath("/project-card");
}

const MAX_TEXT_LENGTH = 5000;

// Saves the Project Card popup's edit form. `budgetAmount` is only passed
// when the user actually changed the number — a hand-entered figure counts
// as a person confirming it, same as verifyProjectCardBudget. Leaving it
// undefined keeps the existing budget and its verified/unverified state.
// Category/Tags/Work Types are compared with what's stored: only an actual change
// marks the classification as edited by a person, after which a push never
// overwrites it (CONTEXT.md's Description Source entry). The same goes for
// the Description: a change to either language sets its source to `manual`.
export async function updateProjectCardDetails(
  id: string,
  input: {
    descriptionTh: string;
    descriptionEn: string;
    budgetNote: string;
    budgetAmount?: number | null;
    category?: string | null;
    tags?: string[];
    workTypes?: string[];
  },
): Promise<void> {
  const actor = await requireActor();
  const descriptionTh = input.descriptionTh.trim();
  const descriptionEn = input.descriptionEn.trim();
  const budgetNote = input.budgetNote.trim();
  if ([descriptionTh, descriptionEn, budgetNote].some((text) => text.length > MAX_TEXT_LENGTH)) {
    throw new Error("ข้อความยาวเกินไป");
  }
  const { budgetAmount } = input;
  if (budgetAmount !== undefined && budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0)) {
    throw new Error("จำนวนงบประมาณไม่ถูกต้อง");
  }
  const existing = await prisma.projectCard.findUniqueOrThrow({
    where: { id },
    select: { descriptionTh: true, descriptionEn: true, category: true, tags: true, workTypes: true },
  });
  const descriptionChanged =
    descriptionTh !== existing.descriptionTh.trim() || descriptionEn !== existing.descriptionEn.trim();
  let classification = {};
  if (input.category !== undefined || input.tags !== undefined || input.workTypes !== undefined) {
    const categoryAndTags = validateClassification(input.category, input.tags);
    // An omitted workTypes keeps what's stored rather than clearing it.
    const workTypes = input.workTypes === undefined ? existing.workTypes : validateWorkTypes(input.workTypes);
    // A classified card keeps at least one Work Type (CONTEXT.md: "one or
    // more"); clearing them all would also lock the field against pushes.
    if (workTypes.length === 0 && existing.workTypes.length > 0) throw new Error("ต้องมีลักษณะงานอย่างน้อย 1 อย่าง");
    const sameSet = (a: string[], b: string[]) => a.length === b.length && b.every((v) => a.includes(v));
    if (existing.category !== categoryAndTags.category || !sameSet(existing.tags, categoryAndTags.tags) || !sameSet(existing.workTypes, workTypes)) {
      classification = { ...categoryAndTags, workTypes, classificationEditedByPerson: true };
    }
  }
  await prisma.projectCard.update({
    where: { id },
    data: {
      // Clearing both languages leaves nothing to label or protect, so the
      // source goes back to null and a later push may fill it again.
      ...(descriptionChanged
        ? { descriptionTh, descriptionEn, descriptionSource: descriptionTh || descriptionEn ? "manual" : null }
        : {}),
      budgetNote,
      ...classification,
      ...(budgetAmount === undefined
        ? {}
        : { budgetAmount, budgetVerified: true, budgetVerifiedAt: new Date(), budgetVerifiedById: actor.id }),
    },
  });
  revalidatePath("/project-card");
}
