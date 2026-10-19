import { test } from "node:test";
import assert from "node:assert/strict";
import { isItemInMajorItem, majorItemKey } from "@/lib/soc-major-items";
import { readSocTable } from "@/lib/soc-table";
import { buildDocx, buildSocDocx, buildZip, PNG, tableXml } from "@/test/docx-fixture";

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"];
// Read through the SOC table reader, as every caller does.
const readSocMajorItems = (bytes: Uint8Array) => readSocTable(bytes).majorItems;
const socRowTexts = (bytes: Uint8Array) => readSocTable(bytes).rowText;
const brief = (soc: Uint8Array) => readSocMajorItems(soc).map(({ key, label, title }) => ({ key, label, title }));

test("lists the top-level item numbers in SOC order, with the heading row's text as title", () => {
  const soc = buildSocDocx([
    ["เอกสาร ภาคผนวก ก.", "เอกสาร ภาคผนวก ก.", "เอกสาร ภาคผนวก ก.", "เอกสาร ภาคผนวก ก."],
    HEADER,
    ["๑.", "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่ มีคุณลักษณะดังนี้", "", ""],
    ["๑.๑", "อุปกรณ์ตรวจจับ", "CASRI", "หน้า 3"],
    ["๑.๑.๑", "ความละเอียดภาพ", "116 MP", "หน้า 4"],
    ["๒.๑", "อุปกรณ์ระบุตำแหน่ง", "CATM", "หน้า 9"],
    ["๓.๒", "การจำลองเส้นทาง", "CATM", "หน้า 12"],
    ["๔.๓.๓", "หน่วยจัดเก็บข้อมูล", "SAS", "หน้า 20"],
    ["4.8.2.6", "จอภาพ", "16\" FHD+", "หน้า 21"],
  ]);

  assert.deepEqual(brief(soc), [
    { key: "1", label: "๑", title: "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่ มีคุณลักษณะดังนี้" },
    { key: "2", label: "๒", title: null },
    { key: "3", label: "๓", title: null },
    { key: "4", label: "๔", title: null },
  ]);
});

// The shape of MEA Y69: one table, every ผนวก starts with an unnumbered row
// and numbers its rows from 1 again (also under each sub-heading).
const ANNEX_SOC = () => buildSocDocx([
  ["", "ผนวก 7 รายละเอียดของ Indoor FDF", "", "เอกสารส่วนที่ 2 5.1"],
  ["", "ความต้องการ", "", ""],
  ["1.", "ใช้รองรับสายใยแก้ว", "", "5.1 หน้า 2"],
  ["7.", "มี Splice tray", "", "5.1 หน้า 3"],
  ["", "คุณสมบัติทางกายภาพ", "", ""],
  ["1.", "ทำจากเหล็กแผ่น", "", "5.1 หน้า 4"],
  ["", { image: PNG }, "", ""],
  ["", "ภาคผนวกที่ ๘ รายละเอียดของ Outdoor FDF", "", "เอกสารส่วนที่ 2 5.2"],
  ["1.", "รายละเอียดตู้", "", ""],
  ["1.1", "ตู้ทำจากสแตนเลส", "", "5.2 หน้า 1"],
]);

test("a SOC divided into ผนวก has one major item per ผนวก, whatever numbers its rows restart from", () => {
  assert.deepEqual(readSocMajorItems(ANNEX_SOC()).map(({ key, label, title, rowCount, imageRowCount, groupLabel, skipped }) => ({ key, label, title, rowCount, imageRowCount, groupLabel, skipped })), [
    { key: "7", label: "ผนวก 7", title: "รายละเอียดของ Indoor FDF", rowCount: 7, imageRowCount: 1, groupLabel: null, skipped: false },
    { key: "8", label: "ผนวก ๘", title: "รายละเอียดของ Outdoor FDF", rowCount: 3, imageRowCount: 0, groupLabel: null, skipped: false },
  ]);
});

test("a row of a ผนวก is found by its row and its item under the ผนวก number", () => {
  const rowText = socRowTexts(ANNEX_SOC());
  // The skill numbers a row under its ผนวก: ข้อ 7 of ผนวก 7 is 7.7, a row without a number takes the one above.
  assert.equal(rowText(4, "7.7")?.tor, "มี Splice tray");
  assert.equal(rowText(6, "7.1")?.tor, "ทำจากเหล็กแผ่น");
  assert.equal(rowText(3, "7.1")?.tor, "ใช้รองรับสายใยแก้ว");
  assert.equal(rowText(7, "7.1")?.image, true);
  assert.equal(rowText(1, "7")?.tor, "ผนวก 7 รายละเอียดของ Indoor FDF");
  assert.equal(rowText(10, "8.1.1")?.tor, "ตู้ทำจากสแตนเลส");
  assert.ok(isItemInMajorItem("7.7", { key: "7" }) && isItemInMajorItem("7", { key: "7" }) && !isItemInMajorItem("8.1", { key: "7" }));
});

test("a row of another ผนวก isn't found under this ผนวก's number", () => {
  const rowText = socRowTexts(ANNEX_SOC());
  // Row 9 is ข้อ 1 of ผนวก 8; ผนวก 7 has a ข้อ 1 too.
  assert.equal(rowText(9, "8.1")?.tor, "รายละเอียดตู้");
  assert.equal(rowText(9, "7.1"), null);
  assert.equal(rowText(8, "7"), null);
});

test("a SOC with one table per ผนวก: the row is the one in that ผนวก's table", () => {
  const soc = buildDocx(tableXml([
    ["", "ผนวก 7 Indoor FDF", "", ""],
    ["1.", "a7", "", ""],
    ["1.1", "a7.1", "", ""],
  ]) + tableXml([
    ["", "ผนวก 8 Outdoor FDF", "", ""],
    ["1.", "a8", "", ""],
    ["1.1", "a8.1", "", ""],
  ]));
  assert.deepEqual(readSocMajorItems(soc).map((m) => m.label), ["ผนวก 7", "ผนวก 8"]);
  const rowText = socRowTexts(soc);
  assert.equal(rowText(2, "7.1")?.tor, "a7");
  assert.equal(rowText(2, "8.1")?.tor, "a8");
  assert.equal(rowText(1, "8")?.tor, "ผนวก 8 Outdoor FDF");
});

// ผนวก ๒ with ๓ own items of 40 rows each, beside a small ผนวก ๓.
const bigAnnexSoc = () => buildSocDocx([
  ["", "ผนวก ๒ ข้อกำหนดทางเทคนิค", "", ""],
  ...[1, 2, 3].flatMap((n) => [
    [`${n}.`, `หัวข้อ ${n}`, "", ""],
    ...Array.from({ length: 39 }, (_, i) => [`${n}.${i + 1}`, `ข้อ ${n}.${i + 1}`, "x", ""]),
  ]),
  ["", "ภาคผนวก ๓ อื่นๆ", "", ""],
  ["1.", "รายการ", "", ""],
]);

test("a ผนวก over the split size is split into one major item per own item; a small ผนวก stays one", () => {
  const items = readSocMajorItems(bigAnnexSoc());
  assert.deepEqual(items.map(({ key, label, title, rowCount, groupLabel, groupTitle, skipped }) => ({ key, label, title, rowCount, groupLabel, groupTitle, skipped })), [
    { key: "2.1", label: "๒.1", title: "หัวข้อ 1", rowCount: 41, groupLabel: "ผนวก ๒", groupTitle: "ข้อกำหนดทางเทคนิค", skipped: false },
    { key: "2.2", label: "๒.2", title: "หัวข้อ 2", rowCount: 39 + 1, groupLabel: "ผนวก ๒", groupTitle: "ข้อกำหนดทางเทคนิค", skipped: false },
    { key: "2.3", label: "๒.3", title: "หัวข้อ 3", rowCount: 40, groupLabel: "ผนวก ๒", groupTitle: "ข้อกำหนดทางเทคนิค", skipped: false },
    { key: "3", label: "ผนวก ๓", title: "อื่นๆ", rowCount: 2, groupLabel: null, groupTitle: null, skipped: false },
  ]);
  assert.equal(items.slice(0, 3).reduce((n, m) => n + m.rowCount, 0), 121); // every row of the ผนวก, once
});

test("an item of a part of a split ผนวก belongs to that part only, and the ผนวก's heading to the first", () => {
  assert.ok(isItemInMajorItem("2.2.5", { key: "2.2" }));
  assert.ok(!isItemInMajorItem("2.3.5", { key: "2.2" }));
  assert.ok(isItemInMajorItem("2", { key: "2.1" }, { takesGroupHeading: true }));
  assert.ok(!isItemInMajorItem("3.2", { key: "2.2" }));
});

test("a row of a split ผนวก is still found by its row and its item", () => {
  const rowText = socRowTexts(bigAnnexSoc());
  assert.equal(rowText(51, "2.2.9")?.tor, "ข้อ 2.9"); // row 51 is the 9th item of the second part
  assert.equal(rowText(123, "3.1")?.tor, "รายการ");
});

test("one row that mentions a ผนวก doesn't turn a numbered SOC into ผนวก items", () => {
  const soc = buildSocDocx([
    HEADER,
    ["", "ผนวก 1 ข้อกำหนดทั่วไป", "", ""],
    ["๑.", "ระบบ", "", ""],
    ["๑.๑", "อุปกรณ์", "X", "หน้า 3"],
    ["๒.๑", "ซอฟต์แวร์", "Y", "หน้า 9"],
  ]);
  assert.deepEqual(brief(soc).map((m) => m.key), ["1", "2"]);
});

test("reads Arabic item numbers with trailing dots", () => {
  const soc = buildSocDocx([
    ["", "Specification of DWDM", ""],
    ["1.", "General", ""],
    ["1.5.1.", "ASON/GMPLS in optical layer.", ""],
    ["", "", ""],
    ["2.", "Equipment Type", ""],
    ["2.1.", "Optical Terminal Multiplexer", ""],
    ["10.", "Training", ""],
  ]);

  assert.deepEqual(brief(soc), [
    { key: "1", label: "1", title: "General" },
    { key: "2", label: "2", title: "Equipment Type" },
    { key: "10", label: "10", title: "Training" },
  ]);
});

test("ignores rows whose first cell isn't an item number, and tables nested inside cells", () => {
  const nested = tableXml([["9.9", "a table inside a cell"]]);
  const outer = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>1.1</w:t></w:r></w:p></w:tc><w:tc>${nested}<w:p/></w:tc></w:tr>`
    + `<w:tr><w:tc><w:p><w:r><w:t>หมายเหตุ</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>3.1 is not an item</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  const soc = buildDocx(`<w:p><w:r><w:t>5.1 a paragraph outside any table</w:t></w:r></w:p>${outer}`);

  assert.deepEqual(brief(soc), [{ key: "1", label: "1", title: null }]);
});

test("skips tables with no dotted item numbers, such as a cover or signature table", () => {
  const cover = tableXml([["1", "ชื่อโครงการ"], ["2566", "ปีงบประมาณ"]]);
  const soc = tableXml([["๑.", "ระบบเฝ้าระวัง"], ["๑.๑", "กล้อง"]]);
  assert.deepEqual(readSocMajorItems(buildDocx(cover + soc)).map((m) => m.key), ["1"]);
  assert.equal(readSocMajorItems(buildDocx(cover + soc))[0].title, "ระบบเฝ้าระวัง");
});

test("joins a cell's text runs and decodes XML entities", () => {
  const row = `<w:tr><w:tc><w:p><w:r><w:t>2</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p></w:tc>`
    + `<w:tc><w:p><w:r><w:t xml:space="preserve">Power &amp; </w:t></w:r><w:r><w:t>Cooling</w:t></w:r></w:p></w:tc></w:tr>`;
  const subItem = `<w:tr><w:tc><w:p><w:r><w:t>2.1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>UPS</w:t></w:r></w:p></w:tc></w:tr>`;
  const soc = buildDocx(`<w:tbl>${row}${subItem}</w:tbl>`);
  assert.deepEqual(brief(soc), [{ key: "2", label: "2", title: "Power & Cooling" }]);
});

test("reads a deflate-compressed document.xml, as Word writes it", () => {
  const soc = buildDocx(tableXml([["1.", "General"], ["2.1", "Spec"]]), { deflate: true });
  assert.deepEqual(readSocMajorItems(soc).map((m) => m.key), ["1", "2"]);
});

test("a SOC without item numbers has no major items", () => {
  assert.deepEqual(readSocMajorItems(buildSocDocx([HEADER, ["", "ข้อความ", "", ""]])), []);
});

test("rejects a file that isn't a Word document", () => {
  assert.throws(() => readSocMajorItems(new TextEncoder().encode("PK\u0003\u0004 not really a zip")), /ไม่สามารถอ่านไฟล์ SOC/);
  assert.throws(() => readSocMajorItems(buildZip({ "hello.txt": "hi" })), /ไม่สามารถอ่านไฟล์ SOC/);
});

// A SOC section: its heading row, then `count` numbered bullet rows ("๑)"),
// which carry no item number and belong to the heading above them.
const section = (item: string, title: string, count: number) => [
  [item, title, "", ""],
  ...Array.from({ length: count }, (_, i) => [`${i + 1})`, `${title} ข้อย่อย ${i + 1}`, "", ""]),
];

test("counts the rows each major item covers, unnumbered rows included", () => {
  const soc = buildSocDocx([
    HEADER,
    ...section("๑.", "ข้อ ๑", 3),
    ...section("๑.๑", "ข้อ ๑.๑", 2),
    ...section("๒.", "ข้อ ๒", 0),
  ]);
  assert.deepEqual(readSocMajorItems(soc).map((m) => [m.key, m.rowCount, m.groupLabel]), [["1", 7, null], ["2", 1, null]]);
});

test("a major item over 60 rows is split into its sub-sections; its heading row joins the first", () => {
  const soc = buildSocDocx([
    HEADER,
    ...section("๔.", "ระบบเดิม", 2),
    ["๕.", "ระบบ RFID มีรายละเอียดดังนี้", "", ""],
    ...section("๕.๑", "เครื่องแม่ข่าย", 20),
    ...section("๕.๒", "เครื่องอ่าน RFID", 70), // over 60 on its own: not split again
    ...section("๕.๒.๑", "เสาอากาศ", 1),
    ...section("๕.๓", "เครื่องพิมพ์", 5),
    ...section("๖.", "การฝึกอบรม", 1),
  ]);
  const group = { imageRowCount: 0, groupLabel: "๕", groupTitle: "ระบบ RFID มีรายละเอียดดังนี้", skipped: false };
  const other = { imageRowCount: 0, groupLabel: null, groupTitle: null, skipped: true };
  assert.deepEqual(readSocMajorItems(soc), [
    { key: "4", label: "๔", title: "ระบบเดิม", rowCount: 3, ...other },
    { key: "5.1", label: "๕.๑", title: "เครื่องแม่ข่าย", rowCount: 22, ...group },
    { key: "5.2", label: "๕.๒", title: "เครื่องอ่าน RFID", rowCount: 73, ...group },
    { key: "5.3", label: "๕.๓", title: "เครื่องพิมพ์", rowCount: 6, ...group },
    { key: "6", label: "๖", title: "การฝึกอบรม", rowCount: 2, ...other },
  ]);
});

test("Image Rows are counted under the item they sit in, also after a split", () => {
  const image = (item = "") => [item, { image: PNG }, "", ""];
  const soc = buildSocDocx([
    HEADER,
    ...section("๔.", "ระบบเดิม", 1), image(),
    ["๕.", "ระบบ RFID มีรายละเอียดดังนี้", "", ""], image(), // before ๕.๑: joins the first sub-section, as its heading does
    ...section("๕.๑", "เครื่องแม่ข่าย", 30), image(), image(),
    ...section("๕.๒", "เครื่องอ่าน RFID", 30),
  ]);
  assert.deepEqual(readSocMajorItems(soc).map((m) => [m.key, m.rowCount, m.imageRowCount]), [["4", 3, 1], ["5.1", 35, 3], ["5.2", 31, 0]]);
});

test("with no split, no item is guessed as ไม่ต้องตรวจ", () => {
  const soc = buildSocDocx([HEADER, ...section("๑.", "หลักการ", 3), ...section("๒.", "ระบบ", 0), ...section("๒.๑", "เครื่อง", 10)]);
  assert.deepEqual(readSocMajorItems(soc).map((m) => [m.key, m.skipped]), [["1", false], ["2", false]]);
});

test("a major item of exactly 60 rows stays whole", () => {
  const soc = buildSocDocx([HEADER, ["1.", "General", "", ""], ...section("1.1", "A", 29), ...section("1.2", "B", 28)]);
  assert.deepEqual(readSocMajorItems(soc).map((m) => [m.key, m.rowCount]), [["1", 60]]);
});

test("a major item over 60 rows split by Arabic numbers keeps the SOC's own digits in labels", () => {
  const soc = buildSocDocx([HEADER, ["2.", "Equipment", "", ""], ...section("2.1.", "OTM", 40), ...section("2.2.", "ROADM", 40)]);
  assert.deepEqual(brief(soc), [{ key: "2.1", label: "2.1", title: "OTM" }, { key: "2.2", label: "2.2", title: "ROADM" }]);
});

test("a major item over 60 rows with no sub-sections, or only one, stays whole", () => {
  const flat = buildSocDocx([HEADER, ...section("๑.", "ระบบเดียว", 80), ...section("๒.๑", "อื่น ๆ", 0)]);
  assert.deepEqual(readSocMajorItems(flat).map((m) => [m.key, m.rowCount, m.groupLabel]), [["1", 81, null], ["2", 1, null]]);
  const single = buildSocDocx([HEADER, ["๑.", "ระบบ", "", ""], ...section("๑.๑", "ชุดเดียว", 80)]);
  assert.deepEqual(readSocMajorItems(single).map((m) => [m.key, m.rowCount, m.groupLabel]), [["1", 82, null]]);
});

const THAI = ["๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙", "๑๐", "๑๑", "๑๒", "๑๓", "๑๔"];
const places = (count: number) => THAI.slice(0, count).map((n, i) => [`${n}.`, `ชั้น ${i + 18}`, "", ""]);

// The shape of MOF RFID: ข้อ ๕ lists places "๑." to "๑๑.", then the real ข้อ ๖ … ๑๔ follow.
// Rows: header 1, ข้อ ๑-๔ 2-5, ข้อ ๕ 6, its list 7-17 ("๖. ชั้น 23" is row 12), ข้อ ๖ 18.
const LIST_SOC = () => buildSocDocx([
  HEADER,
  ...THAI.slice(0, 4).map((n) => [`${n}.`, `ข้อ ${n}`, "", ""]),
  ["๕.", "สถานที่ติดตั้ง ดังนี้", "", ""],
  ...places(11),
  ...THAI.slice(5).map((n) => [`${n}.`, `ข้อ ${n}`, "", ""]),
  ["๑๔.๑", "ข้อ ๑๔.๑", "", ""], // a SOC table has a dotted item number
]);

test("a numbered list inside a major item stays in it and doesn't count into the major items it numbers", () => {
  const table = readSocTable(LIST_SOC());
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.rowCount]), THAI.map((_, i) => [String(i + 1), i === 4 ? 12 : i === 13 ? 2 : 1]));
  assert.equal(table.majorItems[5].title, "ข้อ ๖");
  // The list row "๖." sits in ข้อ ๕, the real ข้อ ๖ in ข้อ ๖, whichever number the run gives the list row.
  assert.equal(table.rowText(12, "๖")?.tor, "ชั้น 23");
  assert.equal(table.majorItemOfRow(12, "๖"), "5");
  assert.equal(table.majorItemOfRow(12, "๕.๖"), "5");
  assert.equal(table.majorItemOfRow(18, "๖"), "6");
  assert.equal(table.majorItemOfRow(2, "๑"), "1");
  assert.equal(table.majorItemOfRow(1, "๑"), null); // the header row lies above the first major item
});

test("a list inside a split major item stays in the sub-section it sits in", () => {
  const table = readSocTable(buildSocDocx([
    HEADER,
    ["๕.", "ระบบ RFID", "", ""],
    ...section("๕.๑", "เครื่องอ่าน", 50),
    ...section("๕.๒", "สถานที่ติดตั้ง", 0), ...places(11), // rows 55-65, "๖." is row 60
    ["๖.", "การฝึกอบรม", "", ""],
  ]));
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.rowCount]), [["5.1", 52], ["5.2", 12], ["6", 1]]);
  assert.equal(table.majorItemOfRow(2, "๕"), "5.1"); // the split item's heading row joins its first sub-section
  assert.equal(table.majorItemOfRow(60, "๕.๒.๖"), "5.2");
  assert.equal(table.majorItemOfRow(60, "๖"), "5.2");
  assert.equal(table.majorItemOfRow(66, "๖"), "6");
});

test("a real major item follows a list, also one that skips a number or runs on a list's numbers", () => {
  const soc = buildSocDocx([
    HEADER,
    ["๑.", "ข้อ ๑", "", ""], ["๑.", "รายการ ก", "", ""], ["๒.", "รายการ ข", "", ""],
    ["๒.", "ข้อ ๒", "", ""], ["๑.", "รายการ ค", "", ""], ["๒.", "รายการ ง", "", ""], ["๓.", "รายการ จ", "", ""],
    ["๓.", "ข้อ ๓", "", ""],
    ["๕.", "ข้อ ๕", "", ""], // no ข้อ ๔ in this SOC
    ["๕.๑", "ข้อ ๕.๑", "", ""],
  ]);
  assert.deepEqual(readSocMajorItems(soc).map((m) => [m.key, m.title, m.rowCount]), [["1", "ข้อ ๑", 3], ["2", "ข้อ ๒", 4], ["3", "ข้อ ๓", 1], ["5", "ข้อ ๕", 2]]);
});

test("majorItemKey maps any item number to its major item", () => {
  assert.equal(majorItemKey("๑.๒.๗"), "1");
  assert.equal(majorItemKey("4.3.1"), "4");
  assert.equal(majorItemKey(" ๑๒. "), "12");
  assert.equal(majorItemKey("1.5.1."), "1");
  assert.equal(majorItemKey("หมายเหตุ"), null);
  assert.equal(majorItemKey(""), null);
});

test("an item number belongs to its major item, or to the sub-section a split made", () => {
  assert.equal(isItemInMajorItem("๑.๒.๗", { key: "1" }), true);
  assert.equal(isItemInMajorItem(" ๑๒. ", { key: "12" }), true);
  assert.equal(isItemInMajorItem("1.5.1.", { key: "1" }), true);
  assert.equal(isItemInMajorItem("๒.๑", { key: "1" }), false);
  assert.equal(isItemInMajorItem("๕.๕", { key: "5.5" }), true);
  assert.equal(isItemInMajorItem("5.5.3.", { key: "5.5" }), true);
  assert.equal(isItemInMajorItem("๕.๑๐", { key: "5.1" }), false);
  assert.equal(isItemInMajorItem("๕.๖", { key: "5.5" }), false);
  // The split major item's own heading row: only in the first sub-section.
  assert.equal(isItemInMajorItem("๕", { key: "5.5" }), false);
  assert.equal(isItemInMajorItem("๕.", { key: "5.1" }, { takesGroupHeading: true }), true);
  assert.equal(isItemInMajorItem("หมายเหตุ", { key: "1" }), false);
});

test("a row's TOR and bidder text come from its row number, or from its item number only when that is unique", () => {
  const soc = buildSocDocx([
    HEADER,
    ["๑.๑", "TOR ๑.๑", "ข้อเสนอ ๑.๑", "หน้า 1"],
    ["๒.๑", "TOR ๒.๑ แรก", "ข้อเสนอ ๒.๑ แรก", "หน้า 2"],
    ["2.1", "TOR ๒.๑ ซ้ำ", "ข้อเสนอ ๒.๑ ซ้ำ", "หน้า 3"],
  ]);
  const text = socRowTexts(soc);
  assert.deepEqual(text(2, "๑.๑"), { tor: "TOR ๑.๑", proposal: "ข้อเสนอ ๑.๑" });
  assert.deepEqual(text(9, "1.1"), { tor: "TOR ๑.๑", proposal: "ข้อเสนอ ๑.๑" });
  assert.deepEqual(text(4, "๒.๑"), { tor: "TOR ๒.๑ ซ้ำ", proposal: "ข้อเสนอ ๒.๑ ซ้ำ" });
  assert.equal(text(9, "๒.๑"), null);
  assert.equal(text(2, "๓.๑"), null);
});

test("an absolute item number finds its row when the SOC numbers rows relative to the major item", () => {
  // MOF_RFID ๕.๘ (2026-10-08): the skill must send "๕.๘.๗.๑" for a row the table numbers "๗.๑)",
  // and the review page showed "ไม่พบข้อความในไฟล์ SOC" for every such row.
  const soc = buildSocDocx([
    HEADER,
    ["๕.๘", "TOR ๕.๘", "ข้อเสนอ ๕.๘", ""],
    ["๗)", "TOR ๗", "ข้อเสนอ ๗", "หน้า 31"],
    ["๗.๑)", "TOR ๗.๑", "ข้อเสนอ ๗.๑", "หน้า 31"],
    ["-", "TOR ข้อย่อยไม่มีเลข", "ข้อเสนอ ข้อย่อยไม่มีเลข", "หน้า 26"],
    ["(1)", "TOR (1)", "ข้อเสนอ (1)", "หน้า 26"],
  ]);
  const text = socRowTexts(soc);
  assert.deepEqual(text(3, "๕.๘.๗"), { tor: "TOR ๗", proposal: "ข้อเสนอ ๗" });
  assert.deepEqual(text(4, "๕.๘.๗.๑"), { tor: "TOR ๗.๑", proposal: "ข้อเสนอ ๗.๑" });
  assert.deepEqual(text(5, "๕.๘.๗.๑"), { tor: "TOR ข้อย่อยไม่มีเลข", proposal: "ข้อเสนอ ข้อย่อยไม่มีเลข" });
  assert.deepEqual(text(6, "๕.๘.๗.๑.๑"), { tor: "TOR (1)", proposal: "ข้อเสนอ (1)" });
  // The row number is still checked: a relative number that isn't the item's tail doesn't match.
  assert.equal(text(4, "๕.๘.๗.๒"), null);
  assert.equal(text(3, "๕.๘.๘"), null);
});
