"use server";

import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/authorization";
import type { FA017Item, FA018Item, RecordType, SavedItemEntry } from "@/lib/types";

// Reusable expense-item-row templates — same "save under a key, pick it
// back out next time" idea as actions/profile.ts's SavedEmployee, but for a
// single row of an expense claim (e.g. a recurring "ค่าน้ำมันประจำเดือน"
// line) instead of employee info. `desc` (the รายการ / Description of
// Expenses text) is the lookup key, exactly like SavedEmployee.name —
// saving again under the same desc updates that entry in place rather than
// creating a duplicate. Scoped by `type` since FA017Item and FA018Item have
// different shapes (see lib/types.ts).
export async function listSavedItems(type: RecordType): Promise<SavedItemEntry[]> {
  await requireAccess("expense");
  const rows = await prisma.savedItem.findMany({
    where: { type },
    orderBy: { desc: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    desc: row.desc,
    data: row.data as Record<string, string>,
  }));
}

// Returns the saved row (with its id) rather than void — callers keep a
// local optimistic copy of the saved-items list (lib/useSavedItems.ts) and
// need the id to let a just-saved row be deleted again without a page
// reload. Returns null when there's nothing to save (blank desc), so
// callers can no-op the same way the old void-returning version let them.
export async function saveItemForReuse(
  type: RecordType,
  item: FA017Item | FA018Item
): Promise<SavedItemEntry | null> {
  await requireAccess("expense");
  const desc = item.desc.trim();
  if (!desc) return null; // no description typed yet — nothing to key the saved entry by

  // Everything except `date` (transaction-specific, not part of a reusable
  // template) and `desc` (already its own column) is stored as-is.
  const { date: _date, desc: _desc, ...data } = item;

  const row = await prisma.savedItem.upsert({
    where: { type_desc: { type, desc } },
    update: { data },
    create: { type, desc, data },
  });
  // Both entry-form routes and the compact BillEditor routes are already
  // force-dynamic (fetch fresh on every request), so no revalidatePath is
  // needed here — same rationale as saveEmployeeForReuse.
  return { id: row.id, desc: row.desc, data: row.data as Record<string, string> };
}

export async function deleteSavedItem(id: string): Promise<void> {
  await requireAccess("expense");
  await prisma.savedItem.delete({ where: { id } });
}
