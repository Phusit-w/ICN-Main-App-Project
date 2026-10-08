import { test } from "node:test";
import assert from "node:assert/strict";
import { isItemInMajorItem, majorItemKey, readSocMajorItems, socRowTexts } from "@/lib/soc-major-items";
import { buildDocx, buildSocDocx, buildZip, tableXml } from "@/test/docx-fixture";

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"];
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
  const group = { groupLabel: "๕", groupTitle: "ระบบ RFID มีรายละเอียดดังนี้", skipped: false };
  const other = { groupLabel: null, groupTitle: null, skipped: true };
  assert.deepEqual(readSocMajorItems(soc), [
    { key: "4", label: "๔", title: "ระบบเดิม", rowCount: 3, ...other },
    { key: "5.1", label: "๕.๑", title: "เครื่องแม่ข่าย", rowCount: 22, ...group },
    { key: "5.2", label: "๕.๒", title: "เครื่องอ่าน RFID", rowCount: 73, ...group },
    { key: "5.3", label: "๕.๓", title: "เครื่องพิมพ์", rowCount: 6, ...group },
    { key: "6", label: "๖", title: "การฝึกอบรม", rowCount: 2, ...other },
  ]);
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
