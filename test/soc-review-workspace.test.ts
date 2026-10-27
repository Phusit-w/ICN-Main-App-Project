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
  // Narrow: the full-screen workspace's tour (soc-guided-tour.test.ts) doesn't open by itself over these tests.
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 800 });
}

const row = (id: string, item: string, page: number): SocReviewRow => ({
  id, item, rowNumber: page, majorItemId: "major-1", sheet: null, status: "review", reasons: ["ควรตรวจหลักฐาน"], evidenceMissing: false,
  torText: `ข้อกำหนด ${item}`, torImage: false, image: null, socPdfPage: null, referenceNote: null, proposalText: `ข้อเสนอ ${item}`, bidderRemark: null, reference: `Datasheet, page ${page}`, referencePages: [page],
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

const setup = async (jobId = "job-1", shown = rows) => {
  const testing = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const { default: SocReviewPanel } = await import("@/components/SocReviewPanel");
  const view = testing.render(React.createElement(SocReviewPanel, { jobId, items, rows: shown }));
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

test("a row's Bidder Remark shows under the offer as หมายเหตุผู้เสนอ; a row without one shows nothing extra", async () => {
  const withRemark: SocReviewRow = { ...row("row-3", "๑.๓", 6), bidderRemark: "max. 96 fibers" };
  const { screen, within, user } = await setup("job-1", [...rows, withRemark]);

  assert.equal(within(screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๑" })).queryByText("หมายเหตุผู้เสนอ"), null);

  await user.click(screen.getByRole("button", { name: "๑.๓" }));
  const detail = screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๓" });
  const remark = within(detail).getByText("หมายเหตุผู้เสนอ").parentElement!;
  assert.ok(within(remark).getByText("max. 96 fibers"));
  const offer = within(detail).getByText("ข้อเสนอของผู้ยื่น").parentElement!;
  assert.ok(offer.compareDocumentPosition(remark) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, "the remark comes after the offer");
});

test("an Image Row shows the image of its TOR cell in place of the text, beside the table and full screen", async () => {
  // An Image Row carries the item number of the row above it.
  const imageRow = { ...row("row-3", "๑.๒", 7), torText: "", torImage: true };
  const { screen, within, user } = await setup("job-1", [...rows, imageRow]);
  assert.ok(screen.getByText("รูป"), "the table marks the row");
  await user.click(screen.getAllByRole("button", { name: "๑.๒" })[1]);

  const detail = screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๒" });
  const image = within(detail).getByRole("img", { name: "รูปข้อกำหนด TOR ข้อ ๑.๒ แถว 7" });
  assert.equal(image.getAttribute("src"), "/api/soc/jobs/job-1/soc-rows/7/image?item=%E0%B9%91.%E0%B9%92");
  assert.equal(within(detail).queryByText("ไม่พบข้อความในไฟล์ SOC"), null);
  assert.ok(within(detail).getByText("ข้อเสนอ ๑.๒"));

  await user.click(screen.getByRole("button", { name: "ขยายเต็มจอ" }));
  assert.ok(within(screen.getByRole("dialog", { name: "ตรวจข้อ ๑.๒" })).getByRole("img", { name: "รูปข้อกำหนด TOR ข้อ ๑.๒ แถว 7" }));
});

test("a PDF SOC row shows its page of the PDF SOC on a button press; a row without a page shows no button", async () => {
  const pdfRow = { ...row("row-3", "๑.๓", 7), socPdfPage: 2 };
  const { screen, within, user } = await setup("job-1", [...rows, pdfRow]);
  assert.equal(within(screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๑" })).queryByRole("button", { name: /ดูหน้า PDF SOC/ }), null);

  await user.click(screen.getByRole("button", { name: "๑.๓" }));
  const detail = screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๓" });
  assert.equal(within(detail).queryByRole("img", { name: "PDF SOC หน้า 2" }), null, "shown only when asked");
  await user.click(within(detail).getByRole("button", { name: "ดูหน้า PDF SOC (หน้า 2)" }));
  assert.equal(within(detail).getByRole("img", { name: "PDF SOC หน้า 2" }).getAttribute("src"), "/api/soc/jobs/job-1/soc-rows/7/pdf-page?item=%E0%B9%91.%E0%B9%93");
  await user.click(within(detail).getByRole("button", { name: "ซ่อนหน้า PDF SOC" }));
  assert.equal(within(detail).queryByRole("img", { name: "PDF SOC หน้า 2" }), null);
});

test("an Image Row shows what Claude read from the image and its notes; a picture shows no verdict and still takes a decision", async () => {
  const mixed: SocReviewRow = {
    ...row("row-3", "๑.๒", 7), torText: "", torImage: true, referenceNote: "ใช้อ้างอิงของข้อ ๑.๒",
    image: { kind: "mixed_image", label: "อ่านจากรูป", reading: "ขนาด: 290 มม.\nรู: [?] มม.", unsure: "ขนาดรูอ่านไม่ชัด", note: "ตรวจเฉพาะค่าที่พิมพ์ในรูป ไม่ได้เทียบรูปวาดกับหลักฐาน" },
  };
  const picture: SocReviewRow = {
    ...row("row-4", "๑.๓", 8), torText: "", torImage: true, systemRecommendation: null, declaredSelection: null, detail: "", reasons: ["รูปที่ต้องดูเอง: Claude ไม่ตัดสินแถวนี้"],
    image: { kind: "picture", label: "รูปที่ต้องดูเอง", reading: "ตัวอย่างสัญลักษณ์บนฝาตู้", unsure: null, note: null },
  };
  const { screen, within, user } = await setup("job-1", [...rows, mixed, picture]);

  await user.click(screen.getAllByRole("button", { name: "๑.๒" })[1]); // the Image Row, under the text row ๑.๒
  let detail = screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๒" });
  assert.ok(within(detail).getByText("อ่านจากรูป"));
  const reading = within(detail).getByRole("region", { name: "ข้อความที่อ่านจากรูป" });
  assert.equal(within(reading).getByText(/ขนาด: 290 มม\./).textContent, "ขนาด: 290 มม.\nรู: [?] มม.");
  assert.equal(within(detail).queryByRole("textbox", { name: /อ่านจากรูป/ }), null, "the reading is read-only");
  assert.ok(within(detail).getByText("ขนาดรูอ่านไม่ชัด"));
  assert.ok(within(detail).getByText("ตรวจเฉพาะค่าที่พิมพ์ในรูป ไม่ได้เทียบรูปวาดกับหลักฐาน"));
  assert.ok(within(detail).getByText("ช่องอ้างอิงของแถวนี้ว่าง ใช้อ้างอิงของข้อ ๑.๒"));

  // The table shows what was read, after the "รูป" chip.
  assert.ok(screen.getByRole("button", { name: "๑.๓" }).closest("tr")!.textContent!.includes("รูปตัวอย่างสัญลักษณ์บนฝาตู้"));
  await user.click(screen.getByRole("button", { name: "๑.๓" }));
  detail = screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๓" });
  assert.ok(within(detail).getByText("รูปที่ต้องดูเอง: Claude ไม่ตัดสินแถวนี้"));
  assert.equal(within(detail).queryByText(/ระบบแนะนำ/), null);
  assert.equal(within(detail).queryByText(/รายละเอียดทุกแกน/), null, "no axes to show");
  assert.ok(within(detail).getByText("ตัวอย่างสัญลักษณ์บนฝาตู้"));
  assert.ok(within(detail).getByRole("img", { name: "Datasheet.pdf หน้า 8" }), "the cited evidence page beside the image");
  await user.click(within(detail).getByRole("radio", { name: /ผ่าน \(Comply\)/ }));
  assert.equal(within(detail).getByRole("radio", { name: /ผ่าน \(Comply\)/ }).getAttribute("aria-checked"), "true");
});

test("a text image shows its reading with the verdict and axes of any checked row, and no drawing note", async () => {
  const textImage: SocReviewRow = {
    ...row("row-3", "๑.๒", 7), torText: "", torImage: true,
    image: { kind: "text_image", label: "อ่านจากรูป", reading: "แรงดัน: 24 kV", unsure: null, note: null },
  };
  const { screen, within, user } = await setup("job-1", [...rows, textImage]);
  await user.click(screen.getAllByRole("button", { name: "๑.๒" })[1]);

  const detail = screen.getByRole("complementary", { name: "รายละเอียดข้อ ๑.๒" });
  assert.ok(within(detail).getByText("อ่านจากรูป"));
  assert.ok(within(within(detail).getByRole("region", { name: "ข้อความที่อ่านจากรูป" })).getByText("แรงดัน: 24 kV"));
  assert.ok(within(detail).getByText(/รายละเอียดทุกแกน/));
  assert.equal(within(detail).queryByText(/ไม่แน่ใจ/), null);
  assert.equal(within(detail).queryByText(/ไม่ได้เทียบรูปวาด/), null);
  assert.equal(within(detail).queryByText(/Claude ไม่ตัดสินแถวนี้/), null);
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
  // The reset button shows only while a filter or sort is changed.
  const reset = () => screen.queryByRole("button", { name: "↺ ล้าง" });
  assert.equal(reset(), null);

  await user.click(screen.getByRole("button", { name: /^ตัวกรอง/ }));
  await user.click(screen.getByRole("checkbox", { name: "เฉพาะแถวที่หาเอกสารไม่เจอ" }));
  assert.ok(screen.getByRole("button", { name: "เอาตัวกรอง หาเอกสารไม่เจอ ออก" }));
  assert.ok(screen.getByText("ไม่พบรายการในตัวกรองนี้"));

  await user.click(screen.getByRole("button", { name: "ข้อ" }));
  await user.click(reset()!);
  assert.ok(screen.getByRole("button", { name: "๑.๑" }));
  assert.equal(screen.queryByRole("button", { name: "เอาตัวกรอง หาเอกสารไม่เจอ ออก" }), null);
  assert.equal(screen.getByRole("button", { name: "สถานะ" }).getAttribute("aria-pressed"), "true");
  assert.equal(reset(), null);
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
