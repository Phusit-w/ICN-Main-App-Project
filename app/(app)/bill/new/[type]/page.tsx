import { requirePageAccess } from "@/lib/authorization";
import { notFound } from "next/navigation";
import { getProfile } from "@/actions/profile";
import { listSavedItems } from "@/actions/savedItems";
import BillEditor from "@/components/BillEditor";
import { DEFAULT_ROWS_FA017, DEFAULT_ROWS_FA018 } from "@/lib/constants";
import { emptyItemFA017, emptyItemFA018 } from "@/lib/types";
import type { Draft, RecordType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_MAP: Record<string, RecordType> = {
  fa018: "FA018",
  fa017: "FA017",
};

// Ported from Component.newRecord: builds a fresh draft prefilled with the
// current month number/year and the shared employee profile as defaults.
export default async function NewBillPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  await requirePageAccess("expense");
  const { type } = await params;
  const recordType = TYPE_MAP[type];
  if (!recordType) notFound();

  const profile = await getProfile();
  const savedItems = await listSavedItems(recordType);
  const now = new Date();

  const draft: Draft = {
    id: null,
    updatedAt: null,
    type: recordType,
    day: now.getDate(),
    monthName: String(now.getMonth() + 1),
    monthYear: now.getFullYear() + 543,
    employee: { ...profile },
    remark: "",
    items:
      recordType === "FA018"
        ? Array.from({ length: DEFAULT_ROWS_FA018 }, emptyItemFA018)
        : Array.from({ length: DEFAULT_ROWS_FA017 }, emptyItemFA017),
  };

  return <BillEditor initialDraft={draft} savedItems={savedItems} />;
}
