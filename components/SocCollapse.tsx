"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Yes/no view choices remembered per browser (falls back to memory when storage is blocked).
const STORED_FLAG_EVENT = "soc:stored-flag-changed";
const storedFlagFallback = new Map<string, boolean>();

export function readStoredFlag(key: string, initial: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? storedFlagFallback.get(key) ?? initial : value === "1";
  } catch {
    return storedFlagFallback.get(key) ?? initial;
  }
}
export function writeStoredFlag(key: string, value: boolean) {
  try { window.localStorage.setItem(key, value ? "1" : "0"); } catch { /* storage blocked: the fallback below still works */ }
  storedFlagFallback.set(key, value);
  window.dispatchEvent(new Event(STORED_FLAG_EVENT));
}
function subscribeStoredFlag(onChange: () => void) {
  window.addEventListener(STORED_FLAG_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(STORED_FLAG_EVENT, onChange); window.removeEventListener("storage", onChange); };
}
export function useStoredFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribeStoredFlag, () => readStoredFlag(key, initial), () => initial);
  return [value, (next: boolean) => writeStoredFlag(key, next)];
}

// The ▶ header button that folds a panel away (same look as CollapsibleEntryRow).
export function CollapseButton({ open, onToggle, controls, children }: { open: boolean; onToggle: () => void; controls: string; children: ReactNode }) {
  return <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} title={open ? "ย่อ" : "ขยาย"} className="ui-btn flex min-w-0 items-center gap-2 text-left">
    <span aria-hidden className={`shrink-0 text-[10px] text-muted transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
    {children}
  </button>;
}
