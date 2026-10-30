"use client";

import { useState, type ReactNode } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

type ConfirmOptions = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type ChooseOptions = ConfirmOptions & { alternateLabel: string };
export type Choice = "confirm" | "alternate";

// ConfirmDialog as an awaitable question, for flows that confirm more than
// once or decide after a server reply: `if (!(await confirm({...}))) return;`.
// Render `dialog` once in the component.
// `choose` is the same question with a second way to say yes (alternateLabel):
// it answers which one was picked, or null for cancel.
export function useConfirmDialog(): [dialog: ReactNode, confirm: (options: ConfirmOptions) => Promise<boolean>, choose: (options: ChooseOptions) => Promise<Choice | null>] {
  const [asked, setAsked] = useState<(ConfirmOptions & { alternateLabel?: string; answer: (choice: Choice | null) => void }) | null>(null);
  const confirm = (options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsked({ ...options, answer: (choice) => resolve(choice === "confirm") }));
  const choose = (options: ChooseOptions) => new Promise<Choice | null>((resolve) => setAsked({ ...options, answer: resolve }));
  const close = (choice: Choice | null) => {
    asked?.answer(choice);
    setAsked(null);
  };
  const dialog = <ConfirmDialog open={!!asked} title={asked?.title ?? ""} message={asked?.message ?? ""} confirmLabel={asked?.confirmLabel} cancelLabel={asked?.cancelLabel} danger={asked?.danger} alternateLabel={asked?.alternateLabel} onAlternate={() => close("alternate")} onConfirm={() => close("confirm")} onCancel={() => close(null)} />;
  return [dialog, confirm, choose];
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
  alternateLabel,
  onAlternate,
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
  alternateLabel?: string;
  onAlternate?: () => void;
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
        {alternateLabel && onAlternate ? <Button variant="outline" size="sm" onClick={onAlternate} disabled={busy}>{alternateLabel}</Button> : null}
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
