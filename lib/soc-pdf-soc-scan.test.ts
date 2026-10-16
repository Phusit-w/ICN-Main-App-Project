import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { convertPdfSoc, type CellReader } from "@/lib/soc-pdf-soc";
import { buildTablePdf, type RasterTable, type TablePage } from "@/test/pdf-table-fixture";

const HEADER = ["คุณลักษณะที่กำหนด", "ข้อเสนอทางบริษัท", "เอกสารอ้างอิง (หน้า)", "หมายเหตุ"];
const COLUMNS = [380, 220, 190, 120];
const FIGURE = "<figure>";

// A scanned table page: the fixture draws a mark in each cell with text, and
// the fake cell reader answers with that text (a figure for FIGURE).
const scan = (rows: string[][], extra: Partial<RasterTable> = {}): TablePage => ({ columns: [], rows: [], raster: { columns: COLUMNS, rows: [HEADER, ...rows], ...extra } });
const NOT_A_TABLE: TablePage = { columns: [], rows: [], scanned: true }; // a scan with no ruled lines

// Reads the answers from the pages built with `scan`; counts its calls.
function fakeReader(pages: TablePage[]) {
  const calls: { page: number; row: number; column: number }[] = [];
  const readCell: CellReader = async (image, at) => {
    calls.push(at);
    assert.ok(image.length > 0);
    const text = pages[at.page - 1].raster?.rows[at.row]?.[at.column];
    assert.ok(text, `the cell ${JSON.stringify(at)} has no text, so it should not be read`);
    return text === FIGURE ? null : text;
  };
  return { readCell, calls };
}

async function sheetOf(xlsx: Uint8Array) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(xlsx) as unknown as ExcelJS.Buffer);
  const sheet = book.worksheets[0];
  const rows: (string | null)[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => rows.push(Array.from({ length: sheet.getRow(1).cellCount }, (_, i) => row.getCell(i + 1).text || null)));
  return { sheet, rows };
}

test("a scanned PDF SOC: the cells with ink are read, the item number comes from the start of the TOR text, each row knows its page", async () => {
  const pages = [
    scan([["๑. ระบบกล้อง", "", "", ""], ["๑.๑ กล้อง PTZ", "CASRI", "หน้า 3", "ตรง"], ["", "", "", ""]]),
    scan([["๑.๒ เซนเซอร์", "IMX585", "หน้า 9, 10", ""]]),
  ];
  const { readCell, calls } = fakeReader(pages);
  const converted = await convertPdfSoc(buildTablePdf(pages), { readCell });
  assert.deepEqual((await sheetOf(converted.xlsx)).rows, [
    ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง", "หมายเหตุ"],
    ["๑.", "๑. ระบบกล้อง", null, null, null],
    ["๑.๑", "๑.๑ กล้อง PTZ", "CASRI", "หน้า 3", "ตรง"],
    ["๑.๒", "๑.๒ เซนเซอร์", "IMX585", "หน้า 9, 10", null],
  ]);
  assert.deepEqual(converted.rowPages, [1, 1, 2]);
  assert.deepEqual(converted.warnings, []);
  assert.equal(calls.length, 16); // only cells with ink: two headers of 4, then 1 + 4 + 0 and 3
});

test("a table drawn inside a TOR cell stays multi-line text in that cell: one row", async () => {
  const pages = [scan([["๗.๑ ตู้เก็บ\nชุด | จำนวน\nตู้ | ๒", "ตามที่กำหนด", "หน้า 7", ""], ["๗.๒ สาย", "ตามที่กำหนด", "หน้า 8", ""]], { innerTable: { row: 1, column: 0 } })];
  const { readCell } = fakeReader(pages);
  const { rows } = await sheetOf((await convertPdfSoc(buildTablePdf(pages), { readCell })).xlsx);
  assert.equal(rows.length, 3); // the header and two rows: the inner table added no row and no column
  assert.deepEqual(rows[1], ["๗.๑", "๗.๑ ตู้เก็บ\nชุด | จำนวน\nตู้ | ๒", "ตามที่กำหนด", "หน้า 7", null]);
});

test("a cell answered with only a figure: the row stays and the picture is put in its TOR cell", async () => {
  const pages = [scan([["๒.๑ แบบ", "ตามแบบ", "หน้า 5", ""], [FIGURE, "", "หน้า 5", ""]])];
  const { readCell } = fakeReader(pages);
  const { sheet, rows } = await sheetOf((await convertPdfSoc(buildTablePdf(pages), { readCell })).xlsx);
  assert.deepEqual(rows[2], [null, null, null, "หน้า 5", null]);
  const images = sheet.getImages();
  assert.equal(images.length, 1);
  assert.deepEqual([images[0].range.tl.nativeCol, images[0].range.tl.nativeRow], [1, 2]); // TOR column, third sheet row
});

test("a scan whose grid can't be cut is skipped and named; more than half of the table pages uncut refuses the file", async () => {
  const pages = [scan([["๑.๑ กล้อง", "CASRI", "หน้า 3", ""]]), NOT_A_TABLE, scan([["๑.๒ เซนเซอร์", "IMX585", "หน้า 4", ""]])];
  const converted = await convertPdfSoc(buildTablePdf(pages), { readCell: fakeReader(pages).readCell });
  assert.deepEqual(converted.rowPages, [1, 3]);
  assert.deepEqual(converted.warnings, ["หน้า 2 เป็นภาพสแกนที่ตัดตารางไม่ได้ ไม่ได้ตรวจ"]);

  const mostlyUncut = [scan([["๑.๑ กล้อง", "CASRI", "หน้า 3", ""]]), NOT_A_TABLE, NOT_A_TABLE];
  await assert.rejects(convertPdfSoc(buildTablePdf(mostlyUncut), { readCell: fakeReader(mostlyUncut).readCell }), /ตัดตารางจาก PDF แบบสแกนไม่ได้/);
});

test("a PDF with text and scanned table pages is read per page, in page order; the cell reader sees only the scan", async () => {
  const names = ["ลำดับ", "ข้อกำหนด", "ข้อเสนอ", "หมายเหตุ"];
  const pages: TablePage[] = [
    { columns: [60, 300, 200, 160], rows: [names, ["1", "ระบบกล้อง", "CASRI", "ok"]] },
    { columns: [], rows: [], raster: { columns: [70, 380, 250, 200], rows: [names, ["2", "ระบบเรดาร์", "X-band", ""]] } },
  ];
  const { readCell, calls } = fakeReader(pages);
  const converted = await convertPdfSoc(buildTablePdf(pages), { readCell });
  assert.deepEqual((await sheetOf(converted.xlsx)).rows, [
    ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "หมายเหตุ"],
    ["1", "ระบบกล้อง", "CASRI", "ok"],
    ["2", "ระบบเรดาร์", "X-band", null],
  ]);
  assert.deepEqual(converted.rowPages, [1, 2]);
  assert.ok(calls.length > 0 && calls.every((call) => call.page === 2));
});

test("a PDF with no scanned page never calls the cell reader", async () => {
  const pdf = buildTablePdf([{ columns: [60, 300, 200, 160], rows: [["ลำดับ", "ข้อกำหนด", "ข้อเสนอ", "หมายเหตุ"], ["1", "ระบบกล้อง", "CASRI", "ok"]] }]);
  let called = 0;
  const converted = await convertPdfSoc(pdf, { readCell: async () => { called++; return "x"; } });
  assert.equal(called, 0);
  assert.equal(converted.rowPages.length, 1);
});

test("a failure of the cell reader reaches the caller as it is, not as a damaged PDF", async () => {
  const pages = [scan([["๑.๑ กล้อง", "CASRI", "หน้า 3", ""]])];
  await assert.rejects(convertPdfSoc(buildTablePdf(pages), { readCell: async () => { throw new Error("Typhoon down"); } }), { message: "Typhoon down" });
});
