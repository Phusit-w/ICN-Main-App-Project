import { test } from "node:test";
import assert from "node:assert/strict";
import { majorItemKey, readSocMajorItems } from "@/lib/soc-major-items";
import { buildDocx, buildSocDocx, buildZip, tableXml } from "@/test/docx-fixture";

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"];

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

  assert.deepEqual(readSocMajorItems(soc), [
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

  assert.deepEqual(readSocMajorItems(soc), [
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

  assert.deepEqual(readSocMajorItems(soc), [{ key: "1", label: "1", title: null }]);
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
  assert.deepEqual(readSocMajorItems(soc), [{ key: "2", label: "2", title: "Power & Cooling" }]);
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

test("majorItemKey maps any item number to its major item", () => {
  assert.equal(majorItemKey("๑.๒.๗"), "1");
  assert.equal(majorItemKey("4.3.1"), "4");
  assert.equal(majorItemKey(" ๑๒. "), "12");
  assert.equal(majorItemKey("1.5.1."), "1");
  assert.equal(majorItemKey("หมายเหตุ"), null);
  assert.equal(majorItemKey(""), null);
});
