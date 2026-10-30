// Writes references into the reference cells of a SOC file (proposal-build 09),
// leaving everything else in the file as it is: Word stays Word (only the cell's
// paragraphs change, in the look of the cell's own text), Excel stays Excel
// (only the cell changes). Where a cell is comes from the SOC table reader's
// `referenceAt` (lib/soc-table.ts). Pure: bytes in, bytes out.
import type { ReferenceAt } from "@/lib/soc-table";
import { readZip, writeZip, type ZipEntry } from "@/lib/zip";

// `set`: an empty cell takes `lines` (a paragraph each). `append-lines`: a
// title-only cell keeps its text and gets `lines` after it, a paragraph each.
// `append-inline`: it keeps its text and gets `lines[0]` right after it.
// `existing`: the cell's text as the reader gave it (an Excel cell is rewritten whole).
export type ReferenceEdit = { at: ReferenceAt; mode: "set" | "append-lines" | "append-inline"; lines: string[]; existing: string };

const WORD_DOCUMENT = "word/document.xml";
export const CANNOT_WRITE = "เขียนอ้างอิงลงไฟล์ SOC นี้ไม่ได้ ไม่พบช่องอ้างอิงของแถวที่เลือกในไฟล์";

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function writeReferences(soc: Uint8Array, edits: readonly ReferenceEdit[]): Uint8Array<ArrayBuffer> {
  const entries = readZip(soc);
  const replace = (name: string, change: (xml: string) => string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(CANNOT_WRITE);
    entry.data = Buffer.from(change(entry.data.toString("utf8")), "utf8");
  };
  const word = edits.flatMap((edit) => (edit.at.kind === "word" ? [{ ...edit, at: edit.at }] : []));
  if (word.length) replace(WORD_DOCUMENT, (xml) => writeWordCells(xml, word));
  const parts = new Set(edits.flatMap((edit) => (edit.at.kind === "excel" ? [edit.at.part] : [])));
  for (const part of parts) {
    replace(part, (xml) => edits.reduce((current, edit) => (edit.at.kind === "excel" && edit.at.part === part ? writeExcelCell(current, edit.at.row, edit.at.column, excelText(edit)) : current), xml));
  }
  return writeZip(entries as readonly ZipEntry[]);
}

// ---------------------------------------------------------------- Word

type Span = { start: number; end: number };
type TableSpan = Span & { rows: (Span & { cells: Span[] })[] };

// The top-level tables of the document with their rows and cells, in order
// (the reader counts the same ones; a table nested in a cell is part of it).
function scanTables(xml: string): TableSpan[] {
  const tables: TableSpan[] = [];
  const open: { tag: string; start: number }[] = [];
  let depth = 0;
  for (const match of xml.matchAll(/<(\/?)w:(tbl|tr|tc)(?=[\s/>])[^>]*?(\/?)>/g)) {
    const [text, closing, tag, selfClosing] = match;
    if (selfClosing) continue;
    const at = match.index!;
    if (!closing) {
      open.push({ tag, start: at });
      if (tag === "tbl") {
        depth += 1;
        if (depth === 1) tables.push({ start: at, end: at, rows: [] });
      } else if (depth === 1) {
        const table = tables[tables.length - 1];
        if (tag === "tr") table.rows.push({ start: at, end: at, cells: [] });
        else table.rows[table.rows.length - 1]?.cells.push({ start: at, end: at });
      }
      continue;
    }
    const opened = open.pop();
    if (!opened) continue;
    const end = at + text.length;
    if (tag === "tbl") {
      if (depth === 1) tables[tables.length - 1].end = end;
      depth -= 1;
    } else if (depth === 1) {
      const table = tables[tables.length - 1];
      const row = table.rows[table.rows.length - 1];
      if (tag === "tr") row.end = end;
      else row.cells[row.cells.length - 1].end = end;
    }
  }
  return tables;
}

const paragraph = (pPr: string, rPr: string, line: string) => `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;

function writeWordCell(cell: string, { mode, lines }: Pick<ReferenceEdit, "mode" | "lines">): string {
  const openEnd = cell.indexOf(">") + 1;
  const innerEnd = cell.lastIndexOf("</w:tc>");
  const inner = cell.slice(openEnd, innerEnd);
  const tcPr = /^\s*(<w:tcPr>[\s\S]*?<\/w:tcPr>|<w:tcPr\b[^>]*\/>)/.exec(inner)?.[1] ?? "";
  const body = inner.slice(inner.indexOf(tcPr) + tcPr.length);
  // The look of the cell's own text: the last paragraph's properties and its last run's.
  const paragraphs = body.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  const last = paragraphs[paragraphs.length - 1] ?? "";
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(last)?.[0] ?? "";
  const rPr = [...last.matchAll(/<w:rPr>[\s\S]*?<\/w:rPr>/g)].pop()?.[0] ?? "";
  const added = lines.map((line) => paragraph(pPr, rPr, line)).join("");
  let content: string;
  if (mode === "set") content = tcPr + added;
  else if (mode === "append-lines") content = tcPr + body + added;
  else {
    const run = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(lines[0] ?? "")}</w:t></w:r>`;
    const at = body.lastIndexOf("</w:p>");
    content = tcPr + (at < 0 ? body + paragraph(pPr, rPr, lines[0] ?? "") : body.slice(0, at) + run + body.slice(at));
  }
  return cell.slice(0, openEnd) + content + cell.slice(innerEnd);
}

function writeWordCells(xml: string, edits: readonly (ReferenceEdit & { at: Extract<ReferenceAt, { kind: "word" }> })[]): string {
  const tables = scanTables(xml);
  const located = edits.map((edit) => {
    const cell = tables[edit.at.table]?.rows[edit.at.row]?.cells[edit.at.cell];
    if (!cell) throw new Error(CANNOT_WRITE);
    return { cell, edit };
  }).sort((a, b) => b.cell.start - a.cell.start);
  let out = xml;
  for (const { cell, edit } of located) out = out.slice(0, cell.start) + writeWordCell(out.slice(cell.start, cell.end), edit) + out.slice(cell.end);
  return out;
}

// ---------------------------------------------------------------- Excel

const columnLetters = (column: number) => {
  let letters = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
};
const columnIndex = (letters: string) => [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;

function excelText({ mode, lines, existing }: ReferenceEdit): string {
  if (mode === "set") return lines.join("\n");
  return mode === "append-lines" ? `${existing}\n${lines.join("\n")}` : existing + (lines[0] ?? "");
}

// The cell takes `text` as an inline string, in its own style. A missing cell is added in column order.
function writeExcelCell(xml: string, row: number, column: number, text: string): string {
  const rowStart = new RegExp(`<row\\b[^>]*?\\sr="${row + 1}"[^>]*?(/?)>`).exec(xml);
  if (!rowStart || rowStart[1]) throw new Error(CANNOT_WRITE);
  const bodyStart = rowStart.index + rowStart[0].length;
  const bodyEnd = xml.indexOf("</row>", bodyStart);
  if (bodyEnd < 0) throw new Error(CANNOT_WRITE);
  const body = xml.slice(bodyStart, bodyEnd);
  const ref = `${columnLetters(column)}${row + 1}`;
  const make = (style: string) => `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
  let insertAt = body.length;
  for (const cell of body.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const letters = /\sr="([A-Z]+)\d+"/.exec(cell[0])?.[1];
    if (!letters) throw new Error(CANNOT_WRITE);
    const at = columnIndex(letters);
    if (at < column) continue;
    if (at > column) { insertAt = cell.index!; break; }
    const style = /\ss="(\d+)"/.exec(cell[0].slice(0, cell[0].indexOf(">")))?.[1];
    const made = make(style ? ` s="${style}"` : "");
    return xml.slice(0, bodyStart + cell.index!) + made + xml.slice(bodyStart + cell.index! + cell[0].length);
  }
  return xml.slice(0, bodyStart + insertAt) + make("") + xml.slice(bodyStart + insertAt);
}
