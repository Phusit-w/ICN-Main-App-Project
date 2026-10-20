import { after, afterEach, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import type { SocTourStep } from "@/lib/soc-tours";
import type { SocRunnerView } from "@/lib/soc-shared";

// The /soc page's server data, for the anchor check at the end.
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }) } });
mock.module("next/link", { defaultExport: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props) });
mock.module("@/actions/soc", { namedExports: { trashSocJob: async () => ({ ok: true }) } });
mock.module("@/lib/authorization", { namedExports: { requirePageAccess: async () => undefined } });
mock.module("@/lib/soc", {
  namedExports: {
    requireSocActor: async () => ({ id: "user-1", role: "USER" }),
    listSocJobs: async () => [{
      id: "job-1", title: "งานทดสอบ", stage: "", status: "READY", progress: 0, majorItemProgress: { checked: 1, total: 4, percent: 25 },
      owner: { displayName: "ผู้ตรวจ" }, ownerId: "user-1", _count: { results: 10 }, updatedAt: new Date("2026-10-20T00:00:00Z"),
    }],
    SOC_STATUS_LABELS: { READY: "พร้อม" },
  },
});
mock.module("@/lib/soc-runner", { namedExports: { mySocRunner: async () => null } });
mock.module("@/lib/soc-runner-install", { namedExports: { latestSocRunnerVersion: async () => "0.8.0" } });

let dom: JSDOM;

function installDom() {
  // pretendToBeVisual: driver.js moves between steps on requestAnimationFrame.
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost", pretendToBeVisual: true });
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent,
    MouseEvent: dom.window.MouseEvent, getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
}

const setWidth = (width: number) => Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: width });

let SocGuidedTour: typeof import("@/components/SocGuidedTour").default;
before(async () => {
  installDom();
  SocGuidedTour = (await import("@/components/SocGuidedTour")).default;
});
afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  setWidth(1024);
});
after(() => dom.window.close());

const steps: SocTourStep[] = [
  { target: "a", title: "ขั้นแรก", body: "ข้อความขั้นแรก" },
  { target: "b", title: "ขั้นสอง", body: "ข้อความขั้นสอง" },
  { target: "c", title: "ขั้นสาม", body: "ข้อความขั้นสาม" },
];

// A page with the tour in its header and a control for each target given.
function page(tourId: string, targets: string[], ready?: boolean, pageSteps = steps) {
  return React.createElement("div", null,
    React.createElement(SocGuidedTour, { tourId, steps: pageSteps, ready }),
    ...targets.map((target) => React.createElement("button", { key: target, "data-tour": target }, `ปุ่ม ${target}`)));
}

const setup = async () => {
  const testing = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  return { ...testing, user };
};

// Long enough for an auto-start (or its absence) to show.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
// driver.js's default step animation is 400 ms.
const afterMove = () => new Promise((resolve) => setTimeout(resolve, 500));
const popup = () => dom.window.document.querySelector<HTMLElement>(".driver-popover");

test("a first visit opens step 1 by itself, with its text and step count", async () => {
  const { render, screen, within } = await setup();
  render(page("first-visit", ["a", "b", "c"]));
  const dialog = await screen.findByRole("dialog", { name: "ขั้นแรก" });
  assert.ok(within(dialog).getByText("ข้อความขั้นแรก"));
  assert.ok(within(dialog).getByText("1/3"));
  assert.ok(within(dialog).getByRole("button", { name: "ถัดไป" }));
  assert.ok(within(dialog).getByRole("button", { name: "ปิด" }));
});

test("× closes the tour and marks it seen: it doesn't open by itself again", async () => {
  const { render, screen, within, user, cleanup } = await setup();
  render(page("close-x", ["a", "b", "c"]));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "ปิด" }));
  assert.equal(popup(), null);
  cleanup();
  render(page("close-x", ["a", "b", "c"]));
  await settle();
  assert.equal(popup(), null);
});

test("Esc closes the tour and marks it seen", async () => {
  const { render, screen, user, cleanup } = await setup();
  render(page("close-esc", ["a", "b", "c"]));
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  assert.equal(popup(), null);
  cleanup();
  render(page("close-esc", ["a", "b", "c"]));
  await settle();
  assert.equal(popup(), null);
});

test("finishing goes step by step to เสร็จสิ้น and marks it seen; back works on the way", async () => {
  const { render, screen, within, user, cleanup } = await setup();
  render(page("finish", ["a", "b", "c"]));
  await user.click(within(await screen.findByRole("dialog", { name: "ขั้นแรก" })).getByRole("button", { name: "ถัดไป" }));
  await user.click(within(await screen.findByRole("dialog", { name: "ขั้นสอง" })).getByRole("button", { name: "ย้อนกลับ" }));
  await user.click(within(await screen.findByRole("dialog", { name: "ขั้นแรก" })).getByRole("button", { name: "ถัดไป" }));
  await user.click(within(await screen.findByRole("dialog", { name: "ขั้นสอง" })).getByRole("button", { name: "ถัดไป" }));
  const last = await screen.findByRole("dialog", { name: "ขั้นสาม" });
  assert.ok(within(last).getByText("3/3"));
  await user.click(within(last).getByRole("button", { name: "เสร็จสิ้น" }));
  assert.equal(popup(), null);
  cleanup();
  render(page("finish", ["a", "b", "c"]));
  await settle();
  assert.equal(popup(), null);
});

test("keyboard: Enter goes on, → and ← move between steps, and closing returns focus to the button", async () => {
  const { render, screen, user } = await setup();
  render(page("keyboard", ["a", "b", "c"]));
  await screen.findByRole("dialog", { name: "ขั้นแรก" });
  await settle();
  assert.equal(dom.window.document.activeElement?.textContent, "ถัดไป");
  await user.keyboard("{Enter}");
  await screen.findByRole("dialog", { name: "ขั้นสอง" });
  await afterMove(); // driver.js ignores arrow keys while a step is still moving
  await user.keyboard("{ArrowRight}");
  await screen.findByRole("dialog", { name: "ขั้นสาม" });
  await afterMove();
  await user.keyboard("{ArrowLeft}");
  await screen.findByRole("dialog", { name: "ขั้นสอง" });
  await user.keyboard("{Escape}");
  assert.equal(popup(), null);
  assert.equal(dom.window.document.activeElement, screen.getByRole("button", { name: "แนะนำการใช้งาน" }));
});

test("seen is per tour: closing one leaves another tour id to open by itself", async () => {
  const { render, screen, within, user, cleanup } = await setup();
  render(page("per-tour-1", ["a", "b", "c"]));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "ปิด" }));
  cleanup();
  render(page("per-tour-2", ["a", "b", "c"]));
  assert.ok(await screen.findByRole("dialog", { name: "ขั้นแรก" }));
});

test("the แนะนำการใช้งาน button replays a tour already seen", async () => {
  const { render, screen, within, user } = await setup();
  render(page("replay", ["a", "b", "c"]));
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "ปิด" }));
  await user.click(screen.getByRole("button", { name: "แนะนำการใช้งาน" }));
  assert.ok(await screen.findByRole("dialog", { name: "ขั้นแรก" }));
});

test("a step whose control isn't on screen is dropped, and the count shrinks", async () => {
  const { render, screen, within } = await setup();
  render(page("missing", ["a", "c"]));
  const dialog = await screen.findByRole("dialog", { name: "ขั้นแรก" });
  assert.ok(within(dialog).getByText("1/2"));
});

test("with no control on screen the tour doesn't start and isn't marked seen", async () => {
  const { render, screen, user, cleanup } = await setup();
  render(page("none", []));
  await user.click(screen.getByRole("button", { name: "แนะนำการใช้งาน" }));
  await settle();
  assert.equal(popup(), null);
  cleanup();
  render(page("none", ["b"]));
  assert.ok(await screen.findByRole("dialog", { name: "ขั้นสอง" }));
});

test("a narrow screen gets no tour by itself, but the button still works", async () => {
  const { render, screen, user } = await setup();
  setWidth(800);
  render(page("narrow", ["a", "b", "c"]));
  await settle();
  assert.equal(popup(), null);
  await user.click(screen.getByRole("button", { name: "แนะนำการใช้งาน" }));
  assert.ok(await screen.findByRole("dialog", { name: "ขั้นแรก" }));
});

test("not ready: no tour by itself and not marked seen; once ready, it opens", async () => {
  const { render, screen } = await setup();
  const view = render(page("ready", ["a", "b", "c"], false));
  await settle();
  assert.equal(popup(), null);
  view.rerender(page("ready", ["a", "b", "c"], true));
  assert.ok(await screen.findByRole("dialog", { name: "ขั้นแรก" }));
});

test("a re-render while the tour is open keeps it on the same step", async () => {
  const { render, screen, within, user } = await setup();
  const view = render(page("rerender", ["a", "b", "c"]));
  await user.click(within(await screen.findByRole("dialog", { name: "ขั้นแรก" })).getByRole("button", { name: "ถัดไป" }));
  await screen.findByRole("dialog", { name: "ขั้นสอง" });
  view.rerender(page("rerender", ["a", "b", "c"], true, [...steps]));
  await settle();
  assert.ok(screen.getByRole("dialog", { name: "ขั้นสอง" }));
  assert.equal(dom.window.document.querySelectorAll(".driver-popover").length, 1);
});

test("the tour only points: the highlighted control's click handler doesn't run while it shows", async () => {
  const { render, screen } = await setup();
  let clicked = 0;
  render(React.createElement("div", null,
    React.createElement(SocGuidedTour, { tourId: "points-only", steps: [steps[0]] }),
    React.createElement("button", { "data-tour": "a", onClick: () => { clicked += 1; } }, "ปุ่ม a")));
  await screen.findByRole("dialog", { name: "ขั้นแรก" });
  assert.equal(clicked, 0, "starting the tour clicks nothing");
  assert.ok(screen.getByRole("button", { name: "ปุ่ม a" }).classList.contains("driver-no-interaction"), "the highlighted control can't be used during the tour");
});

test("the popup follows the app's dark theme", async () => {
  const { render, screen } = await setup();
  const shell = dom.window.document.createElement("div");
  shell.className = "app-shell-root";
  shell.dataset.theme = "dark";
  dom.window.document.body.appendChild(shell);
  render(page("dark", ["a"]), { container: shell });
  const dialog = await screen.findByRole("dialog", { name: "ขั้นแรก" });
  assert.equal(dialog.dataset.theme, "dark");
  shell.remove();
});

const assertTourTargets = (container: HTMLElement, targets: string[]) => {
  for (const target of targets) assert.ok(container.querySelector(`[data-tour="${target}"]`), `missing data-tour="${target}"`);
};

test("every control the job-list tour points at is on /soc", async () => {
  const { render } = await setup();
  const { SOC_JOB_LIST_TOUR } = await import("@/lib/soc-tours");
  setWidth(800); // keep the tour itself out of the way
  const { default: SocJobsPage } = await import("@/app/(app)/soc/page");
  const view = render(await SocJobsPage());
  assertTourTargets(view.container, SOC_JOB_LIST_TOUR.map((step) => step.target));
});

test("the Runner panel marks its status and install button whether or not a Runner is linked", async () => {
  const { render, cleanup } = await setup();
  const { default: SocRunnerPanel } = await import("@/components/SocRunnerPanel");
  const linked: SocRunnerView = { state: "online", lastSeenAt: null, linkedAt: "2026-10-20T00:00:00Z", runnerVersion: "0.8.0", claudeLogin: null, revokedAt: null, revokeReason: null };
  for (const runner of [null, linked]) {
    const view = render(React.createElement(SocRunnerPanel, { runner, latestVersion: "0.8.0", showConfigDownload: false }));
    assertTourTargets(view.container, ["runner-status", "runner-install"]);
    cleanup();
  }
});

test("every control the new-job tour points at is on /soc/new, with the tour's button", async () => {
  const { render } = await setup();
  const { SOC_NEW_JOB_TOUR } = await import("@/lib/soc-tours");
  setWidth(800);
  const { default: NewSocJobPage } = await import("@/app/(app)/soc/new/page");
  const view = render(await NewSocJobPage());
  assert.equal(SOC_NEW_JOB_TOUR.length, 4);
  assertTourTargets(view.container, SOC_NEW_JOB_TOUR.map((step) => step.target));
  assert.ok(view.getByRole("button", { name: "แนะนำการใช้งาน" }));
});
