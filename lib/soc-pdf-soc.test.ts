import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { convertPdfSoc } from "@/lib/soc-pdf-soc";
import { readSocTable } from "@/lib/soc-table";
import { buildTablePdf, type TableCell, type TablePage } from "@/test/pdf-table-fixture";
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

test("a PDF locked with a password is refused with its own message", async () => {
  const locked = buildTablePdf([{ columns: COLUMNS, rows: [...SURAT_HEADER, ["1", "ระบบกล้อง", "CASRI", "✓", "", "page 1"]] }], { password: "secret" });
  await assert.rejects(convertPdfSoc(locked), { message: "ไฟล์ PDF ของ SOC ใส่รหัสผ่านไว้ กรุณาเอารหัสผ่านออกแล้วอัปโหลดใหม่" });
});

test("a PDF SOC that is scans all the way through is refused as a scanned PDF SOC", async () => {
  const scan: TablePage = { columns: [], rows: [], scanned: true };
  const message = "SOC นี้เป็น PDF แบบสแกน ระบบยังไม่รองรับ กรุณาอัปโหลดไฟล์ Word หรือ Excel ถ้ามี";
  await assert.rejects(convertPdfSoc(buildTablePdf([scan, scan])), { message });
  // Scanned table pages behind a typed signature page: still a scanned SOC, not "no table".
  await assert.rejects(convertPdfSoc(buildTablePdf([scan, scan, { columns: [], rows: [], textAbove: "ลงชื่อ ผู้ยื่นข้อเสนอ" }])), { message });
});

test("scanned pages in a text PDF SOC are skipped and named in one warning; a text page with no table is skipped silently", async () => {
  const scan: TablePage = { columns: [], rows: [], scanned: true };
  const pdf = buildTablePdf([
    { columns: COLUMNS, rows: [...SURAT_HEADER, ["1", "ระบบกล้อง", "CASRI", "✓", "", "page 1"]] },
    scan,
    scan,
    { columns: COLUMNS, rows: [...SURAT_HEADER, ["1.1", "กล้อง PTZ", "CASRI PTZ", "✓", "", "page 9"]] },
    { columns: [], rows: [], textAbove: "ลงชื่อ ผู้ยื่นข้อเสนอ" }, // a signature page: text, no table
    scan,
  ]);
  const converted = await convertPdfSoc(pdf);
  assert.deepEqual(converted.warnings, ["หน้า 2–3, 6 เป็นภาพสแกน ไม่ได้ตรวจ"]);
  assert.deepEqual(converted.rowPages, [1, 4]);
  assert.deepEqual(readSocTable(converted.xlsx).rowText(2, "1.1"), { tor: "กล้อง PTZ", proposal: "CASRI PTZ" });
});

test("pictures in TOR cells are counted into one warning and not read; pictures elsewhere are not counted", async () => {
  const pdf = buildTablePdf([{
    columns: COLUMNS,
    rows: [
      ...SURAT_HEADER,
      ["1", { text: "ระบบกล้อง ตามรูป", image: true }, "CASRI", "✓", "", "page 1"],
      ["1.1", { text: "กล้อง PTZ", image: true }, { text: "CASRI PTZ", image: true }, "✓", "", "page 9"],
      ["1.2", "กล้องมุมกว้าง", { text: "ตามรูป", image: true }, "✓", "", "page 10"],
    ],
  }]);
  const converted = await convertPdfSoc(pdf);
  assert.deepEqual(converted.warnings, ["มีรูป 2 รูปในช่องข้อกำหนด TOR ของ PDF SOC ที่ยังไม่อ่าน ระบบตรวจเฉพาะข้อความในเซลล์ กรุณาดูรูปเหล่านี้เอง"]);
  assert.deepEqual(readSocTable(converted.xlsx).rowText(1, "1"), { tor: "ระบบกล้อง ตามรูป", proposal: "CASRI" });
});

test("no item column: the item number is the leading dotted number of the TOR text, kept as typed and left in the text; a row without one is unnumbered", async () => {
  const header: TableCell[] = ["ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"];
  const pdf = buildTablePdf([
    {
      columns: [300, 150, 150],
      rows: [
        [{ text: "ตารางเปรียบเทียบข้อกำหนด TOR กับข้อเสนอ", span: 3 }], // a title, not the header
        header,
        ["๔. การจัดการระบบ", "", ""],
        ["๔.๓.๑ การเริ่มจัดเก็บข้อมูล", "รองรับ", "page 1"],
        ["ต่อเนื่องจากข้อบน", "รองรับ", "page 2"],
        ["4.3.2 Processor 2.5 GHz", "Intel", "page 3"],
        ["10 ช่องสัญญาณ", "12", "page 4"], // a number with no dot is not an item number
      ],
    },
    // No header on this page; its first row reads like one ("กำหนด", "เสนอ") and is still a SOC row.
    { columns: [300, 150, 150], rows: [["ตามที่กำหนด", "ผู้เสนอ", "page 5"], ["๔.๓.๓ สำรองข้อมูล", "รองรับ", "page 6"]] },
    { columns: [300, 150, 150], rows: [header, ["๕.๑ การอบรม", "๓ วัน", "page 7"]] },
  ]);
  const converted = await convertPdfSoc(pdf);
  assert.deepEqual(await sheetRows(converted.xlsx), [
    ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"],
    ["๔.", "๔. การจัดการระบบ", null, null],
    ["๔.๓.๑", "๔.๓.๑ การเริ่มจัดเก็บข้อมูล", "รองรับ", "page 1"],
    [null, "ต่อเนื่องจากข้อบน", "รองรับ", "page 2"],
    ["4.3.2", "4.3.2 Processor 2.5 GHz", "Intel", "page 3"],
    [null, "10 ช่องสัญญาณ", "12", "page 4"],
    [null, "ตามที่กำหนด", "ผู้เสนอ", "page 5"],
    ["๔.๓.๓", "๔.๓.๓ สำรองข้อมูล", "รองรับ", "page 6"],
    ["๕.๑", "๕.๑ การอบรม", "๓ วัน", "page 7"],
  ]);
  assert.deepEqual(converted.rowPages, [1, 1, 1, 1, 1, 2, 2, 3]);
  assert.deepEqual(readSocTable(converted.xlsx).majorItems.map((m) => [m.key, m.rowCount]), [["4", 7], ["5", 1]]);
});

test("an item column is always used: a number at the start of the TOR text never replaces it or fills an empty item cell", async () => {
  const pdf = buildTablePdf([{
    columns: [50, 300, 150],
    rows: [
      ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ"],
      ["๑.๑", "๒.๒ กล้องวงจรปิด", "CASRI"],
      ["", "๑.๒ ต่อจากข้อบน", "CASRI"],
    ],
  }]);
  assert.deepEqual((await sheetRows((await convertPdfSoc(pdf)).xlsx)).slice(1), [
    ["๑.๑", "๒.๒ กล้องวงจรปิด", "CASRI"],
    [null, "๑.๒ ต่อจากข้อบน", "CASRI"],
  ]);
});

test("no item column: major items, the over-60-row split included, are those of the Excel SOC with the same numbers in an item column", async () => {
  const body: [string, string, string][] = [["๔.", "๔. ระบบจัดเก็บ", ""]];
  for (const sub of ["๑", "๒"]) for (let k = 1; k <= 35; k++) body.push([`๔.${sub}.${k}`, `๔.${sub}.${k} ความจุ`, "รองรับ"]);
  body.push(["๕.๑", "๕.๑ การอบรม", "๓ วัน"]);
  const header: TableCell[] = ["ข้อกำหนด TOR", "ข้อเสนอ"];
  const pages: TablePage[] = [];
  for (let start = 0; start < body.length; start += 20) pages.push({ columns: [300, 150], rows: [header, ...body.slice(start, start + 20).map(([, tor, proposal]) => [tor, proposal])] });
  const fromPdf = readSocTable((await convertPdfSoc(buildTablePdf(pages))).xlsx);
  const excel = await buildXlsx([{ name: "SOC", rows: [["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ"], ...body.map((cells) => cells.map((cell) => cell || null))] }]);
  assert.deepEqual(fromPdf.majorItems, readSocTable(excel).majorItems);
  assert.deepEqual(fromPdf.majorItems.map((m) => m.key), ["4.1", "4.2", "5"]);
});
