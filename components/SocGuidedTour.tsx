"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { driver, type Driver } from "driver.js";
import Button from "@/components/ui/Button";
import { readStoredFlag, writeStoredFlag } from "@/components/SocCollapse";
import type { SocTourStep } from "@/lib/soc-tours";

// Below this width the tour never opens on its own (popups would cover a small
// screen); the button still works.
const AUTO_START_MIN_WIDTH = 1024;

// แนะนำการใช้งาน for one SOC page: the header button, plus the first-visit
// auto-start. The only module that imports driver.js. The tour only points:
// it never clicks or opens anything, and the highlighted control can't be
// used while it shows. Seen state is per tour id, in this browser.
export default function SocGuidedTour({ tourId, steps, ready = true }: {
  tourId: string;
  steps: SocTourStep[];
  // false keeps the tour from opening on its own (and from being marked seen)
  // until the page is ready; the button works either way.
  ready?: boolean;
}) {
  const seenKey = `soc:tour-seen:${tourId}`;
  const tour = useRef<Driver | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Steps are resolved now: a control that isn't on screen (missing, or inside a folded panel) drops its step.
  function start() {
    if (tour.current?.isActive()) return;
    const present = steps.filter((step) => { const el = document.querySelector(targetSelector(step)); return el && !el.closest("[hidden]"); });
    if (!present.length) return;
    const instance = driver({
      steps: present.map((step) => ({ element: targetSelector(step), popover: { title: step.title, description: step.body } })),
      showProgress: true,
      progressText: "{{current}}/{{total}}",
      nextBtnText: "ถัดไป",
      prevBtnText: "ย้อนกลับ",
      doneBtnText: "เสร็จสิ้น",
      closeBtnLabel: "ปิด",
      popoverClass: "soc-tour",
      disableActiveInteraction: true,
      onPopoverRender: (popover) => {
        // The popup sits outside .app-shell-root, so it copies the shell's theme.
        popover.wrapper.dataset.theme = document.querySelector<HTMLElement>(".app-shell-root")?.dataset.theme ?? "light";
        for (const button of [popover.previousButton, popover.nextButton, popover.closeButton]) button.classList.add("ui-btn");
        // driver.js focuses × (first in the popup) after this hook; Enter should go on instead.
        queueMicrotask(() => popover.nextButton.focus());
      },
      // ×, Esc, the overlay, or finishing: the user closed it, so it's seen.
      // Leaving the page mid-tour isn't: unmounting calls destroy(), which skips this hook.
      onDestroyStarted: () => {
        writeStoredFlag(seenKey, true);
        instance.destroy();
        button.current?.focus({ preventScroll: true }); // the page stays where the tour left it
      },
    });
    tour.current = instance;
    instance.drive();
  }

  const autoStart = useEffectEvent(() => {
    if (window.innerWidth < AUTO_START_MIN_WIDTH || readStoredFlag(seenKey, false)) return;
    start();
  });
  // One tick later: the folded/open choice of a panel is read from this browser right after hydration,
  // and steps inside a panel folded that way must be seen as hidden when they are resolved.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(autoStart, 0);
    return () => window.clearTimeout(timer);
  }, [ready]);
  useEffect(() => () => tour.current?.destroy(), []);

  return <Button ref={button} size="sm" variant="outline" onClick={start}>แนะนำการใช้งาน</Button>;
}

const targetSelector = (step: SocTourStep) => `[data-tour="${step.target}"]`;
