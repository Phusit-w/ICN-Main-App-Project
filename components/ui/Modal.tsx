"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

// Shared modal shell for the redesign — a dim backdrop + centred white card.
// Esc and backdrop-click both cancel. `.no-print` so it never shows on a
// printed page. The three confirm modals (ConfirmDialog, ConfirmSaveModal,
// ConfirmLogoutModal) render their body/actions inside this.
export default function Modal({
  open,
  onClose,
  labelledBy,
  children,
  width = 400,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(92vw, ${width}px)` }}
        // A modal opened from a table cell must not inherit its nowrap or alignment.
        className="whitespace-normal text-left rounded-card bg-surface p-6 shadow-dropdown"
      >
        {children}
      </div>
    </div>
  );
}
