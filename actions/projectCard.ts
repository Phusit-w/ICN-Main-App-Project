"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { validateClassification, validateWorkTypes } from "@/lib/project-card";
import { loadTaxonomy } from "@/lib/project-card-terms";

// Confirms (and optionally corrects) an AI-extracted budget — see
// app/(app)/project-card/CONTEXT.md's Budget entry. Once verified, a
// re-crawl from project-card-crawler will never overwrite this value again
// (see lib/project-card.ts's ingest upsert). No role check beyond being
// logged in: Project Card follows the app's existing flat access model
// (see docs/adr/0006-project-card-flat-access-control.md) — any signed-in
// user may verify a budget, same as any signed-in user may already see it.
export async function verifyProjectCardBudget(id: string, budgetAmount: number | null): Promise<void> {
  const actor = await requireAccess("project-card-edit");
  if (budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0)) {
    throw new Error("จำนวนงบประมาณไม่ถูกต้อง");
  }
  const existing = await prisma.projectCard.findUniqueOrThrow({
    where: { id },
    select: { projectCode: true, budgetAmount: true },
  });
  await prisma.projectCard.update({
    where: { id },
    data: {
      budgetAmount,
      budgetVerified: true,
      budgetVerifiedAt: new Date(),
      budgetVerifiedById: actor.id,
    },
  });
  const before = existing.budgetAmount?.toNumber() ?? null;
  await writeAudit({
    actorId: actor.id,
    action: "PROJECT_CARD_BUDGET_VERIFIED",
    entityType: "PROJECT_CARD",
    entityId: id,
    summary: `ยืนยันงบ ${existing.projectCode}: ${
      before === budgetAmount ? formatBaht(budgetAmount) : `${formatBaht(before)} → ${formatBaht(budgetAmount)}`
    }`,
    before: { budgetAmount: before },
    after: { budgetAmount },
  });
  revalidatePath("/project-card");
}

function formatBaht(amount: number | null): string {
  return amount === null ? "ว่าง" : amount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Thai names for the Activity log summary; before/after keep the raw values.
const FIELD_LABEL: Record<string, string> = {
  descriptionTh: "รายละเอียดไทย",
  descriptionEn: "รายละเอียดอังกฤษ",
  budgetNote: "หมายเหตุ",
  budgetAmount: "งบ",
  category: "หมวดหลัก",
  tags: "หมวดหมู่รอง",
  workTypes: "ลักษณะงาน",
};

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
  const actor = await requireAccess("project-card-edit");
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
    select: {
      projectCode: true,
      descriptionTh: true,
      descriptionEn: true,
      budgetNote: true,
      budgetAmount: true,
      category: true,
      tags: true,
      workTypes: true,
    },
  });
  const descriptionChanged =
    descriptionTh !== existing.descriptionTh.trim() || descriptionEn !== existing.descriptionEn.trim();
  let classification: { category?: string | null; tags?: string[]; workTypes?: string[]; classificationEditedByPerson?: boolean } = {};
  if (input.category !== undefined || input.tags !== undefined || input.workTypes !== undefined) {
    const taxonomy = await loadTaxonomy();
    const categoryAndTags = validateClassification(input.category, input.tags, taxonomy.categories);
    // An omitted workTypes keeps what's stored rather than clearing it.
    const workTypes = input.workTypes === undefined ? existing.workTypes : validateWorkTypes(input.workTypes, taxonomy.workTypes);
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

  // Activity log: only the fields that actually changed, old and new values.
  const sameSet = (a: string[], b: string[]) => a.length === b.length && b.every((v) => a.includes(v));
  const existingBudget = existing.budgetAmount?.toNumber() ?? null;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const record = (field: string, from: unknown, to: unknown) => {
    before[field] = from;
    after[field] = to;
  };
  if (descriptionTh !== existing.descriptionTh.trim()) record("descriptionTh", existing.descriptionTh, descriptionTh);
  if (descriptionEn !== existing.descriptionEn.trim()) record("descriptionEn", existing.descriptionEn, descriptionEn);
  if (budgetNote !== existing.budgetNote.trim()) record("budgetNote", existing.budgetNote, budgetNote);
  if (budgetAmount !== undefined && budgetAmount !== existingBudget) record("budgetAmount", existingBudget, budgetAmount);
  if (classification.category !== undefined && classification.category !== existing.category) {
    record("category", existing.category, classification.category);
  }
  if (classification.tags && !sameSet(classification.tags, existing.tags)) record("tags", existing.tags, classification.tags);
  if (classification.workTypes && !sameSet(classification.workTypes, existing.workTypes)) {
    record("workTypes", existing.workTypes, classification.workTypes);
  }
  const changed = Object.keys(after);
  if (changed.length) {
    const budgetText =
      "budgetAmount" in after ? ` (งบ ${formatBaht(existingBudget)} → ${formatBaht(budgetAmount ?? null)})` : "";
    await writeAudit({
      actorId: actor.id,
      action: "PROJECT_CARD_UPDATED",
      entityType: "PROJECT_CARD",
      entityId: id,
      summary: `แก้โครงการ ${existing.projectCode}: ${changed.map((f) => FIELD_LABEL[f]).join(", ")}${budgetText}`,
      before,
      after,
    });
  }
  revalidatePath("/project-card");
}
