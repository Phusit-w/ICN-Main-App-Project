import { after, afterEach, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import type { SocTourStep } from "@/lib/soc-tours";
import type { SocRunnerView } from "@/lib/soc-shared";

// The /soc page's server data, for the anchor check at the end.
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }) } });
mock.module("next/link", { defaultExport: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props) });
const noop = async () => ({ ok: true });
mock.module("@/actions/soc", { namedExports: {
  trashSocJob: noop, cancelSocRead: noop, renameSocJobAction: noop, resumeSocRead: noop, confirmSocJob: noop, retrySocJob: noop, updateSocResult: noop,
  cancelSocTorRead: noop, resumeSocTorRead: noop, decideSocRow: noop,
} });
mock.module("@/actions/socCheckRequests", { namedExports: {
  cancelSocCheckRequest: noop, continueSocCheckWithoutMissing: noop, requestAllSocChecks: noop, requestSocCheck: noop, resumeSocCheckRequestNow: noop,
  setSocMajorItemSkipped: noop, requestSocTorJudge: noop, requestSocRowRechecks: noop,
} });
mock.module("@/lib/authorization", { namedExports: { requirePageAccess: async () => ({ id: "user-1", role: "USER", appAccess: [] }) } });
// The ค้นหาโครงการ page's data, for its anchor check at the end.
mock.module("@/lib/prisma", { namedExports: { prisma: { projectCard: { findMany: async () => [], groupBy: async () => [], count: async () => 0 } } } });
mock.module("@/actions/projectCard", { namedExports: { updateProjectCardDetails: noop, verifyProjectCardBudget: noop } });
mock.module("@/actions/projectCardQuestion", { namedExports: { askProjectCardQuestion: noop } });
mock.module("@/lib/project-card-terms", { namedExports: { loadTaxonomy: async () => ({ categories: [], workTypes: [] }) } });
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
mock.module("@/lib/soc-waiting-tab", { namedExports: { waitingTab: async () => null } }); // the SOC menu asks who is signed in, for the รอคนรับ tab
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

test("every control the job-list tour points at is on /soc/jobs", async () => {
  const { render } = await setup();
  const { SOC_JOB_LIST_TOUR } = await import("@/lib/soc-tours");
  setWidth(800); // keep the tour itself out of the way
  const { default: SocJobsPage } = await import("@/app/(app)/soc/jobs/page");
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

test("every control the ค้นหาโครงการ tour points at is on /project-card, with the tour's button", async () => {
  const { render } = await setup();
  const { PROJECT_CARD_TOUR } = await import("@/lib/project-card-tours");
  setWidth(800);
  const { default: ProjectCardPage } = await import("@/app/(app)/project-card/page");
  // A filter in use, so its chip (the active-filters step) is on the page too.
  const view = render(await ProjectCardPage({ searchParams: Promise.resolve({ client: "PEA" }) }));
  assert.equal(PROJECT_CARD_TOUR.length, 6);
  assertTourTargets(view.container, PROJECT_CARD_TOUR.map((step) => step.target));
  assert.ok(view.getByRole("button", { name: "แนะนำการใช้งาน" }));
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

const reviewRow = {
  id: "row-1", item: "๑.๑", rowNumber: 4, majorItemId: "major-1", sheet: null, status: "review", reasons: [], evidenceMissing: false,
  torText: "ข้อกำหนด", torImage: false, image: null, socPdfPage: null, referenceNote: null, proposalText: "ข้อเสนอ", bidderRemark: null, reference: "Datasheet, page 4", referencePages: [4],
  citations: [], declaredSelection: "comply", systemRecommendation: "compliant", axes: [], detail: "", keyIssue: null, confidence: "high",
  finalDecision: null, finalNote: null, reviewedByName: null, reviewedAt: null,
};

const majorItem = { id: "major-1", label: "๑", title: "ข้อกำหนดทั่วไป", groupLabel: null, groupTitle: null, large: false, skipped: false, state: "not_checked", skillVersion: null, skillVersionStatus: null, model: null, runSource: null, ranByName: null, hasResults: false, missingDocuments: [], confirmed: false, request: null, failureReason: null };

function jobProps(over: Record<string, unknown> = {}) {
  return {
    id: "job-1", kind: "IMPORTED", title: "งานทดสอบ", status: "READY", stage: "", progress: 0, errorMessage: null, ownerName: "ผู้ตรวจ", canTrash: true, viewerId: "user-1", viewerIsAdmin: false,
    results: [], reviewRows: [reviewRow], documents: [], torMatch: null, majorItems: [majorItem], currentSkillVersion: null, socWarnings: [], excelSoc: false, ...over,
  };
}

test("every control the job tour points at is on an Imported job with results", async () => {
  const { render } = await setup();
  const { SOC_JOB_TOUR } = await import("@/lib/soc-tours");
  const { default: SocJobDetail } = await import("@/components/SocJobDetail");
  setWidth(800);
  const view = render(React.createElement(SocJobDetail, { job: jobProps() as never }));
  assert.equal(SOC_JOB_TOUR.length, 8);
  assertTourTargets(view.container, SOC_JOB_TOUR.map((step) => step.target));
  assert.ok(view.getByRole("button", { name: "แนะนำการใช้งาน" }));
});

test("a job with no review rows has no review targets, and a legacy job has no tour button", async () => {
  const { render, cleanup } = await setup();
  const { default: SocJobDetail } = await import("@/components/SocJobDetail");
  setWidth(800);
  const empty = render(React.createElement(SocJobDetail, { job: jobProps({ reviewRows: [] }) as never }));
  for (const target of ["review-filters", "row-ticks", "expand-workspace"]) assert.equal(empty.container.querySelector(`[data-tour="${target}"]`), null, target);
  assert.ok(empty.container.querySelector('[data-tour="major-items"]'));
  cleanup();
  const legacy = render(React.createElement(SocJobDetail, { job: jobProps({ kind: "LEGACY", majorItems: [], reviewRows: [] }) as never }));
  assert.equal(legacy.queryByRole("button", { name: "แนะนำการใช้งาน" }), null);
  assert.equal(legacy.container.querySelector("[data-tour]"), null);
});

test("the job tour opens on its own once the major items are showing, not while the SOC is still being read", async () => {
  const { render, cleanup, screen } = await setup();
  const { readStoredFlag } = await import("@/components/SocCollapse");
  const { default: SocJobDetail } = await import("@/components/SocJobDetail");
  setWidth(1200);

  render(React.createElement(SocJobDetail, { job: jobProps({ status: "READING" }) as never }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(readStoredFlag("soc:tour-seen:soc-job", false), false, "not marked seen");
  cleanup();

  render(React.createElement(SocJobDetail, { job: jobProps() as never }));
  assert.ok(await screen.findByRole("dialog", { name: "ข้อใหญ่ของ SOC" }));
});

test("a folded major items panel drops the steps inside it", async () => {
  const { render, screen, user, act, within } = await setup();
  const { default: SocJobDetail } = await import("@/components/SocJobDetail");
  const { writeStoredFlag } = await import("@/components/SocCollapse");
  setWidth(800);
  render(React.createElement(SocJobDetail, { job: jobProps() as never }));
  act(() => writeStoredFlag("soc:major-items-open", false));
  await user.click(screen.getByRole("button", { name: "แนะนำการใช้งาน" }));
  const next = async (title: string) => {
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "ถัดไป" }));
    return screen.findByRole("dialog", { name: title });
  };
  await screen.findByRole("dialog", { name: "ข้อใหญ่ของ SOC" });
  await next("ตรวจทั้งชุด");
  await next("เอกสารหลักฐาน"); // ตรวจ / ไม่ต้องตรวจ sits inside the folded table
  act(() => writeStoredFlag("soc:major-items-open", true));
});

const openWorkspace = async (width: number) => {
  (await import("@/components/SocCollapse")).writeStoredFlag("soc:tour-seen:soc-workspace", false); // each test is a first visit
  const testing = await setup();
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  setWidth(width);
  const rows = [reviewRow, { ...reviewRow, id: "row-2", item: "๑.๒", rowNumber: 5 }];
  const view = testing.render(React.createElement(SocReviewPanel, { jobId: "job-1", items: [majorItem] as never, rows: rows as never }));
  await testing.user.click(view.getByRole("button", { name: "ขยายเต็มจอ" }));
  return { ...testing, view, workspace: view.getByRole("dialog", { name: "ตรวจข้อ ๑.๑" }) };
};

test("every control the workspace tour points at is in full screen, next to a replay button", async () => {
  const { SOC_WORKSPACE_TOUR } = await import("@/lib/soc-tours");
  const { workspace, within } = await openWorkspace(800);
  assert.equal(SOC_WORKSPACE_TOUR.length, 5);
  assertTourTargets(workspace, SOC_WORKSPACE_TOUR.map((step) => step.target));
  assert.ok(within(workspace).getByRole("button", { name: "แนะนำการใช้งาน" }));
});

test("the workspace tour opens by itself the first time full screen opens, and only once", async () => {
  const { screen, user, view, workspace, within } = await openWorkspace(1200);
  await user.click(within(await screen.findByRole("dialog", { name: "ข้อกำหนด TOR เทียบกับ SOC" })).getByRole("button", { name: "ปิด" }));
  await user.click(within(workspace).getByRole("button", { name: "ย่อกลับข้างตาราง" }));
  await user.click(view.getByRole("button", { name: "ขยายเต็มจอ" }));
  assert.equal(screen.queryByRole("dialog", { name: "ข้อกำหนด TOR เทียบกับ SOC" }), null);
});

test("with the workspace tour open, Esc closes only the tour and no shortcut acts on the workspace", async () => {
  const { screen, user, view, within } = await openWorkspace(1200);
  await screen.findByRole("dialog", { name: "ข้อกำหนด TOR เทียบกับ SOC" });
  await user.keyboard("1j");
  assert.equal(within(view.getByRole("dialog", { name: "ตรวจข้อ ๑.๑" })).getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true").length, 0, "no decision picked");
  assert.ok(view.getByRole("dialog", { name: "ตรวจข้อ ๑.๑" }), "still on the first row");

  await user.keyboard("{Escape}");
  assert.equal(screen.queryByRole("dialog", { name: "ข้อกำหนด TOR เทียบกับ SOC" }), null, "the tour closed");
  assert.ok(view.getByRole("dialog", { name: "ตรวจข้อ ๑.๑" }), "the workspace is still full screen");

  await user.keyboard("{Escape}");
  assert.equal(view.queryByRole("dialog", { name: "ตรวจข้อ ๑.๑" }), null, "Esc with no tour leaves full screen");
});
