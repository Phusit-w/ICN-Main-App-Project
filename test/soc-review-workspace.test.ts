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

test("the workspace exposes comparison/evidence panes and readable PDF zoom controls", async () => {
  const { render, screen, within } = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  render(React.createElement(SocReviewPanel, { jobId: "job-1", items, rows }));
  await user.click(screen.getByRole("button", { name: "๑.๑" }));

  const workspace = screen.getByRole("dialog", { name: "ตรวจข้อ ๑.๑" });
  assert.ok(within(workspace).getByRole("region", { name: "รายละเอียดเทียบ" }));
  const evidence = within(workspace).getByRole("region", { name: "เอกสารอ้างอิง" });
  const image = within(evidence).getByRole("img", { name: "Datasheet.pdf หน้า 4" });
  await user.click(within(evidence).getByRole("button", { name: "ขยายเอกสาร" }));
  assert.equal(image.getAttribute("data-zoom"), "125");
  await user.click(within(evidence).getByRole("button", { name: "พอดีความกว้าง" }));
  assert.equal(image.getAttribute("data-zoom"), "fit");
  assert.ok(within(workspace).getByRole("tab", { name: "รายละเอียดเทียบ" }));
  assert.ok(within(workspace).getByRole("tab", { name: "เอกสารอ้างอิง" }));
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

test("clicking a SOC row opens its comparison and cited page in a full-screen review workspace", async () => {
  const { render, screen, within } = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  render(React.createElement(SocReviewPanel, { jobId: "job-1", items, rows }));

  await user.click(screen.getByRole("button", { name: "๑.๒" }));

  const workspace = screen.getByRole("dialog", { name: "ตรวจข้อ ๑.๒" });
  assert.ok(within(workspace).getByText("ข้อกำหนด ๑.๒"));
  assert.ok(within(workspace).getByText("ข้อเสนอ ๑.๒"));
  assert.equal(within(workspace).getByRole("img", { name: "Datasheet.pdf หน้า 5" }).getAttribute("src"), "/api/soc/jobs/job-1/evidence/pdf-1/pages/5");
  assert.equal(document.body.style.overflow, "hidden");
});

test("unsaved decisions are protected when moving rows and can be saved before continuing", async () => {
  const { render, screen, within } = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  render(React.createElement(SocReviewPanel, { jobId: "job-1", items, rows }));
  await user.click(screen.getByRole("button", { name: "๑.๑" }));
  await user.click(screen.getByRole("radio", { name: /ผ่าน \(Comply\)/ }));
  await user.click(screen.getByRole("button", { name: /ข้อถัดไป/ }));

  const warning = screen.getByRole("alertdialog", { name: "มีข้อมูลที่ยังไม่ได้บันทึก" });
  await user.click(within(warning).getByRole("button", { name: "บันทึกแล้วไปต่อ" }));

  assert.deepEqual(savedDecisions, [{ jobId: "job-1", resultId: "row-1", decision: "compliant", note: "" }]);
  assert.ok(screen.getByRole("dialog", { name: "ตรวจข้อ ๑.๒" }));
});

test("closing the workspace restores focus to the row and unlocks page scrolling", async () => {
  const { fireEvent, render, screen, waitFor } = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  render(React.createElement(SocReviewPanel, { jobId: "job-1", items, rows }));
  const opener = screen.getByRole("button", { name: "๑.๒" });
  await user.click(opener);
  fireEvent.click(screen.getByRole("button", { name: "ปิดพื้นที่ตรวจ" }));

  assert.equal(screen.queryByRole("dialog", { name: "ตรวจข้อ ๑.๒" }), null);
  await waitFor(() => assert.ok(document.activeElement === opener, `focus returned to ${document.activeElement?.tagName ?? "nothing"}`));
  assert.equal(document.body.style.overflow, "");
});

test("a folded major-item group stays folded after the page is opened again", async () => {
  const { render, screen } = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  const first = render(React.createElement(SocReviewPanel, { jobId: "job-fold", items, rows }));
  await user.selectOptions(screen.getByRole("combobox", { name: "เรียง" }), "item");
  await user.click(screen.getByRole("button", { name: /ข้อใหญ่ ๑/ }));
  assert.equal(screen.queryByRole("button", { name: "๑.๑" }), null);
  first.unmount();

  render(React.createElement(SocReviewPanel, { jobId: "job-fold", items, rows }));
  await user.selectOptions(screen.getByRole("combobox", { name: "เรียง" }), "item");
  assert.equal(screen.getByRole("button", { name: /ข้อใหญ่ ๑/ }).getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByRole("button", { name: "๑.๑" }), null);
});
