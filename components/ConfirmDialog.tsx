"use client";

import { useState, type ReactNode } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

type ConfirmOptions = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

// ConfirmDialog as an awaitable question, for flows that confirm more than
// once or decide after a server reply: `if (!(await confirm({...}))) return;`.
// Render `dialog` once in the component.
export function useConfirmDialog(): [dialog: ReactNode, confirm: (options: ConfirmOptions) => Promise<boolean>] {
  const [asked, setAsked] = useState<(ConfirmOptions & { answer: (yes: boolean) => void }) | null>(null);
  const confirm = (options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsked({ ...options, answer: resolve }));
  const close = (yes: boolean) => {
    asked?.answer(yes);
    setAsked(null);
  };
  const dialog = <ConfirmDialog open={!!asked} title={asked?.title ?? ""} message={asked?.message ?? ""} confirmLabel={asked?.confirmLabel} cancelLabel={asked?.cancelLabel} danger={asked?.danger} onConfirm={() => close(true)} onCancel={() => close(false)} />;
  return [dialog, confirm];
}

// Generic yes/no modal — used in place of window.confirm() wherever a
// destructive action needs an explicit confirmation step. See
// ConfirmSaveModal.tsx for the save flow's richer (summary-row) modal;
// this is the plain title + message version for everything else.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-dialog-heading">
      <div
        id="confirm-dialog-heading"
        className="mb-2 font-display text-base font-bold text-ink"
      >
        {title}
      </div>
      <div className="mb-5 text-sm leading-relaxed text-subtle">{message}</div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "dangerSolid" : "dark"}
          size="sm"
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
