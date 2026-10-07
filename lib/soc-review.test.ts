// The review page's overall row status, ordering and filters (ticket 08),
// with the rule agreed in ticket 07. Driven with the real full-mode Sonnet
// run on SOC_Demo, whose expected statuses were checked by hand in 07.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterReviewRows, citedEvidence, majorItemConfirmed, overallRowStatus, parseReferencePages, sortReviewRows, type SocAxisValues } from "@/lib/soc-review";

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
