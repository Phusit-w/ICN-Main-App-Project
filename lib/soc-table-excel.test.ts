import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSocFile, readSocTable } from "@/lib/soc-table";
import { buildSocDocx, buildZip } from "@/test/docx-fixture";
import { buildXlsx, STACKED_HEADER, STACKED_HEADER_MERGES } from "@/test/xlsx-fixture";

// The skill's reader must number rows the same way: its tests build these
// same workbook layouts (skill tests/test_soc_table_excel.py). A layout
// changed or added here goes there too.
const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"];
const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => [`${prefix}.${i + 1}`, `TOR ${prefix}.${i + 1}`, `ข้อเสนอ ${prefix}.${i + 1}`, null, "√", "Brochure page 2"]);

test("a workbook shaped like the Surat Thani sample: stacked header under title lines, √ ticks, a split over 60 rows", async () => {
  const soc = await buildXlsx([{
    name: "URT CompT (AppxA)",
    merges: STACKED_HEADER_MERGES,
    rows: [
      ...STACKED_HEADER,
      ["1", "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่ มีคุณลักษณะดังนี้", null, null, null, null],
      ["1.1", "อุปกรณ์ตรวจจับ", "CASRI", null, null, "Brochure page 1"],
      ...numbered("1.1", 40),
      ["1.2", "กล้อง PTZ", "CASRI PTZ", "√", null, "Brochure page 9"],
      ...numbered("1.2", 30),
      ["2", "ระบบระบุตำแหน่ง", null, null, null, null],
      ["2.1", "เครื่องรับสัญญาณ", "1090MHz", "√", null, "Brochure page 29"],
    ],
  }]);
  const table = readSocTable(soc);
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.label, m.title, m.rowCount, m.groupLabel, m.skipped]), [
    ["1.1", "1.1", "อุปกรณ์ตรวจจับ", 42, "1", false], // its 41 rows and the heading row of ข้อ 1
    ["1.2", "1.2", "กล้อง PTZ", 31, "1", false],
    ["2", "2", "ระบบระบุตำแหน่ง", 2, null, true],
  ]);
  assert.equal(table.majorItems[0].groupTitle, "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่ มีคุณลักษณะดังนี้");
  // Row 1 is the first row under the header rows.
  assert.deepEqual(table.rowText(1, "1"), { tor: "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่ มีคุณลักษณะดังนี้", proposal: "" });
  assert.deepEqual(table.rowText(3, "1.1.1"), { tor: "TOR 1.1.1", proposal: "ข้อเสนอ 1.1.1" });
  assert.deepEqual(table.warnings, []);
  assert.deepEqual(table.file, { extension: ".xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
});

test("every visible sheet with a header is part of the SOC, rows numbered on across sheets; other sheets are named, hidden ones ignored", async () => {
  const soc = await buildXlsx([
    { name: "ปก", rows: [["โครงการท่าอากาศยาน"], ["จัดทำโดย ICN"]] },
    { name: "ระบบ A", rows: [HEADER, ["1", "ระบบ A", null, null], ["1.1", "กล้อง", "CASRI", "หน้า 3"]] },
    { name: "ร่าง", hidden: true, rows: [HEADER, ["9.1", "ร่างเก่า", "x", "หน้า 1"]] },
    { name: "ระบบ B", rows: [["ภาคผนวก"], HEADER, ["2", "ระบบ B", null, null], ["2.1", "เรดาร์", "X-band", "หน้า 5"]] },
    { name: "ว่าง", rows: [] },
  ]);
  const table = readSocTable(soc);
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.title, m.rowCount]), [["1", "ระบบ A", 2], ["2", "ระบบ B", 2]]);
  assert.deepEqual(table.rowText(2, "1.1"), { tor: "กล้อง", proposal: "CASRI" });
  assert.deepEqual(table.rowText(4, "2.1"), { tor: "เรดาร์", proposal: "X-band" });
  assert.equal(table.warnings.length, 1);
  assert.match(table.warnings[0], /ชีต "ปก"/);
  assert.doesNotMatch(table.warnings[0], /ร่าง|ว่าง/);
});

test("rows without an item number belong to the numbered row above, and empty rows are not rows", async () => {
  const soc = await buildXlsx([{ name: "SOC", rows: [
    HEADER,
    ["1.1", "กล้อง", "CASRI", "หน้า 3"],
    [null, "- ความละเอียด 4K", "4K", "หน้า 4"],
    [null, null, null, null],
    [null, "- กันน้ำ IP66", "IP67", "หน้า 4"],
    ["2.1", "เรดาร์", "X", "หน้า 5"],
  ] }]);
  const table = readSocTable(soc);
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.rowCount]), [["1", 3], ["2", 1]]);
  assert.deepEqual(table.rowText(3, "1.1"), { tor: "- กันน้ำ IP66", proposal: "IP67" });
  assert.deepEqual(table.rowText(4, "2.1"), { tor: "เรดาร์", proposal: "X" });
});

test("a หมายเหตุ column, with or without a reference column beside it, makes a row of a line that only has a remark", async () => {
  const rows = (header: string[]) => [
    header,
    ["1.1", "กล้อง", "CASRI", "Brochure หน้า 3"],
    [null, null, null, "ดูเพิ่ม Brochure หน้า 4"],
    ["1.2", "เรดาร์", "X", "Brochure หน้า 5"],
  ];
  for (const header of [["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "หมายเหตุ (คำอธิบายเพิ่มเติม)"], ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "หมายเหตุ", "เอกสารอ้างอิง"]]) {
    const table = readSocTable(await buildXlsx([{ name: "SOC", rows: rows(header) }]));
    assert.deepEqual(table.majorItems.map((m) => [m.key, m.rowCount]), [["1", 3]]);
    assert.deepEqual(table.rowText(3, "1.2"), { tor: "เรดาร์", proposal: "X" });
  }
});

// A hand-written sheet, as Excel itself saves one: empty rows are left out
// of the file, and tags may carry a namespace prefix.
const sheetXml = (rows: Record<number, string[]>, { prefix = "", style = "" } = {}) => {
  const cell = (ref: string, text: string) => (/^[0-9.]+$/.test(text) && style ? `<${prefix}c r="${ref}" s="${style}"><${prefix}v>${text}</${prefix}v></${prefix}c>` : `<${prefix}c r="${ref}" t="inlineStr"><${prefix}is><${prefix}t>${text}</${prefix}t></${prefix}is></${prefix}c>`);
  const body = Object.entries(rows).map(([number, cells]) => `<${prefix}row r="${number}">${cells.map((text, i) => cell(`${String.fromCharCode(65 + i)}${number}`, text)).join("")}</${prefix}row>`).join("");
  return `<${prefix}worksheet><${prefix}sheetData>${body}</${prefix}sheetData></${prefix}worksheet>`;
};
const workbook = (sheet: string, extra: Record<string, string> = {}) => buildZip({
  "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="SOC" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/worksheets/sheet1.xml": sheet,
  ...extra,
});

test("empty rows that the file leaves out, above the header or between rows, don't break the read", () => {
  const table = readSocTable(workbook(sheetXml({ 1: ["ภาคผนวก ก"], 3: HEADER, 5: ["1.1", "กล้อง", "CASRI", "หน้า 3"], 9: ["1.2", "เรดาร์", "X", "หน้า 5"] })));
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.rowCount]), [["1", 2]]);
  assert.deepEqual(table.rowText(2, "1.2"), { tor: "เรดาร์", proposal: "X" });
});

test("a sheet with a stray cell at the very last row is read, not a crash", () => {
  const table = readSocTable(workbook(sheetXml({ 1: HEADER, 2: ["1.1", "กล้อง", "CASRI", "หน้า 3"], 1048576: ["", "", "", "", "", "", "", "x"] })));
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.rowCount]), [["1", 1]]);
});

test("tags with a namespace prefix are read", () => {
  const table = readSocTable(workbook(sheetXml({ 1: HEADER, 2: ["1.1", "กล้อง", "CASRI", "หน้า 3"] }, { prefix: "x:" })));
  assert.deepEqual(table.rowText(1, "1.1"), { tor: "กล้อง", proposal: "CASRI" });
});

test("an item number typed as a number keeps the decimals its cell format shows", () => {
  const styles = `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>`;
  const table = readSocTable(workbook(sheetXml({ 1: HEADER, 2: ["1.09", "กล้อง", "CASRI", "หน้า 3"], 3: ["1.1", "เรดาร์", "X", "หน้า 5"] }, { style: "1" }), { "xl/styles.xml": styles }));
  // The cell holds the number 1.1; its format shows 1.10, which is not item 1.1.
  assert.deepEqual(table.rowText(2, "1.10"), { tor: "เรดาร์", proposal: "X" });
  assert.equal(table.rowText(2, "1.1"), null);
  assert.deepEqual(table.rowText(1, "1.09"), { tor: "กล้อง", proposal: "CASRI" });
});

test("a stacked header whose group name reads like a TOR column, and an item column named on two lines", async () => {
  const soc = await buildXlsx([{ name: "SOC", merges: ["A1:A2", "B1:C1"], rows: [
    ["ลำดับ\nที่", "รายละเอียดคุณลักษณะเฉพาะ", null, "เอกสารอ้างอิง"],
    [null, "ข้อกำหนด TOR", "ข้อเสนอ", null],
    ["1.1", "กล้อง", "CASRI", "หน้า 3"],
  ] }]);
  assert.deepEqual(readSocTable(soc).rowText(1, "1.1"), { tor: "กล้อง", proposal: "CASRI" });
});

test("a first row with no item number is a SOC row, not one more header row", async () => {
  const soc = await buildXlsx([{ name: "SOC", rows: [HEADER, [null, "ผนวก 7 รายละเอียดของ FDF", null, "เอกสารส่วนที่ 2 5.1"], ["1.1", "กล้อง", "CASRI", "หน้า 3"]] }]);
  const table = readSocTable(soc);
  assert.deepEqual(table.rowText(2, "1.1"), { tor: "กล้อง", proposal: "CASRI" });
});

test("a workbook that is cut off is refused quickly, not searched over and over", () => {
  const broken = `<worksheet><sheetData>${"<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>x</t></is></c>".repeat(60000)}`;
  const started = Date.now();
  assert.throws(() => readSocTable(workbook(broken)), /ไม่พบตาราง SOC ในไฟล์ Excel/);
  assert.ok(Date.now() - started < 3000);
});

test("a workbook with no tick columns, English headers in another order, and item numbers typed as numbers", async () => {
  const soc = await buildXlsx([{ name: "SOC", rows: [
    ["Reference", "Item", "Specification (TOR)", "Proposal"],
    ["page 1", 1, "Surveillance system", null],
    ["page 2", 1.1, "Camera", "CASRI"],
    ["page 3", "1.10", "Storage", "SSD"],
  ] }]);
  const table = readSocTable(soc);
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.label, m.title, m.rowCount]), [["1", "1", "Surveillance system", 3]]);
  assert.deepEqual(table.rowText(2, "1.1"), { tor: "Camera", proposal: "CASRI" });
  assert.deepEqual(table.rowText(3, "1.10"), { tor: "Storage", proposal: "SSD" });
});

test("floating images are counted and reported, and don't stop the read", async () => {
  const soc = await buildXlsx([
    { name: "SOC", images: 2, rows: [HEADER, ["1.1", "กล้อง", "CASRI", "หน้า 3"]] },
    { name: "รูป", images: 1, rows: [] },
  ]);
  const table = readSocTable(soc);
  assert.deepEqual(table.majorItems.map((m) => m.key), ["1"]);
  assert.deepEqual(table.warnings, ["มีรูป 3 รูปในไฟล์ Excel ที่ยังไม่อ่าน ระบบตรวจเฉพาะข้อความในเซลล์ กรุณาดูรูปเหล่านี้เอง"]);
});

test("a workbook with no SOC table is refused", async () => {
  const soc = await buildXlsx([{ name: "ราคา", rows: [["รายการ", "ราคา"], ["กล้อง", 1000]] }]);
  assert.throws(() => readSocTable(soc), /ไม่พบตาราง SOC ในไฟล์ Excel/);
});

test("a workbook written with inline strings and no cell references is read too", () => {
  const cell = (text: string) => `<c t="inlineStr"><is><t>${text}</t></is></c>`;
  const row = (cells: string[]) => `<row>${cells.map(cell).join("")}</row>`;
  const soc = buildZip({
    "xl/workbook.xml": `<workbook xmlns:r="r"><sheets><sheet name="SOC" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${row(HEADER)}${row(["1.1", "Power &amp; Cooling", "UPS", "page 2"])}</sheetData></worksheet>`,
  });
  assert.deepEqual(readSocTable(soc).rowText(1, "1.1"), { tor: "Power & Cooling", proposal: "UPS" });
});

test("the kind of SOC file is told by its content, not its name", async () => {
  const xlsx = await buildXlsx([{ name: "SOC", rows: [HEADER, ["1.1", "กล้อง", "CASRI", "หน้า 3"]] }]);
  assert.doesNotThrow(() => assertSocFile({ name: "SOC.XLSX", bytes: xlsx }));
  assert.equal(readSocTable(xlsx).file.extension, ".xlsx");
  assert.equal(readSocTable(buildSocDocx([["1.1", "กล้อง", "CASRI"]])).file.extension, ".docx");
});

test("old Office formats are refused with what to do; a PDF is taken whatever its name", () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const pdf = new TextEncoder().encode("%PDF-1.4");
  const docx = buildSocDocx([["1.1", "กล้อง", "CASRI"]]);
  assert.throws(() => assertSocFile({ name: "SOC.doc", bytes: ole }), /Save As เป็น \.docx หรือ \.xlsx/);
  assert.throws(() => assertSocFile({ name: "SOC.xls", bytes: ole }), /Save As เป็น \.docx หรือ \.xlsx/);
  assert.throws(() => assertSocFile({ name: "SOC.docx", bytes: ole }), /รุ่นเก่าหรือใส่รหัสผ่าน.*Save As เป็น \.docx หรือ \.xlsx/); // an old file renamed, or one with a password
  assert.doesNotThrow(() => assertSocFile({ name: "SOC.pdf", bytes: pdf }));
  assert.doesNotThrow(() => assertSocFile({ name: "SOC.docx", bytes: pdf })); // a PDF is known by its content
  assert.throws(() => assertSocFile({ name: "SOC.txt", bytes: docx }), /ไฟล์ SOC ต้องเป็น Word \(\.docx\), Excel \(\.xlsx\) หรือ PDF/);
});
