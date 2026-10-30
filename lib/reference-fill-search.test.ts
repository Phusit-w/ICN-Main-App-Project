// กรอกอ้างอิง code step (proposal-build 08), seam C: a fixture Word / Excel SOC
// read by the SOC table reader and fixture Datasheet PDFs read by
// readDatasheetPages; label match, spec-value match, title-only rows,
// full references, headings, ไม่ต้องตรวจ items and ไม่พบ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSocDocx } from "@/test/docx-fixture";
import { buildTablePdf } from "@/test/pdf-table-fixture";
import { buildXlsx } from "@/test/xlsx-fixture";
import { readDatasheetPages, suggestReferences, type Datasheet } from "@/lib/reference-fill-search";
import { readSocTable } from "@/lib/soc-table";

const pdf = (pages: string[][]) => buildTablePdf(pages.map((lines) => ({ columns: [], rows: [], lines: lines.map((text) => ({ text })) })));

const CAMERA = pdf([
  ["Camera overview"],
  ["5.1 Resolution 3840 x 2160 pixels 4K sensor", "Lens f/1.8"],
  ["Accessories"],
  ["Max 1920 x 1080 resolution mode"],
]);
const POWER = pdf([
  ["Table 1920 x 1080 resolution output"],
  ["Notes"],
  ["Input voltage 220 V 50 Hz power supply", "Fan"],
]);
const datasheets = (): Datasheet[] => [
  { id: "camera", name: "บทที่ 2/Camera Datasheet.pdf", pages: readDatasheetPages(CAMERA) },
  { id: "power", name: "บทที่ 2/Power Supply Datasheet.pdf", pages: readDatasheetPages(POWER) },
];

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"];
const ROWS = [
  ["5", "ระบบกล้อง", "", ""],
  ["5.1", "กล้องความละเอียด 4K ไม่น้อยกว่า 3840 x 2160 pixels", "", ""],
  ["5.2", "Power supply 220 V 50 Hz input voltage", "", ""],
  ["5.3", "ฟีเจอร์ที่ไม่มีใน Datasheet ใดเลย", "", ""],
  ["5.4", "รองรับ 1920 x 1080 resolution", "", "Camera Datasheet"],
  ["5.5", "กล้อง 2 ช่อง", "", "Camera Datasheet หน้า 7"],
  ["5.6", "ต้องมีพัดลมระบายความร้อน", "", "Lens Datasheet"],
];

test("Datasheet pages are read as PDF pages, page 1 first", () => {
  const pages = readDatasheetPages(CAMERA);
  assert.equal(pages.length, 4);
  assert.match(pages[1], /5\.1 Resolution/);
  assert.deepEqual(readDatasheetPages(new Uint8Array([1, 2, 3])), []);
});

test("a Word SOC: label match, spec-value match, title-only row, full reference, heading and ไม่พบ", () => {
  const table = readSocTable(buildSocDocx([HEADER, ...ROWS]));
  const result = suggestReferences(table, datasheets());
  const byItem = new Map(result.map((row) => [row.item, row]));
  assert.deepEqual([...byItem.keys()], ["5.1", "5.2", "5.3", "5.4", "5.6"], "the heading (5) and the row with a full reference (5.5) are left out");

  const label = byItem.get("5.1")!;
  assert.equal(label.kind, "empty");
  assert.equal(label.suggestions[0].datasheetId, "camera");
  assert.equal(label.suggestions[0].page, 2);
  assert.equal(label.suggestions[0].source, "label");
  assert.match(label.suggestions[0].snippet, /^5\.1 Resolution/);
  assert.equal(label.certain, true);

  const value = byItem.get("5.2")!;
  assert.equal(value.suggestions.length, 1);
  assert.deepEqual([value.suggestions[0].datasheetId, value.suggestions[0].page, value.suggestions[0].source], ["power", 3, "value"]);
  assert.match(value.suggestions[0].snippet, /220 V/);
  assert.equal(value.certain, false);

  assert.deepEqual(byItem.get("5.3")!.suggestions, []);

  const titleOnly = byItem.get("5.4")!;
  assert.equal(titleOnly.kind, "title_only");
  assert.deepEqual(titleOnly.suggestions.map((s) => [s.datasheetId, s.page]), [["camera", 4]], "searched only in the document it names, not in the power one that also has the values");

  const unknownDocument = byItem.get("5.6")!;
  assert.equal(unknownDocument.kind, "title_only");
  assert.deepEqual(unknownDocument.suggestions, [], "a document the Proposal does not have is ไม่พบ");
});

test("alternatives: up to two more pages, the label page first", () => {
  const twin = pdf([["5.1 Resolution 3840 x 2160 pixels"], ["Another 3840 x 2160 pixels page"], ["Third 3840 x 2160 pixels page"], ["Fourth 3840 x 2160 pixels page"]]);
  const table = readSocTable(buildSocDocx([HEADER, ["5", "ระบบ", "", ""], ROWS[1]]));
  const [row] = suggestReferences(table, [{ id: "twin", name: "Twin.pdf", pages: readDatasheetPages(twin) }]);
  assert.deepEqual(row.suggestions.map((s) => [s.page, s.source]), [[1, "label"], [2, "value"], [3, "value"]]);
});

test("a label on several pages is a suggestion but not a certain one", () => {
  const two = pdf([["5.1 first"], ["5.1 second 3840 x 2160 pixels"]]);
  const table = readSocTable(buildSocDocx([HEADER, ["5", "ระบบ", "", ""], ROWS[1]]));
  const [row] = suggestReferences(table, [{ id: "two", name: "Two.pdf", pages: readDatasheetPages(two) }]);
  assert.equal(row.suggestions[0].page, 2, "the label page that also carries the TOR values comes first");
  assert.equal(row.certain, false);
});

test("major items set to ไม่ต้องตรวจ are left out", () => {
  const table = readSocTable(buildSocDocx([HEADER, ...ROWS]));
  const skipped = { ...table, majorItems: table.majorItems.map((item) => ({ ...item, skipped: true })) };
  assert.deepEqual(suggestReferences(skipped, datasheets()), []);
});

test("an Excel SOC reads the same way, with its reference column", async () => {
  const xlsx = await buildXlsx([{ name: "SOC", rows: [HEADER, ...ROWS] }]);
  const result = suggestReferences(readSocTable(xlsx), datasheets());
  assert.deepEqual(result.map((row) => [row.item, row.kind, row.suggestions[0]?.page ?? null]), [["5.1", "empty", 2], ["5.2", "empty", 3], ["5.3", "empty", null], ["5.4", "title_only", 4], ["5.6", "title_only", null]]);
});

test("a SOC without a reference column has every row empty", () => {
  const table = readSocTable(buildSocDocx([["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ"], ["5", "ระบบ", ""], ["5.1", "กล้อง 3840 x 2160 pixels", ""]]));
  const result = suggestReferences(table, datasheets());
  assert.deepEqual(result.map((row) => [row.item, row.kind, row.suggestions[0]?.page]), [["5.1", "empty", 2]]);
});
