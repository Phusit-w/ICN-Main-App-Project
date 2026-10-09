import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import type { SocReviewRow } from "@/lib/soc-review-view";

mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }) } });
const savedDecisions: unknown[] = [];
mock.module("@/actions/soc", { namedExports: { decideSocRow: async (input: unknown) => { savedDecisions.push(input); } } });
mock.module("@/actions/socCheckRequests", { namedExports: { requestSocRowRechecks: async () => ({ ok: true, requested: 1 }) } });

let dom: JSDOM;

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent,
    MouseEvent: dom.window.MouseEvent, getComputedStyle: dom.window.getComputedStyle,
    CSS: { escape: (value: string) => value },
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
}

const row = (id: string, item: string, page: number): SocReviewRow => ({
  id, item, rowNumber: page, majorItemId: "major-1", status: "review", reasons: ["ควรตรวจหลักฐาน"], evidenceMissing: false,
  torText: `ข้อกำหนด ${item}`, proposalText: `ข้อเสนอ ${item}`, reference: `Datasheet, page ${page}`, referencePages: [page],
  citations: [{ cited: "Datasheet", document: { id: "pdf-1", name: "Datasheet.pdf" }, pages: [page] }],
  declaredSelection: "comply", systemRecommendation: "compliant",
  axes: [{ key: "reference_check", label: "หน้าอ้างอิง", value: "match", ok: true, detail: "ตรง" }],
  detail: `สรุป ${item}`, keyIssue: null, confidence: "high", finalDecision: null, finalNote: null, reviewedByName: null, reviewedAt: null,
});

const rows = [row("row-1", "๑.๑", 4), row("row-2", "๑.๒", 5)];
const items = [{ id: "major-1", label: "๑", state: "checked", missingDocuments: [], confirmed: false }];

before(installDom);
beforeEach(() => { savedDecisions.length = 0; });
afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
after(() => dom.window.close());

const setup = async (jobId = "job-1") => {
  const testing = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  const view = testing.render(React.createElement(SocReviewPanel, { jobId, items, rows }));
  return { ...testing, user, view };
};

test("clicking a SOC row shows its comparison and cited page beside the table", async () => {
  const { screen, within, user } = await setup();
  assert.ok(screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๑" }), "the first row is shown before any click");

  await user.click(screen.getByRole("button", { name: "๑.๒" }));

  const detail = screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๒" });
  assert.ok(within(detail).getByText("ข้อกำหนด ๑.๒"));
  assert.ok(within(detail).getByText("ข้อเสนอ ๑.๒"));
  assert.equal(within(detail).getByRole("img", { name: "Datasheet.pdf หน้า 5" }).getAttribute("src"), "/api/soc/jobs/job-1/evidence/pdf-1/pages/5");
  assert.equal(screen.queryByRole("dialog"), null);
});

test("the row opens full screen with comparison/evidence panes and PDF zoom, and keeps an unsaved decision", async () => {
  const { screen, within, user } = await setup();
  await user.click(screen.getByRole("button", { name: "๑.๑" }));
  await user.click(screen.getByRole("radio", { name: /ไม่ผ่าน/ }));
  await user.click(screen.getByRole("button", { name: "ขยายเต็มจอ" }));

  const workspace = screen.getByRole("dialog", { name: "ตรวจข้อ ๑.๑" });
  assert.equal(document.body.style.overflow, "hidden");
  assert.ok(within(workspace).getByRole("region", { name: "รายละเอียดเทียบ" }));
  assert.equal(within(workspace).getByRole("radio", { name: /ไม่ผ่าน/ }).getAttribute("aria-checked"), "true");
  const evidence = within(workspace).getByRole("region", { name: "เอกสารอ้างอิง" });
  const image = within(evidence).getByRole("img", { name: "Datasheet.pdf หน้า 4" });
  await user.click(within(evidence).getByRole("button", { name: "ขยายเอกสาร" }));
  assert.equal(image.getAttribute("data-zoom"), "125");
  await user.click(within(evidence).getByRole("button", { name: "พอดีความกว้าง" }));
  assert.equal(image.getAttribute("data-zoom"), "fit");
  assert.ok(within(workspace).getByRole("tab", { name: "เอกสารอ้างอิง" }));
});

test("unsaved decisions are protected when moving rows and can be saved before continuing", async () => {
  const { screen, within, user } = await setup();
  await user.click(screen.getByRole("button", { name: "๑.๑" }));
  await user.click(screen.getByRole("radio", { name: /ผ่าน \(Comply\)/ }));
  await user.click(screen.getByRole("button", { name: "ข้อถัดไป" }));

  const warning = screen.getByRole("alertdialog", { name: "มีข้อมูลที่ยังไม่ได้บันทึก" });
  await user.click(within(warning).getByRole("button", { name: "บันทึกแล้วไปต่อ" }));

  assert.deepEqual(savedDecisions, [{ jobId: "job-1", resultId: "row-1", decision: "compliant", note: "" }]);
  assert.ok(screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๒" }));
});

test("leaving full screen returns focus to the expand button and unlocks page scrolling", async () => {
  const { screen, waitFor, user } = await setup();
  await user.click(screen.getByRole("button", { name: "ขยายเต็มจอ" }));
  await user.keyboard("{Escape}");

  assert.equal(screen.queryByRole("dialog"), null);
  await waitFor(() => assert.equal(document.activeElement, screen.getByRole("button", { name: "ขยายเต็มจอ" })));
  assert.equal(document.body.style.overflow, "");
});

test("the extra filters sit behind one button, show as removable chips, and reset clears everything", async () => {
  const { screen, user } = await setup();
  const reset = () => screen.getAllByRole("button", { name: "↺ ล้างตัวกรอง" })[0];
  assert.equal(reset().hasAttribute("disabled"), true);

  await user.click(screen.getByRole("button", { name: /^ตัวกรอง/ }));
  await user.click(screen.getByRole("checkbox", { name: "เฉพาะแถวที่หาเอกสารไม่เจอ" }));
  assert.ok(screen.getByRole("button", { name: "เอาตัวกรอง หาเอกสารไม่เจอ ออก" }));
  assert.ok(screen.getByText("ไม่พบรายการในตัวกรองนี้"));

  await user.click(screen.getByRole("button", { name: "ข้อ" }));
  await user.click(reset());
  assert.ok(screen.getByRole("button", { name: "๑.๑" }));
  assert.equal(screen.queryByRole("button", { name: "เอาตัวกรอง หาเอกสารไม่เจอ ออก" }), null);
  assert.equal(screen.getByRole("button", { name: "สถานะ" }).getAttribute("aria-pressed"), "true");
  assert.equal(reset().hasAttribute("disabled"), true);
});

test("a folded major-item group stays folded after the page is opened again", async () => {
  const { screen, user, view } = await setup("job-fold");
  await user.click(screen.getByRole("button", { name: "ข้อ" }));
  await user.click(screen.getByRole("button", { name: /ข้อใหญ่ ๑/ }));
  assert.equal(screen.queryByRole("button", { name: "๑.๑" }), null);
  view.unmount();

  const again = await setup("job-fold");
  await again.user.click(again.screen.getByRole("button", { name: "ข้อ" }));
  assert.equal(again.screen.getByRole("button", { name: /ข้อใหญ่ ๑/ }).getAttribute("aria-expanded"), "false");
  assert.equal(again.screen.queryByRole("button", { name: "๑.๑" }), null);
});
