// Writing references into a SOC file (proposal-build 09), seam C: Word keeps the
// look of its cells, Excel keeps its styles, a file written reads back through the
// SOC table reader with the same rows, and a cell that is not there is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDocx, buildSocDocx } from "@/test/docx-fixture";
import { buildXlsx } from "@/test/xlsx-fixture";
import { readSocTable } from "@/lib/soc-table";
import { CANNOT_WRITE, writeReferences } from "@/lib/soc-reference-write";
import { readZip } from "@/lib/zip";

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เอกสารอ้างอิง"];
const rows = [HEADER, ["5", "ระบบ", "", ""], ["5.1", "กล้อง 4K", "", ""], ["5.2", "แหล่งจ่ายไฟ", "", "Power Datasheet"], ["5.3", "พัดลม", "", "Lens หน้า 7"]];

test("a Word SOC: an empty cell takes the lines, a title-only cell keeps its text and takes more; other rows and the row count stay", () => {
  const soc = buildSocDocx(rows);
  const table = readSocTable(soc);
  const at = (item: string) => table.rows.find((row) => row.item === item)!.referenceAt!;
  const out = writeReferences(soc, [
    { at: at("5.1"), mode: "set", lines: ["เอกสารส่วนที่ 2", "2.1 กล้อง", "หน้า 3"], existing: "" },
    { at: at("5.2"), mode: "append-lines", lines: ["หน้า 4"], existing: "Power Datasheet" },
  ]);
  const back = readSocTable(out);
  assert.equal(back.rows.length, table.rows.length);
  assert.deepEqual(back.rows.map((row) => row.reference), ["เอกสารอ้างอิง", "", "เอกสารส่วนที่ 2 2.1 กล้อง หน้า 3", "Power Datasheet หน้า 4", "Lens หน้า 7"]);
  assert.deepEqual(back.rows.map((row) => row.tor), table.rows.map((row) => row.tor), "nothing else changed");
});

test("a Word cell keeps its look: the cell's properties, the paragraph's and the run's", () => {
  const cell = (inner: string) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
  const text = (value: string) => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
  const styled = (value: string) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${value}</w:t></w:r></w:p>`;
  const body = `<w:tbl><w:tblPr/>${[
    [text("ลำดับ"), text("ข้อกำหนด TOR"), text("ข้อเสนอ"), text("เอกสารอ้างอิง")],
    [text("5.1"), text("กล้อง"), text(""), styled("")],
    [text("5.2"), text("ไฟ"), text(""), styled("Power Datasheet")],
  ].map((cells) => `<w:tr>${cells.map(cell).join("")}</w:tr>`).join("")}</w:tbl>`;
  const soc = buildDocx(body);
  const table = readSocTable(soc);
  const out = writeReferences(soc, [
    { at: table.rows[1].referenceAt!, mode: "set", lines: ["หน้า 3"], existing: "" },
    { at: table.rows[2].referenceAt!, mode: "append-inline", lines: [", page 4"], existing: "Power Datasheet" },
  ]);
  const xml = readZip(out).find((entry) => entry.name === "word/document.xml")!.data.toString("utf8");
  assert.match(xml, /<w:tcPr><w:tcW w:w="2000" w:type="dxa"\/><\/w:tcPr><w:p><w:pPr><w:jc w:val="center"\/><\/w:pPr><w:r><w:rPr><w:b\/><w:sz w:val="28"\/><\/w:rPr><w:t xml:space="preserve">หน้า 3<\/w:t>/);
  assert.match(xml, /Power Datasheet<\/w:t><\/w:r><w:r><w:rPr><w:b\/><w:sz w:val="28"\/><\/w:rPr><w:t xml:space="preserve">, page 4<\/w:t><\/w:r><\/w:p>/);
  assert.deepEqual(readSocTable(out).rows.map((row) => row.reference), ["เอกสารอ้างอิง", "หน้า 3", "Power Datasheet, page 4"]);
});

test("text with & and < is written escaped", () => {
  const soc = buildSocDocx(rows);
  const table = readSocTable(soc);
  const out = writeReferences(soc, [{ at: table.rows[2].referenceAt!, mode: "set", lines: ["R&D <Plan>, page 1"], existing: "" }]);
  assert.equal(readSocTable(out).rows[2].reference, "R&D <Plan>, page 1");
});

test("an Excel SOC: the cell takes the text in its own style, a cell that is not there is added, an existing title is kept", async () => {
  const soc = await buildXlsx([{ name: "SOC", rows: [HEADER, ["5", "ระบบ", null, null], ["5.1", "กล้อง 4K", null, null], ["5.2", "แหล่งจ่ายไฟ", "", "Power Datasheet"]] }]);
  const table = readSocTable(soc);
  assert.equal(table.rows[1].referenceAt?.kind, "excel");
  const out = writeReferences(soc, [
    { at: table.rows[1].referenceAt!, mode: "set", lines: ["CASRI Product brochure, page 1"], existing: "" },
    { at: table.rows[2].referenceAt!, mode: "append-inline", lines: [", page 4"], existing: "Power Datasheet" },
  ]);
  const back = readSocTable(out);
  assert.equal(back.rows.length, table.rows.length);
  assert.deepEqual(back.rows.map((row) => row.reference), ["", "CASRI Product brochure, page 1", "Power Datasheet, page 4"]);
  assert.deepEqual(back.rows.map((row) => row.tor), table.rows.map((row) => row.tor));
});

test("a cell that is not in the file is refused", () => {
  const soc = buildSocDocx(rows);
  assert.throws(() => writeReferences(soc, [{ at: { kind: "word", table: 0, row: 99, cell: 3 }, mode: "set", lines: ["x"], existing: "" }]), { message: CANNOT_WRITE });
});
