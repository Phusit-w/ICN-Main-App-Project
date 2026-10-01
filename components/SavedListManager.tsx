"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import SearchSelect from "@/components/SearchSelect";
import Button from "@/components/ui/Button";

// "Manage / delete saved entries" control. Deletion is a three-step,
// deliberate flow:
//   1. type-to-search the styled dropdown and pick an entry — it becomes
//      the "staged" selection (shown below, not deleted);
//   2. press its "ลบ" button;
//   3. confirm in the dialog.
// Used for saved expense-item rows (lib/useSavedItems.ts) and saved
// employees (actions/profile.ts). Renders nothing when there's nothing
// saved yet.
export default function SavedListManager({
  label,
  items,
  onDelete,
  className,
}: {
  label: string;
  items: { id: string; text: string }[];
  onDelete: (id: string) => Promise<void>;
  className?: string;
}) {
  const [selected, setSelected] = useState<{ id: string; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; text: string } | null>(null);

  if (items.length === 0) return null;

  async function confirmDelete() {
    if (!confirming) return;
    const { id } = confirming;
    setConfirming(null);
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
    setSelected(null);
  }

  return (
    <div className={className}>
      <SearchSelect
        options={items.map((it) => it.text)}
        onPick={(text) => {
          const hit = items.find((it) => it.text === text);
          if (hit) setSelected(hit);
        }}
        disabled={deletingId !== null}
        placeholder={`ค้นหาเพื่อลบ${label} (${items.length})`}
        className="w-[220px] max-w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-medium text-label
          outline-none transition-colors
          hover:border-danger hover:text-danger hover:placeholder:text-danger
          focus:border-danger focus:text-danger focus:shadow-[0_0_0_3px_var(--color-danger-border)]
          disabled:cursor-not-allowed disabled:opacity-50"
      />

      {selected && (
        <div className="mt-1.5 flex max-w-[360px] items-center gap-2 rounded-field border border-line bg-surface px-2.5 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">{selected.text}</span>
          <Button
            variant="danger"
            size="sm"
            className="shrink-0 !h-7 !px-3 !text-[11px]"
            onClick={() => setConfirming(selected)}
            disabled={deletingId !== null}
          >
            ลบ
          </Button>
          <button
            type="button"
            onClick={() => setSelected(null)}
            title="ยกเลิกการเลือก"
            className="ui-btn shrink-0 px-1 text-label transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={`ลบ${label}`}
        message={
          confirming ? `ลบ "${confirming.text}" ที่บันทึกไว้ใช่หรือไม่?` : ""
        }
        confirmLabel="ลบ"
        danger
        busy={deletingId !== null}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
