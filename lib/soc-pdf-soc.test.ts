import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { convertPdfSoc } from "@/lib/soc-pdf-soc";
import { readSocTable } from "@/lib/soc-table";
import { buildTablePdf, type TableCell } from "@/test/pdf-table-fixture";
import { buildXlsx, STACKED_HEADER, STACKED_HEADER_MERGES } from "@/test/xlsx-fixture";

// The generated sheet as text rows, header first, each as wide as the header.
async function sheetRows(xlsx: Uint8Array): Promise<(string | null)[][]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(xlsx) as unknown as ExcelJS.Buffer);
  assert.equal(book.worksheets.length, 1);
  const sheet = book.worksheets[0];
  const width = sheet.getRow(1).cellCount;
  const rows: (string | null)[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(Array.from({ length: width }, (_, i) => (row.getCell(i + 1).text || null)));
  });
  return rows;
}

const COLUMNS = [50, 260, 150, 50, 50, 180];
// The Surat Thani layout: a title row, then "ข้อเสนอ" over the proposal and
// the two tick columns, the tick names broken over two lines as Word does.
const SURAT_HEADER: TableCell[][] = [
  [{ text: "ตารางเปรียบเทียบคุณสมบัติทางเทคนิค", span: 6 }],
  [{ text: "ลำดับ", rowSpan: 2 }, { text: "คุณสมบัติทางเทคนิคตาม TOR", rowSpan: 2 }, { text: "ข้อเสนอ", span: 3 }, { text: "ชื่อไฟล์เอกสาร/\nเลขเล่ม/เลขหน้า", rowSpan: 2 }],
  ["คุณสมบัติทางเทคนิคของ\nผู้ยื่นข้อเสนอ", "ตรง \nข้อกำหนด", "ดีกว่า \nข้อกำหนด"],
];

test("a PDF SOC with a cover page and a repeated header: text joined as printed (Word ends a broken line with its space), ticks, and a row cut by the page break", async () => {
  const pdf = buildTablePdf([
    { columns: [150, 300], rows: [["โครงการ", "ระบบอำนวยความสะดวก ลานจอดอากาศยาน"], ["ผู้ยื่นข้อเสนอ", "บริษัท ตัวอย่าง จำกัด"]] }, // a cover: a table, but no SOC header
    {
      columns: COLUMNS,
      textAbove: "ซื้อระบบอำนวยความสะดวก ลานจอดอากาศยาน",
      rows: [
        ...SURAT_HEADER,
        ["๑.", "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่ มีคุณลักษณะดังนี้", "", "", "", ""],
        ["๑.๑", "อุปกรณ์ตรวจจับสำหรับพื้นที่ขนาดใหญ่", "CASRI-AP16", "✓", "", "CASRI Product Brochure, \npage 1"],
        ["๑.๑.๑", "เซนเซอร์ตัวตรวจจับภาพ แบบ CMOS ที่มีขนาด \n1/1.8 นิ้ว หรือไม่น้อยกว่า 8 ล้านพิกเซล", "SONY IMX585, \n8.3 million", "", "√", "CASRI Product Brochure, page 2"],
        ["๑.๑.๒", "กรมท่าอากาศยานจะพิจารณาจากรายละเอียดคุณลักษณะเฉพาะของ\nอุปกรณ์หลัก", "H.264H;MJP\nEG(Sub Stream 1)", "✓", "", "page 3"],
      ],
    },
    {
      columns: COLUMNS,
      rows: [
        ...SURAT_HEADER,
        ["", "ต่อจากหน้าที่แล้ว ทุกข้อ", "", "", "", ""],
        ["๑.๒", "กล้อง PTZ หมุนได้ ๓๖๐ องศา", "CASRI PTZ", "✓", "", "page 9"],
      ],
    },
  ]);
  const converted = await convertPdfSoc(pdf);
  assert.deepEqual(await sheetRows(converted.xlsx), [
    ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "ตรงข้อกำหนด", "ดีกว่าข้อกำหนด", "เอกสารอ้างอิง"],
    ["๑.", "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่ มีคุณลักษณะดังนี้", null, null, null, null],
    ["๑.๑", "อุปกรณ์ตรวจจับสำหรับพื้นที่ขนาดใหญ่", "CASRI-AP16", "✓", null, "CASRI Product Brochure, page 1"],
    ["๑.๑.๑", "เซนเซอร์ตัวตรวจจับภาพ แบบ CMOS ที่มีขนาด 1/1.8 นิ้ว หรือไม่น้อยกว่า 8 ล้านพิกเซล", "SONY IMX585, 8.3 million", null, "✓", "CASRI Product Brochure, page 2"],
    ["๑.๑.๒", "กรมท่าอากาศยานจะพิจารณาจากรายละเอียดคุณลักษณะเฉพาะของอุปกรณ์หลัก", "H.264H;MJPEG(Sub Stream 1)", "✓", null, "page 3"],
    [null, "ต่อจากหน้าที่แล้ว ทุกข้อ", null, null, null, null],
    ["๑.๒", "กล้อง PTZ หมุนได้ ๓๖๐ องศา", "CASRI PTZ", "✓", null, "page 9"],
  ]);
  assert.deepEqual(converted.rowPages, [2, 2, 2, 2, 3, 3]);
  assert.deepEqual(converted.warnings, []);
  // rowPages[i] is the page of the Excel reader's SOC row i + 1.
  assert.deepEqual(readSocTable(converted.xlsx).rowText(5, ""), { tor: "ต่อจากหน้าที่แล้ว ทุกข้อ", proposal: "" });
});

test("a PDF SOC gives the same major items as the Excel SOC of the same table", async () => {
  const body = [
    ["1", "ระบบเฝ้าระวังพื้นที่ขนาดใหญ่", "", "", "", ""],
    ["1.1", "อุปกรณ์ตรวจจับ", "CASRI", "✓", "", "Brochure page 1"],
    ["1.1.1", "เซนเซอร์", "IMX585", "", "✓", "Brochure page 2"],
    ["1.2", "กล้อง PTZ", "CASRI PTZ", "✓", "", "Brochure page 9"],
    ["2", "ระบบระบุตำแหน่ง", "", "", "", ""],
    ["2.1", "เครื่องรับสัญญาณ", "1090MHz", "✓", "", "Brochure page 29"],
  ];
  const pdf = buildTablePdf([
    { columns: COLUMNS, rows: [...SURAT_HEADER, ...body.slice(0, 3)] },
    { columns: COLUMNS, rows: [...SURAT_HEADER, ...body.slice(3)] },
  ]);
  const excel = await buildXlsx([{ name: "SOC", merges: STACKED_HEADER_MERGES, rows: [...STACKED_HEADER, ...body.map((cells) => cells.map((cell) => cell || null))] }]);
  const fromPdf = readSocTable((await convertPdfSoc(pdf)).xlsx);
  assert.deepEqual(fromPdf.majorItems, readSocTable(excel).majorItems);
  assert.deepEqual(fromPdf.majorItems.map((m) => [m.key, m.rowCount]), [["1", 4], ["2", 2]]);
  assert.deepEqual(fromPdf.rowText(3, "1.1.1"), { tor: "เซนเซอร์", proposal: "IMX585" });
});

test("references in a หมายเหตุ column, a SOC divided into ผนวก, no tick columns; a line break is a space, except inside Thai", async () => {
  const header: TableCell[] = ["ลำดับ", "ข้อกำหนด", "ข้อเสนอ", "หมายเหตุ"];
  const pdf = buildTablePdf([{
    columns: [50, 260, 150, 180],
    stroked: true,
    rows: [
      header,
      ["", "ผนวก 7 รายละเอียดระบบกล้อง", "", "เอกสารส่วนที่ 2 5.1"],
      ["1", "ระบบกล้องวงจร\nปิด", "", ""],
      ["1.1", "กล้อง", "CASRI", "เอกสารส่วนที่ 2\nหน้า 3"],
      ["", "ผนวก 8 รายละเอียดระบบเรดาร์", "", "เอกสารส่วนที่ 2 5.2"],
      ["1", "ระบบเรดาร์", "", ""],
      ["1.1", "เรดาร์", "X-band", "เอกสารส่วนที่ 2 หน้า 5"],
    ],
  }]);
  const converted = await convertPdfSoc(pdf);
  const rows = await sheetRows(converted.xlsx);
  assert.deepEqual(rows[0], ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "หมายเหตุ"]); // no tick columns written: the review hides the tick UI
  assert.deepEqual(rows[2], ["1", "ระบบกล้องวงจรปิด", null, null]);
  assert.deepEqual(rows[3], ["1.1", "กล้อง", "CASRI", "เอกสารส่วนที่ 2 หน้า 3"]);
  const excel = await buildXlsx([{ name: "SOC", rows: [["ลำดับ", "ข้อกำหนด", "ข้อเสนอ", "หมายเหตุ"], ...rows.slice(1)] }]);
  const majorItems = readSocTable(converted.xlsx).majorItems;
  assert.deepEqual(majorItems, readSocTable(excel).majorItems);
  assert.deepEqual(majorItems.map((m) => m.label), ["ผนวก 7", "ผนวก 8"]); // one per ผนวก
});

test("a PDF with no SOC table, or one that can't be opened, is refused", async () => {
  const noHeader = buildTablePdf([{ columns: [100, 100], rows: [["ชื่อ", "ลายมือชื่อ"], ["นาย ก", ""]] }]);
  await assert.rejects(convertPdfSoc(noHeader), /ไม่พบตาราง SOC ในไฟล์ PDF/);
  await assert.rejects(convertPdfSoc(new TextEncoder().encode("%PDF-1.7 broken")), /ไม่สามารถเปิดไฟล์ PDF ของ SOC ได้/);
});
