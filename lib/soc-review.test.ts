// The review page's overall row status, ordering and filters (ticket 08),
// with the rule agreed in ticket 07. Driven with the real full-mode Sonnet
// run on SOC_Demo, whose expected statuses were checked by hand in 07.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterReviewRows, citedEvidence, declaredSelection, evidenceMissing, isSettledDecision, majorItemConfirmed, nextRowToReview, overallRowStatus, parseReferencePages, SOC_FINAL_DECISION_LABELS, socAxisValueLabel, sortReviewRows, type SocAxisValues, type SocReviewFilter } from "@/lib/soc-review";

type FixtureRow = SocAxisValues & { row: number; item: string; row_type: string };
const RUN = JSON.parse(readFileSync(new URL("../test/fixtures/soc/results_sonnet.json", import.meta.url), "utf8")) as { results: FixtureRow[] };

const status = (item: string) => {
  const row = RUN.results.find((r) => r.item === item)!;
  return overallRowStatus(row.row_type, row);
};

test("SOC-Demo gives ❌ 1, ⚠️ 5 and ✅ 6, with no status on the heading row", () => {
  const byStatus: Record<string, string[]> = {};
  for (const row of RUN.results) (byStatus[overallRowStatus(row.row_type, row).status] ??= []).push(row.item);
  assert.deepEqual(byStatus, {
    heading: ["๑."],
    ok: ["๑.๑.๑", "๑.๑.๕", "๑.๑.๙", "๑.๒.๓", "๑.๓.๑", "๓.๒"],
    review: ["๑.๑", "๒.๑", "๒.๒", "๔.๓.๓", "4.8.2.6"],
    fail: ["๓.๓.๑"],
  });
});

test("the failing axes are the reasons, with Thai labels and values", () => {
  assert.deepEqual(status("๑.๑").reasons, ["การเน้นสี (Highlight): ไม่พบ"]);
  assert.deepEqual(status("๓.๓.๑").reasons, [
    "การเน้นสี (Highlight): บางส่วน",
    "หลักฐานรองรับ TOR: ถ้อยคำขัดกัน",
    "ผลเทียบเกณฑ์ TOR: ไม่ผ่าน",
    "ช่องที่ผู้ยื่นติ๊ก ตรงกับผล: ไม่ตรง",
  ]);
  assert.deepEqual(status("๑.๑.๑").reasons, []);
});

test("each ❌ condition fails a row on its own", () => {
  const ok: SocAxisValues = { reference_check: "match", evidence_support: "fully_supported", tor_decision: "compliant" };
  assert.equal(overallRowStatus("content_row", ok).status, "ok");
  assert.equal(overallRowStatus("content_row", { ...ok, tor_decision: "non_compliant" }).status, "fail");
  assert.equal(overallRowStatus("content_row", { ...ok, evidence_support: "not_supported" }).status, "fail");
  assert.equal(overallRowStatus("content_row", { ...ok, evidence_support: "wording_conflict" }).status, "fail");
  assert.equal(overallRowStatus("content_row", { ...ok, product_identity: "mismatch" }).status, "fail");
  assert.equal(overallRowStatus("content_row", { ...ok, evidence_support: "partially_supported" }).status, "review");
  assert.equal(overallRowStatus("content_row", { ...ok, tor_decision: "better" }).status, "ok");
});

test("a partial_visible highlight passes, with its Thai label", () => {
  const row: SocAxisValues = { reference_check: "match", highlight_check: "partial_visible", evidence_support: "fully_supported", tor_decision: "compliant" };
  assert.deepEqual(overallRowStatus("content_row", row), { status: "ok", reasons: [] });
  assert.equal(socAxisValueLabel("partial_visible"), "ครบตามที่เห็นในหน้า (บางคำไม่ได้ highlight)");
});

test("a missing or blank axis counts as not applicable", () => {
  assert.deepEqual(overallRowStatus("content_row", {}), { status: "ok", reasons: [] });
  assert.deepEqual(overallRowStatus("content_row", { heading_title_check: "", item_label_check: null }), { status: "ok", reasons: [] });
  assert.equal(overallRowStatus("system_heading_row", { tor_decision: "non_compliant" }).status, "heading");
});

test("problem rows come first, then by row number; heading rows aren't listed; both filters apply", () => {
  const rows = RUN.results.map((r) => ({ rowNumber: r.row, item: r.item, majorItemId: r.item.startsWith("๑") ? "m1" : "m2", ...overallRowStatus(r.row_type, r) }));
  const sorted = sortReviewRows(rows);
  assert.deepEqual(filterReviewRows(sorted, { status: "all", majorItemId: "all" }).map((r) => r.item), ["๓.๓.๑", "๑.๑", "๒.๑", "๒.๒", "๔.๓.๓", "4.8.2.6", "๑.๑.๑", "๑.๑.๕", "๑.๑.๙", "๑.๒.๓", "๑.๓.๑", "๓.๒"]);
  assert.deepEqual(filterReviewRows(sorted, { status: "review", majorItemId: "all" }).map((r) => r.item), ["๑.๑", "๒.๑", "๒.๒", "๔.๓.๓", "4.8.2.6"]);
  assert.deepEqual(filterReviewRows(sorted, { status: "all", majorItemId: "m1" }).map((r) => r.item), ["๑.๑", "๑.๑.๑", "๑.๑.๕", "๑.๑.๙", "๑.๒.๓", "๑.๓.๑"]);
  assert.deepEqual(filterReviewRows(sorted, { status: "ok", majorItemId: "m2" }).map((r) => r.item), ["๓.๒"]);
});

test("page numbers are read from the reference text", () => {
  assert.deepEqual(parseReferencePages("Datasheet Demo, page 1"), [1]);
  assert.deepEqual(parseReferencePages("Datasheet Demo, pages 4, 5\n"), [4, 5]);
  assert.deepEqual(parseReferencePages("CASRI Product Brochure หน้า ๑๓, ๑๔"), [13, 14]);
  assert.deepEqual(parseReferencePages("page 13, 14 และ p. 20"), [13, 14, 20]);
  assert.deepEqual(parseReferencePages("หน้า 3-5"), [3, 4, 5]);
  assert.deepEqual(parseReferencePages("ระบบเฝ้าระวังพื้นที่ขนาดใหญ่"), []);
  assert.deepEqual(parseReferencePages(""), []);
});

test("a major item is confirmed when every row that needs a decision has one", () => {
  assert.equal(majorItemConfirmed([]), false);
  assert.equal(majorItemConfirmed([{ rowType: "section_heading_row", decided: false }, { rowType: "content_row", decided: true }]), true);
  assert.equal(majorItemConfirmed([{ rowType: "content_row", decided: true }, { rowType: "content_row", decided: false }]), false);
  assert.equal(majorItemConfirmed([{ rowType: "section_heading_row", decided: false }]), false);
});

test("a reference is matched to the evidence PDFs it names, with their pages", () => {
  const docs = [{ id: "d1", name: "Datasheet_Demo.pdf" }, { id: "d2", name: "CASRI Product Brochure v2.PDF" }, { id: "d3", name: "Landing page brochure.pdf" }];
  const match = (reference: string, documents = docs) => citedEvidence(reference, documents).map((c) => [c.document?.id ?? null, c.pages]);
  assert.deepEqual(match("Datasheet Demo, pages 4, 5"), [["d1", [4, 5]]]);
  assert.deepEqual(match("datasheet-demo หน้า ๒"), [["d1", [2]]]);
  assert.deepEqual(match("CASRI Product Brochure หน้า ๑๓, ๑๔"), [["d2", [13, 14]]], "the file name may add a version");
  assert.deepEqual(match("Landing page brochure, page 3"), [["d3", [3]]], "'page' in a file name isn't a page marker");
  assert.deepEqual(match("Datasheet Demo Annex, page 1"), [[null, [1]]], "a longer cited name never falls back to a shorter file");
  assert.deepEqual(match("Installation Guide, page 3"), [[null, [3]]]);
  assert.deepEqual(match(""), []);
  assert.deepEqual(match("Datasheet, page 2", [{ id: "a", name: "Datasheet A.pdf" }, { id: "b", name: "Datasheet B.pdf" }]), [[null, [2]]], "several fit");
  assert.deepEqual(match("Datasheet Demo p.4; CASRI Product Brochure p.2"), [["d1", [4]], ["d2", [2]]], "two documents");
  assert.deepEqual(match("Datasheet Demo, page 4\npage 6"), [["d1", [4, 6]]], "a part without a name continues the previous document");
});

test("an evidence PDF uploaded with its folder still matches by its file name", () => {
  const documents = [{ id: "tc22", name: "บทที่ 2/2.5 เครื่องอ่าน/1.เครื่อง/tc22 spec sheet.pdf" }, { id: "other", name: "2.6 Reader/omnikey.pdf" }];
  assert.deepEqual(citedEvidence("tc22 spec sheet หน้า 3", documents).map((c) => [c.document?.id ?? null, c.pages]), [["tc22", [3]]]);
});

test("a reference that names a folder shows the file the skill checked in it, else its only file, else lets the reviewer pick", () => {
  // MOF_RFID: the SOC cites "เอกสารส่วนที่ 2 2.5 … หน้า 3"; folder 2.5 holds TC22 and RFD40.
  const documents = [
    { id: "tc22", name: "บทที่ 2/2.5 เครื่องอ่านสัญญาณ RFID แบบพกพา/1.เครื่องอ่านแบบคอมพิวเตอร์พกพา/tc22-tc27-spec-sheet-en-us.pdf" },
    { id: "rfd40", name: "บทที่ 2/2.5 เครื่องอ่านสัญญาณ RFID แบบพกพา/2.อุปกรณ์เสริมสำหรับอ่าน RFID/rfd40-premium-series-spec-sheet-en-us (1).pdf" },
    { id: "ams", name: "บทที่ 2/2.8 ซอฟต์แวร์การจัดการ/AMS WinApp_R4_for Asset RFID+SQL.pdf" },
    { id: "zebra", name: "บทที่ 3/ZPL2600054 Zebra Business Letter.pdf" },
  ];
  const cite25 = "เอกสารส่วนที่ 2 2.5 เครื่องอ่านสัญญาณ RFID แบบพกพา (Mobile Computer with RFID Reader) หน้า 3";
  const brief = (reference: string, file?: string | null) => citedEvidence(reference, documents, file).map((c) => [c.document?.id ?? null, c.pages, c.via ?? null, c.folderFiles?.map((d) => d.id) ?? null]);

  assert.deepEqual(brief(cite25, "tc22-tc27-spec-sheet-en-us.pdf"), [["tc22", [3], "reference_file", null]]);
  assert.equal(citedEvidence(cite25, documents, "tc22-tc27-spec-sheet-en-us.pdf")[0].folder, "2.5 เครื่องอ่านสัญญาณ RFID แบบพกพา");
  assert.deepEqual(brief(cite25, "inputs/2.5 x/2.อุปกรณ์เสริม/rfd40-premium-series-spec-sheet-en-us (1).pdf"), [["rfd40", [3], "reference_file", null]], "a path in reference_file still matches by its file name");
  assert.deepEqual(brief(cite25), [[null, [3], null, ["tc22", "rfd40"]]], "two files and no checked file: the reviewer picks");
  assert.deepEqual(brief(cite25, "ZPL2600054 Zebra Business Letter.pdf"), [[null, [3], null, ["tc22", "rfd40"]]], "never a file outside the cited folder");
  assert.deepEqual(brief("เอกสารส่วนที่ 2 ๒.๘ ซอฟต์แวร์การจัดการ หน้า ๓๑"), [["ams", [31], "only_file", null]], "Thai digits; the folder's only PDF");
  assert.deepEqual(brief("เอกสารส่วนที่ 2 2.9 อื่นๆ หน้า 1"), [[null, [1], null, null]], "no folder with that number");
  assert.deepEqual(brief("tc22-tc27-spec-sheet-en-us หน้า 2", "rfd40-premium-series-spec-sheet-en-us (1).pdf"), [["tc22", [2], null, null]], "a cited file name wins over reference_file");
});

test("a SOC with no Comply/Better tick box shows no ticked value: not_selected whose check doesn't apply", () => {
  assert.equal(declaredSelection("not_selected", "not_applicable"), null);
  assert.equal(declaredSelection(null, null), null);
  assert.equal(declaredSelection("not_selected", "not_selected"), "not_selected"); // a tick box left empty
  assert.equal(declaredSelection("better", "mismatch"), "better");
});

test("rows can be listed in SOC order instead of problems first", () => {
  const rows = [{ rowNumber: 3, status: "ok" as const }, { rowNumber: 1, status: "review" as const }, { rowNumber: 2, status: "fail" as const }];
  assert.deepEqual(sortReviewRows(rows).map((r) => r.rowNumber), [2, 1, 3]);
  assert.deepEqual(sortReviewRows(rows, "item").map((r) => r.rowNumber), [1, 2, 3]);
});

test("rows can be filtered by Final Decision and by evidence not found", () => {
  const rows = [
    { id: "a", status: "ok" as const, majorItemId: "m1", finalDecision: "compliant", evidenceMissing: false },
    { id: "b", status: "review" as const, majorItemId: "m1", finalDecision: "pending_fix", evidenceMissing: true },
    { id: "c", status: "review" as const, majorItemId: "m1", finalDecision: null, evidenceMissing: true },
  ];
  const ids = (filter: Partial<SocReviewFilter>) => filterReviewRows(rows, { status: "all", majorItemId: "all", ...filter }).map((r) => r.id);
  assert.deepEqual(ids({ decision: "undecided" }), ["c"]);
  assert.deepEqual(ids({ decision: "pending_fix" }), ["b"]);
  assert.deepEqual(ids({ evidenceMissing: true }), ["b", "c"]);
  assert.deepEqual(ids({}), ["a", "b", "c"]);
});

test("รอแก้ไข is a Final Decision that doesn't settle the row", () => {
  assert.equal(SOC_FINAL_DECISION_LABELS.pending_fix, "รอแก้ไข");
  assert.equal(isSettledDecision("pending_fix"), false);
  assert.equal(isSettledDecision(null), false);
  assert.equal(isSettledDecision("non_compliant"), true);
});

test("a row whose cited page or document wasn't found or can't be read is flagged", () => {
  assert.equal(evidenceMissing({ reference_check: "not_found" }), true);
  assert.equal(evidenceMissing({ reference_check: "unverifiable" }), true);
  assert.equal(evidenceMissing({ reference_check: "match", evidence_support: "unverifiable" }), true);
  assert.equal(evidenceMissing({ reference_check: "mismatch", evidence_support: "not_supported" }), false);
  assert.equal(evidenceMissing({}), false);
});

test("after a decision the next row is the next unsettled one in the list, including รอแก้ไข", () => {
  const rows = [{ id: "a", finalDecision: null }, { id: "b", finalDecision: "compliant" }, { id: "c", finalDecision: null }, { id: "d", finalDecision: "pending_fix" }];
  assert.equal(nextRowToReview(rows, "a")?.id, "c");
  assert.equal(nextRowToReview(rows, "c")?.id, "d");
  assert.equal(nextRowToReview(rows, "d")?.id, "a");
  assert.equal(nextRowToReview(rows, "b")?.id, "c");
  assert.equal(nextRowToReview(rows, "gone")?.id, "a");
  assert.equal(nextRowToReview([{ id: "a", finalDecision: null }, { id: "b", finalDecision: "better" }], "a"), null);
});
