"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { fa017Totals, fa018Total } from "@/lib/totals";
import { authorizeExpenseRecord, requireAccess, writeAudit } from "@/lib/authorization";
import type {
  Draft,
  DraftItem,
  ExpenseRecordData,
  FA017Item,
  FA018Item,
} from "@/lib/types";

type PrismaExpenseRecord = Awaited<
  ReturnType<typeof prisma.expenseRecord.findFirstOrThrow>
>;

function serialize(row: PrismaExpenseRecord): ExpenseRecordData {
  return {
    id: row.id,
    type: row.type as ExpenseRecordData["type"],
    day: row.day,
    monthName: row.monthName,
    monthYear: row.monthYear,
    employeeName: row.employeeName,
    employeePosition: row.employeePosition,
    employeeDepartment: row.employeeDepartment,
    employeeOffice: row.employeeOffice,
    employeeNo: row.employeeNo,
    employeeProjectCC: row.employeeProjectCC,
    remark: row.remark,
    items: row.items as unknown as DraftItem[],
    total: row.total.toString(),
    createdByName: row.createdByName,
    updatedByName: row.updatedByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// "" if nobody's logged in — shouldn't happen in production (proxy.ts
// gates every route behind a session first) but dev skips auth entirely
// (see proxy.ts), so these actions still need to work with no session.
function computeTotal(draft: Draft): number {
  return draft.type === "FA018"
    ? fa018Total(draft.items as FA018Item[])
    : fa017Totals(draft.items as FA017Item[]).thb;
}

export async function listRecords(): Promise<ExpenseRecordData[]> {
  // No per-owner visibility restriction: every logged-in account sees every
  // record, matching this app's "no permission levels" design — `ownerId`
  // is recorded for audit purposes only (see createdByName), not used to
  // gate reads.
  await requireAccess("expense");
  const rows = await prisma.expenseRecord.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
}

export async function getRecord(
  id: string
): Promise<ExpenseRecordData | null> {
  try {
    const { record } = await authorizeExpenseRecord(id);
    return serialize(record);
  } catch {
    return null;
  }
}

// Mirrors Component.saveDraft: creates a new record, or updates in place
// when the draft carries an existing id — but unlike the original design
// (a single-user localStorage app with nothing to race against), this app
// can have several people editing the same saved record at once (no
// login, shared office access — see proxy.ts). A plain `update` would let
// whoever saves second silently wipe out whoever saved first's changes.
// Guard against that with optimistic locking: draft.updatedAt is whatever
// this draft was loaded with, and the update only applies if the row's
// updatedAt still matches — i.e. nobody else saved it in between. Returns
// a discriminated result rather than throwing on conflict, since this is
// an expected, common condition to report to the user, not an exceptional
// one to blow up the request over.
export async function saveRecord(
  draft: Draft
): Promise<
  { ok: true; record: ExpenseRecordData } | { ok: false; reason: "conflict" }
> {
  const total = computeTotal(draft);
  const actor = await requireAccess("expense");
  const actorName = actor.displayName;
  const data = {
    type: draft.type,
    day: draft.day,
    monthName: draft.monthName,
    monthYear: draft.monthYear,
    employeeName: draft.employee.name,
    employeePosition: draft.employee.position,
    employeeDepartment: draft.employee.department,
    employeeOffice: draft.employee.office,
    employeeNo: draft.employee.employeeNo,
    employeeProjectCC: draft.employee.projectCC,
    remark: draft.remark,
    items: draft.items as object[],
    total,
    updatedByName: actorName,
  };

  if (!draft.id) {
    const row = await prisma.expenseRecord.create({
      data: { ...data, ownerId: actor.id, createdByName: actorName },
    });
    await writeAudit({ actorId: actor.id, action: "EXPENSE_CREATED", entityType: "EXPENSE", entityId: row.id, summary: `สร้างเอกสาร ${row.type}`, after: { type: row.type, total: row.total.toString() } });
    // The saved-records list lives at /records (it was "/" before the 2026
    // redesign moved the Applications launcher there).
    revalidatePath("/records");
    return { ok: true, record: serialize(row) };
  }

  // updateMany (not update) because Prisma's `update` only accepts unique
  // fields in `where`, and updatedAt isn't one — updateMany accepts
  // arbitrary filters and reports how many rows it touched, which is the
  // compare-and-swap signal needed here. count === 0 covers both "someone
  // else already saved a change" and "someone deleted it" — both are
  // reported as the same conflict, since either way this draft's base
  // state is stale and the right next step for the user is the same
  // (reload before editing further).
  const { record: existing } = await authorizeExpenseRecord(draft.id);
  const result = await prisma.expenseRecord.updateMany({
    where: { id: draft.id, deletedAt: null, updatedAt: new Date(draft.updatedAt!) },
    data,
  });
  if (result.count === 0) {
    return { ok: false, reason: "conflict" };
  }

  const row = await prisma.expenseRecord.findUniqueOrThrow({
    where: { id: draft.id },
  });
  await writeAudit({ actorId: actor.id, action: "EXPENSE_UPDATED", entityType: "EXPENSE", entityId: row.id, summary: `แก้ไขเอกสาร ${row.type}`, before: { total: existing.total.toString() }, after: { total: row.total.toString() } });
  revalidatePath("/records");
  return { ok: true, record: serialize(row) };
}

export async function deleteRecord(id: string): Promise<void> {
  const { actor, record } = await authorizeExpenseRecord(id);
  const now = new Date();
  await prisma.expenseRecord.update({ where: { id }, data: { deletedAt: now, deletedById: actor.id, purgeAfter: new Date(now.getTime() + 30 * 86400000) } });
  await writeAudit({ actorId: actor.id, action: "EXPENSE_TRASHED", entityType: "EXPENSE", entityId: id, summary: `ย้ายเอกสาร ${record.type} ไปถังขยะ` });
  revalidatePath("/records");
}

// Mirrors Component.duplicateRecord: clone with a fresh id/timestamps,
// prepended to the list (achieved here via a new row + updatedAt: now).
export async function duplicateRecord(id: string): Promise<ExpenseRecordData> {
  const { actor, record: source } = await authorizeExpenseRecord(id);
  // The duplicate is a new record authored by whoever clicked "ทำซ้ำ" now,
  // not a copy of the source's original createdByName/updatedByName.
  const actorName = actor.displayName;
  const row = await prisma.expenseRecord.create({
    data: {
      type: source.type,
      day: source.day,
      monthName: source.monthName,
      monthYear: source.monthYear,
      employeeName: source.employeeName,
      employeePosition: source.employeePosition,
      employeeDepartment: source.employeeDepartment,
      employeeOffice: source.employeeOffice,
      employeeNo: source.employeeNo,
      employeeProjectCC: source.employeeProjectCC,
      remark: source.remark,
      items: source.items as object[],
      total: source.total,
      createdByName: actorName,
      updatedByName: actorName,
      ownerId: actor.id,
    },
  });
  await writeAudit({ actorId: actor.id, action: "EXPENSE_DUPLICATED", entityType: "EXPENSE", entityId: row.id, summary: `ทำสำเนาจาก ${id}`, metadata: { sourceId: id } });
  revalidatePath("/records");
  return serialize(row);
}
