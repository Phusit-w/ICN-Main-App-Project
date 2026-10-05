import { requirePageAccess } from "@/lib/authorization";
import { notFound } from "next/navigation";
import { getRecord } from "@/actions/records";
import { listSavedItems } from "@/actions/savedItems";
import BillEditor from "@/components/BillEditor";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

// Ported from Component.editRecord: loads a saved record into a draft.
export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("expense");
  const { id } = await params;
  const record = await getRecord(id);
  if (!record) notFound();
  const savedItems = await listSavedItems(record.type);

  const draft: Draft = {
    id: record.id,
    updatedAt: record.updatedAt,
    type: record.type,
    day: record.day,
    monthName: record.monthName,
    monthYear: record.monthYear,
    employee: {
      name: record.employeeName,
      position: record.employeePosition,
      department: record.employeeDepartment,
      office: record.employeeOffice,
      employeeNo: record.employeeNo,
      projectCC: record.employeeProjectCC,
    },
    remark: record.remark,
    items: record.items,
  };

  return (
    <BillEditor
      initialDraft={draft}
      savedItems={savedItems}
      createdByName={record.createdByName}
      updatedByName={record.updatedByName}
    />
  );
}
