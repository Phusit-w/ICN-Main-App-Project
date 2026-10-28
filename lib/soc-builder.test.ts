import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSocTemplate, buildSocDraft } from "@/lib/soc-builder";
import { readSocTable } from "@/lib/soc-table";
import type { TorPage } from "@/lib/soc-tor-match";
import { readZip } from "@/lib/zip";
import { buildDocx, buildSocDocx, tableXml } from "@/test/docx-fixture";

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิง", "หมายเหตุ"];
const TEMPLATE = buildSocDocx([HEADER, ["", "", "", "", ""]]);
const page = (text: string, picture = false): TorPage => ({ text, picture });
const build = (pages: TorPage[], ranges: [number, number][] = [[1, pages.length]], template = TEMPLATE) => buildSocDraft(template, pages, ranges);
// What the SOC check reads back: [item, TOR text, major item] of the data rows.
const rowsOf = (bytes: Uint8Array) => readSocTable(bytes).rows.slice(1).map((row) => [row.item, row.tor, row.majorItem]);

test("one row per numbered item, nested numbering kept as written, each major item starting with a heading row", () => {
  const draft = build([page("๔. ข้อกำหนดทั่วไป\n๔.๑ กล้อง\nความละเอียด ๑๐ ล้านพิกเซล\n๔.๒ จอภาพ\n๔.๒.๑ ขนาด ๒๔ นิ้ว\n๕. ข้อกำหนดเครือข่าย\n๕.๑ สวิตช์")]);
  assert.deepEqual(rowsOf(draft.bytes), [
    ["๔.", "ข้อกำหนดทั่วไป", "4"],
    ["๔.๑", "กล้อง ความละเอียด ๑๐ ล้านพิกเซล", "4"],
    ["๔.๒", "จอภาพ", "4"],
    ["๔.๒.๑", "ขนาด ๒๔ นิ้ว", "4"],
    ["๕.", "ข้อกำหนดเครือข่าย", "5"],
    ["๕.๑", "สวิตช์", "5"],
  ]);
  assert.equal(draft.rowCount, 6);
  assert.deepEqual(draft.warnings, []);
});

test("Arabic digits are kept as the TOR writes them", () => {
  assert.deepEqual(rowsOf(build([page("1.1 Camera\n1.2 Lens")]).bytes), [["1.1", "Camera", "1"], ["1.2", "Lens", "1"]]);
});

test("numbering restarts under every ผนวก, which starts with its own heading row", () => {
  const draft = build([page("ผนวก ๑\nข้อกำหนดกล้อง\n๑.๑ ความละเอียด\n๑.๒ เลนส์\nผนวก ๒\nข้อกำหนดจอ\n๑.๑ ขนาด")]);
  assert.deepEqual(rowsOf(draft.bytes), [
    ["", "ผนวก ๑ ข้อกำหนดกล้อง", "1"],
    ["๑.๑", "ความละเอียด", "1"],
    ["๑.๒", "เลนส์", "1"],
    ["", "ผนวก ๒ ข้อกำหนดจอ", "2"],
    ["๑.๑", "ขนาด", "2"],
  ]);
});

test("under a ผนวก, numbering restarts at 1 under each unnumbered sub-heading", () => {
  const draft = build([page("ผนวก ๗\nความต้องการ\n1. ก\n2. ข\nโครงสร้าง\n1. ค\n2. ง\n34.8 มิลลิเมตร\nผนวก ๘\n1.1 จ")]);
  assert.deepEqual(rowsOf(draft.bytes).map(([item, tor]) => [item, tor]), [
    ["", "ผนวก ๗ ความต้องการ"],
    ["1.", "ก"],
    ["2.", "ข โครงสร้าง"],
    ["1.", "ค"],
    ["2.", "ง 34.8 มิลลิเมตร"],
    ["", "ผนวก ๘"],
    ["1.1", "จ"],
  ]);
});

test("a numbered list inside an item and other unnumbered lines stay in the parent's row", () => {
  const draft = build([page("๕. ข้อกำหนด\n๕.๑ สถานที่ติดตั้ง\n(ก) ชั้น ๑๘\nและห้อง\n๑. ห้อง ก\n๒. ห้อง ข\n๕.๒ การรับประกัน")]);
  assert.deepEqual(rowsOf(draft.bytes).map(([item, tor]) => [item, tor]), [
    ["๕.", "ข้อกำหนด"],
    ["๕.๑", "สถานที่ติดตั้ง (ก) ชั้น ๑๘ และห้อง ๑. ห้อง ก ๒. ห้อง ข"],
    ["๕.๒", "การรับประกัน"],
  ]);
});

test("a dash bullet and a ๑) or (๑) list line are rows of their own, the lines after one wrap into it", () => {
  const draft = build([page("๓.๓ ระยะมองเห็น\n- ปกติ ๔๐๐ เมตร\nและชัดเจน\n- ซูม ๓๑ เท่า\n๓.๔ ประมวลผล\n๑) แผงวงจร\nแยก ๒ GB หรือ\n๒) หน่วยในซีพียู\n(๑) กรณีแรก\n๓.๕ หน่วยความจำ")]);
  assert.deepEqual(rowsOf(draft.bytes).map(([item, tor]) => [item, tor]), [
    ["๓.๓", "ระยะมองเห็น"],
    ["", "ปกติ ๔๐๐ เมตร และชัดเจน"],
    ["", "ซูม ๓๑ เท่า"],
    ["๓.๔", "ประมวลผล"],
    ["๑)", "แผงวงจร แยก ๒ GB หรือ"],
    ["๒)", "หน่วยในซีพียู"],
    ["(๑)", "กรณีแรก"],
    ["๓.๕", "หน่วยความจำ"],
  ]);
});

test("a number that does not follow the last item (a measurement at a line start) is text of the item", () => {
  const draft = build([page("๔. ข้อกำหนด\n๔.๓ ความยาว\n๒.๕ เมตร\n๔.๔ น้ำหนัก")]);
  assert.deepEqual(rowsOf(draft.bytes).map(([item, tor]) => [item, tor]), [["๔.", "ข้อกำหนด"], ["๔.๓", "ความยาว ๒.๕ เมตร"], ["๔.๔", "น้ำหนัก"]]);
});

test("a text table in an item becomes lines of that row", () => {
  const draft = build([page("๑.๑ ขนาด\n| รุ่น | น้ำหนัก |\n| A | ๑๐ กก. |\n๑.๒ สี")]);
  assert.equal(rowsOf(draft.bytes)[0][1], "ขนาด | รุ่น | น้ำหนัก | | A | ๑๐ กก. |");
  assert.equal(rowsOf(draft.bytes).length, 2);
});

test("a picture page warns with the item and its TOR page", () => {
  const draft = build([page("๑.๑ กล้อง"), page("๑.๒ แผนผังระบบ", true), page("๑.๓ จอ")]);
  assert.equal(rowsOf(draft.bytes).length, 3);
  assert.deepEqual(draft.warnings, ["ข้อ ๑.๒ (หน้า 2 ของ TOR) มีรูปภาพ กรุณาวางรูปใน Word เอง"]);
});

test("a picture page that continues an item warns for that item", () => {
  const draft = build([page("๑.๑ กล้อง"), page("", true)]);
  assert.deepEqual(draft.warnings, ["ข้อ ๑.๑ (หน้า 1 ของ TOR) มีรูปภาพ กรุณาวางรูปใน Word เอง"]);
});

test("a page number between dashes is not text of the item", () => {
  const draft = build([page("๑.๑ ก\n- ๒๖ -\nต่อ")]);
  assert.equal(rowsOf(draft.bytes)[0][1], "ก ต่อ");
});

test("a heading that starts another TOR document ends the build there, with a warning", () => {
  const draft = build([page("เอกสาร ภาคผนวก ก\n๑.๑ ก\n๑.๒ ข"), page("๑.๓ ค"), page("**เอกสาร ผนวก ข**\nตารางยื่นข้อเสนอ\n๑.๔ ง")]);
  assert.deepEqual(rowsOf(draft.bytes).map(([item, tor]) => [item, tor]), [["๑.๑", "ก"], ["๑.๒", "ข"], ["๑.๓", "ค"]]);
  assert.deepEqual(draft.warnings.slice(1), ['ตั้งแต่หน้า 3 ของ TOR ขึ้นเอกสารใหม่ ("**เอกสาร ผนวก ข**") จึงหยุดสร้างตรงนั้น ข้อความหลังจากนี้ไม่ได้ใส่ใน SOC']);
});

test("only the chosen page ranges are built", () => {
  const pages = [page("๑.๑ ก"), page("๑.๒ ข"), page("๑.๓ ค"), page("๑.๔ ง")];
  assert.deepEqual(rowsOf(build(pages, [[2, 2], [4, 4]]).bytes).map(([item]) => item), ["๑.๒", "๑.๔"]);
});

test("a bad range is refused", () => {
  assert.throws(() => build([page("๑.๑ ก")], [[3, 2]]), /ช่วงหน้า 3-2/);
});

test("pages with no text and pages past the TOR are named as unread", () => {
  const draft = build([page("๑.๑ ก"), page("  "), page("๑.๒ ข")], [[1, 4]]);
  assert.equal(rowsOf(draft.bytes).length, 2);
  assert.deepEqual(draft.warnings, ["อ่าน หน้า 2, หน้า 4 ของ TOR ไม่ได้ (ไม่มีข้อความ) ข้อที่อยู่ในหน้านี้จะไม่อยู่ใน SOC"]);
});

test("text before the first item is a warning, not a row", () => {
  const draft = build([page("ข้อกำหนดและขอบเขต\n๑.๑ ก")]);
  assert.equal(rowsOf(draft.bytes).length, 1);
  assert.deepEqual(draft.warnings, ["ข้อความก่อนข้อแรก (หน้า 1) แยกเป็นข้อไม่ได้ จึงไม่ได้ใส่ใน SOC กรุณาตรวจเอง"]);
});

test("pages with no numbered item are refused", () => {
  assert.throws(() => build([page("ข้อความทั่วไป ไม่มีเลขข้อ")]), /ไม่พบข้อที่มีเลขกำกับ/);
});

test("Thai private-use glyphs are mapped back", () => {
  const draft = build([page("๑.๑ พรอม")]);
  assert.equal(rowsOf(draft.bytes)[0][1], "พร้อม");
});

test("a template with cover text keeps it, and every other part of the file is unchanged", () => {
  const body = `<w:p><w:r><w:t>ใบเสนอราคา บริษัท ตัวอย่าง</w:t></w:r></w:p>${tableXml([HEADER, ["", "", "", "", ""]])}<w:p><w:r><w:t>ลงชื่อ</w:t></w:r></w:p>`;
  const template = buildDocx(body, { parts: { "word/styles.xml": "<styles/>", "docProps/core.xml": "<core/>" } });
  const draft = build([page("๑.๑ ก")], [[1, 1]], template);
  const parts = Object.fromEntries(readZip(draft.bytes).map((entry) => [entry.name, entry.data.toString("utf8")]));
  assert.equal(parts["word/styles.xml"], "<styles/>");
  assert.equal(parts["docProps/core.xml"], "<core/>");
  assert.match(parts["word/document.xml"], /ใบเสนอราคา บริษัท ตัวอย่าง[\s\S]*ลงชื่อ/);
  assert.deepEqual(rowsOf(draft.bytes), [["๑.๑", "ก", "1"]]);
});

test("a heading row is the item cell and one plain cell across the rest; the other rows keep every cell", () => {
  const cell = (width: string) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
  const header = `<w:tr>${["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "อ้างอิง"].map((text) => `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`;
  const template = buildDocx(`<w:tbl><w:tblPr/>${header}<w:tr>${cell("900")}${cell("4000")}${cell("3000")}${cell("1100")}</w:tr></w:tbl>`);
  const draft = build([page("๑. หัวข้อ\n๑.๑ ก")], [[1, 1]], template);
  const xml = readZip(draft.bytes).find((entry) => entry.name === "word/document.xml")!.data.toString("utf8");
  const [heading, item] = xml.split("<w:tr>").slice(2);
  assert.equal(heading.match(/<w:tc>/g)!.length, 2);
  assert.match(heading, /<w:tcW w:w="8100" w:type="dxa"\/><w:gridSpan w:val="3"\/>/);
  assert.doesNotMatch(heading, /<w:b\/>/);
  assert.equal(item.match(/<w:tc>/g)!.length, 4);
  assert.deepEqual(rowsOf(draft.bytes).map(([itemNo, tor]) => [itemNo, tor]), [["๑.", "หัวข้อ"], ["๑.๑", "ก"]]);
});

test("rows keep the template row's font, and a heading row is not bold", () => {
  const cell = (width: string) => `<w:tc><w:tcPr><w:tcW w:w="${width}"/></w:tcPr><w:p><w:pPr><w:rPr><w:rFonts w:ascii="TH Sarabun New"/><w:sz w:val="32"/></w:rPr></w:pPr></w:p></w:tc>`;
  const header = `<w:tr><w:tc><w:p><w:r><w:t>ลำดับ</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>ข้อกำหนด TOR</w:t></w:r></w:p></w:tc></w:tr>`;
  const template = buildDocx(`<w:tbl><w:tblPr/>${header}<w:tr>${cell("900")}${cell("5000")}</w:tr></w:tbl>`);
  const draft = build([page("๑. หัวข้อ\n๑.๑ ก")], [[1, 1]], template);
  const xml = readZip(draft.bytes).find((entry) => entry.name === "word/document.xml")!.data.toString("utf8");
  const rows = xml.split("<w:tr>").slice(2);
  assert.equal(rows.length, 2);
  for (const row of rows) assert.match(row, /<w:rFonts w:ascii="TH Sarabun New"\/>[\s\S]*<w:sz w:val="32"\/>[\s\S]*<w:tcW w:w="5000"\/>/);
  for (const row of rows) assert.doesNotMatch(row, /<w:b\/>/);
});

test("the offer, reference and remark cells are left empty", () => {
  const table = readSocTable(build([page("๑.๑ ก")]).bytes);
  assert.deepEqual(table.rowText(2, "๑.๑"), { tor: "ก", proposal: null });
});

test("a template with no empty last row of two cells is refused with the problem named", () => {
  assert.throws(() => assertSocTemplate(buildSocDocx([HEADER])), /ไม่พบตาราง SOC ในเทมเพลต/);
  assert.throws(() => assertSocTemplate(buildSocDocx([["a"], [""]])), /อย่างน้อย 2 คอลัมน์/);
  assert.throws(() => assertSocTemplate(buildDocx("<w:p/>")), /ไม่พบตาราง SOC ในเทมเพลต/);
  assert.throws(() => assertSocTemplate(new Uint8Array([1, 2, 3])), /ไม่สามารถอ่านไฟล์เทมเพลต/);
  assert.doesNotThrow(() => assertSocTemplate(TEMPLATE));
});

test("a template of blank rows with no header (as a customer sends it) is filled; its title rows stay and its blank rows are replaced", () => {
  const template = buildSocDocx([["แบบฟอร์ม SOC", ""], ["", ""], ["", ""], ["", ""]]);
  const draft = build([page("๑.๑ ก\n๑.๒ ข")], [[1, 1]], template);
  assert.deepEqual(readSocTable(draft.bytes).rows.map((row) => [row.item, row.tor]), [["แบบฟอร์ม SOC", ""], ["๑.๑", "ก"], ["๑.๒", "ข"]]);
});

test("a draft that the SOC check could not read back is a build error, not a silent draft", () => {
  // The SOC reader only sees tables with a dotted item number; a TOR numbered "๑." "๒." alone has none.
  assert.throws(() => build([page("๑. ก\n๒. ข")]), /สร้าง SOC ไม่สำเร็จ/);
});
