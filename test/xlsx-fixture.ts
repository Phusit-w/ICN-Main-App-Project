// Builds a real .xlsx in memory for tests (ExcelJS writes it, as Excel would).
import ExcelJS from "exceljs";

export type SheetSpec = {
  name: string;
  rows: (string | number | null)[][];
  merges?: string[]; // "A1:C1"
  hidden?: boolean;
  images?: number; // floating pictures on the sheet
};

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export async function buildXlsx(sheets: SheetSpec[]): Promise<Uint8Array<ArrayBuffer>> {
  const book = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const sheet = book.addWorksheet(spec.name, { state: spec.hidden ? "hidden" : "visible" });
    for (const row of spec.rows) sheet.addRow(row);
    for (const range of spec.merges ?? []) sheet.mergeCells(range);
    for (let i = 0; i < (spec.images ?? 0); i++) {
      // ExcelJS's own typing of `buffer` predates Node's generic Buffer.
      const image = book.addImage({ buffer: PNG as unknown as ExcelJS.Buffer, extension: "png" });
      sheet.addImage(image, { tl: { col: 8, row: 1 + i * 3 }, ext: { width: 40, height: 40 } });
    }
  }
  return new Uint8Array(await book.xlsx.writeBuffer() as ArrayBuffer);
}

// The header of the Surat Thani sample: three stacked rows under title lines,
// "ข้อเสนอ" merged over the proposal and the two tick columns.
export const STACKED_HEADER: (string | null)[][] = [
  ["เอกสาร ผนวก ข. / Appendix B"],
  ["2. ตารางเปรียบเทียบคุณสมบัติทางเทคนิค (คุณลักษณะเฉพาะ ตาม ภาคผนวก ก.)"],
  ["ลำดับ", "คุณสมบัติทางเทคนิคตาม TOR", "ข้อเสนอ", null, null, "ชื่อไฟล์เอกสาร/เลขเล่ม/เลขหน้า"],
  [null, null, "คุณสมบัติทางเทคนิคของผู้ยื่นข้อเสนอ", "ตรงข้อกำหนด", "ดีกว่าข้อกำหนด", null],
  [null, null, null, null, null, null],
];
export const STACKED_HEADER_MERGES = ["A2:F2", "C3:E3", "A3:A5", "B3:B5", "C4:C5", "D4:D5", "E4:E5", "F3:F5"];
