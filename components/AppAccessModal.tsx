"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { APPS, cleanAppAccess, heldLevel, type AppPermission } from "@/lib/access";

// Per-app access for one USER, one row per app in lib/access.ts's APPS, each
// with "ไม่มีสิทธิ์" plus that app's levels. Nothing is saved until "บันทึก",
// so the Activity log gets one entry per change. The parent remounts this
// via `key` each time it opens, so the choices always start from `initial`.
export default function AppAccessModal({
  open,
  title,
  initial,
  pending,
  confirmLabel = "บันทึก",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  initial: readonly string[];
  pending: boolean;
  confirmLabel?: string;
  onConfirm: (appAccess: AppPermission[]) => void;
  onCancel: () => void;
}) {
  const [access, setAccess] = useState<AppPermission[]>(() => cleanAppAccess(initial));

  // Picks one level (or none, -1) for `app`, replacing whatever it held.
  function choose(app: (typeof APPS)[number], index: number) {
    const others = access.filter((a) => !app.levels.some((l) => l.access === a));
    setAccess(cleanAppAccess(index < 0 ? others : [...others, app.levels[index].access]));
  }

  return (
    <Modal open={open} onClose={pending ? () => {} : onCancel} labelledBy="app-access-heading" width={560}>
      <div id="app-access-heading" className="mb-4 font-display text-base font-bold text-ink">
        {title}
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {APPS.map((app) => {
          const held = heldLevel(access, app);
          const options = [{ index: -1, label: "ไม่มีสิทธิ์" }, ...app.levels.map((l, i) => ({ index: i, label: l.label }))];
          return (
            <li key={app.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-medium text-ink">{app.name}</div>
                <div className="text-xs text-muted">{app.description}</div>
              </div>
              <div role="radiogroup" aria-label={app.name} className="flex w-fit self-start rounded-input border border-line bg-surface p-0.5">
                {options.map((o) => {
                  const on = held === o.index;
                  return (
                    <button
                      key={o.index}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={pending}
                      onClick={() => choose(app, o.index)}
                      className={`ui-btn rounded-input px-3 py-1.5 text-xs font-medium transition-colors ${
                        on ? "bg-ink text-surface" : "text-label hover:bg-hover"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          ยกเลิก
        </Button>
        <Button type="button" variant="dark" size="sm" onClick={() => onConfirm(access)} disabled={pending}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
