"use client";

import { useState, useTransition } from "react";
import { verifyProjectCardBudget } from "@/actions/projectCard";
import Button from "@/components/ui/Button";
import { fmt } from "@/lib/format";

const VAT_LABEL: Record<string, string> = {
  included: "รวม VAT",
  excluded: "ไม่รวม VAT",
  unspecified: "VAT ไม่ระบุ",
};

// "จากสัญญา" only appears when the Budget wasn't sourced from the Work
// Certificate (CONTEXT.md's Budget entry) — a certificate figure is the
// default/authoritative case and needs no extra label.
function BudgetMeta({ budgetSource, vatStatus, budgetNote }: { budgetSource: string | null; vatStatus: string | null; budgetNote: string }) {
  if (!budgetSource && !vatStatus && !budgetNote) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {budgetSource === "contract" ? (
        <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">จากสัญญา</span>
      ) : null}
      {vatStatus ? <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">{VAT_LABEL[vatStatus] ?? vatStatus}</span> : null}
      {budgetNote ? <span className="text-xs text-muted">{budgetNote}</span> : null}
    </div>
  );
}

// Unverified rows open straight into the confirm form (there's nothing
// verified yet to show collapsed); verified rows show the value with a
// "แก้ไข" to reopen it — see CONTEXT.md's Budget entry for why an
// unverified number is never presented as settled.
export default function ProjectCardBudgetForm({
  id,
  budgetAmount,
  budgetVerified,
  budgetSource,
  vatStatus,
  budgetNote,
}: {
  id: string;
  budgetAmount: string | null;
  budgetVerified: boolean;
  budgetSource: string | null;
  vatStatus: string | null;
  budgetNote: string;
}) {
  const [editing, setEditing] = useState(!budgetVerified);
  const [value, setValue] = useState(budgetAmount ?? "");
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{budgetAmount ? `${fmt(budgetAmount, 2)} บาท` : "ยังไม่ระบุ"}</span>
          <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">ยืนยันแล้ว</span>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
            แก้ไข
          </Button>
        </div>
        <BudgetMeta budgetSource={budgetSource} vatStatus={vatStatus} budgetNote={budgetNote} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim();
          const parsed = trimmed === "" ? null : Number(trimmed);
          if (parsed !== null && !Number.isFinite(parsed)) return;
          startTransition(async () => {
            await verifyProjectCardBudget(id, parsed);
            setEditing(false);
          });
        }}
      >
        {budgetAmount ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            AI แนะนำ ยังไม่ยืนยัน
          </span>
        ) : null}
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="จำนวนเงิน (บาท)"
          className="h-9 w-40 rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-ink"
        />
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? "กำลังบันทึก…" : "ยืนยันงบประมาณ"}
        </Button>
        {budgetVerified ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setValue(budgetAmount ?? "");
              setEditing(false);
            }}
          >
            ยกเลิก
          </Button>
        ) : null}
      </form>
      <BudgetMeta budgetSource={budgetSource} vatStatus={vatStatus} budgetNote={budgetNote} />
    </div>
  );
}
