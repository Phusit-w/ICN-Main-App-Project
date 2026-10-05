import { requirePageAccess } from "@/lib/authorization";
import { notFound } from "next/navigation";
import { getProfile, listSavedEmployees } from "@/actions/profile";
import { listSavedItems } from "@/actions/savedItems";
import EntryFlow from "@/components/EntryFlow";
import type { RecordType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_MAP: Record<string, RecordType> = {
  fa018: "FA018",
  fa017: "FA017",
};

// Friendlier alternative front door to /bill/new/[type]: same type
// validation + shared-profile prefill, but hands off to EntryFlow (roomy
// plain-input entry form) instead of building an empty Draft straight into
// BillEditor's pixel-perfect print table. EntryFlow itself builds the Draft
// client-side once the user submits — see its comment for why this is a
// client-side render swap rather than a route change.
export default async function EntryBillPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  await requirePageAccess("expense");
  const { type } = await params;
  const recordType = TYPE_MAP[type];
  if (!recordType) notFound();

  // Sequential, not Promise.all — see app/page.tsx's identical comment on
  // concurrent queries sharing one Prisma client corrupting the wire
  // protocol against this project's Postgres setup.
  const profile = await getProfile();
  const savedEmployees = await listSavedEmployees();
  const savedItems = await listSavedItems(recordType);

  return (
    <EntryFlow
      type={recordType}
      profile={profile}
      savedEmployees={savedEmployees}
      savedItems={savedItems}
    />
  );
}
