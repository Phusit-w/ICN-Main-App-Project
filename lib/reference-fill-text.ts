// The text กรอกอ้างอิง writes into a SOC's reference cell (proposal-build 09)
// and the read-back guard. Pure. Two Reference Styles, from the team's samples:
// - แบบไทย (MOF RFID), several lines: `เอกสารส่วนที่ 2` / the sub-folder's full
//   name / the file name when that folder holds more than one PDF / `หน้า 3, 6`;
//   several documents are one block each.
// - แบบอังกฤษ (Apron), one line: `CASRI Product Brochure, page 3, 6`; several
//   documents joined by `; `.
// The guard reads every reference it is about to write the way the check's
// reader does (build_evidence_packet.py: the chapter, a dotted folder number,
// at least 60% of a name's words, the page parts) and accepts it only when that
// reading lands on the intended file and pages.
// No server-only import here: the review table (a client component) takes the
// style names from this file.
import { toArabicDigits } from "@/lib/soc-shared";
import { thaiText } from "@/lib/soc-tor-match";

const GENERIC_WORDS = new Set(["เอกสาร", "ส่วนที่", "บทที่", "ภาคผนวก", "หน้า", "ที่", "page", "pages", "pdf", "document", "section"]);

// Words of a reference or a file path that can tell documents apart.
export function nameWords(text: string): string[] {
  const flat = toArabicDigits(thaiText(text)).toLowerCase();
  return [...new Set((flat.match(/[a-z0-9ก-๎]{3,}/g) ?? []).filter((word) => !GENERIC_WORDS.has(word)))];
}

export type ReferenceStyle = "thai" | "english";
export const REFERENCE_STYLES: readonly ReferenceStyle[] = ["thai", "english"];
export const REFERENCE_STYLE_LABELS: Record<ReferenceStyle, string> = { thai: "แบบไทย", english: "แบบอังกฤษ" };

// A Datasheet as the text needs it: its path with the folders kept ("บทที่ 2 …/2.1 …/x.pdf") and its ชื่อที่ใช้อ้างอิง.
export type DocSheet = { id: string; path: string; citationName: string };
export type CitedDocument = { sheet: DocSheet; pages: number[] };

const NAME_MATCH_SHARE = 0.6;
const DEFAULT_WORDING = "เอกสารส่วนที่";
const MAX_RANGE = 1000;

// [3, 6, 12, 13] → "3, 6, 12-13"
export function formatPages(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return parts.join(", ");
}

const PAGE_PARTS = /(?:หน้า(?:ที่)?|\bpages?\b\.?|\bpp?\.)\s*(\d+(?:\s*(?:,|-|–|และ|and|&)\s*\d+)*)/gi;

// Every page the text cites: "หน้า 3, 6" → [3, 6], "page 12-13" → [12, 13].
export function citedPages(text: string): number[] {
  const pages = new Set<number>();
  for (const match of toArabicDigits(text).matchAll(PAGE_PARTS)) {
    const list = match[1].replace(/\s+/g, "").replace(/–/g, "-").split(/,|และ|and|&/).filter(Boolean);
    for (const item of list) {
      const [from, to] = item.split("-").map(Number);
      if (to === undefined || Number.isNaN(to)) pages.add(from);
      else for (let page = from; page <= Math.min(to, from + MAX_RANGE); page++) pages.add(page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- the style

const THAI_LETTER = /[฀-๿]/g;
const LATIN_LETTER = /[A-Za-z]/g;

// From the references the SOC already has (Thai page words → แบบไทย, `page` →
// แบบอังกฤษ; the more common wins, a tie goes to แบบไทย), else from the
// language of the TOR text.
export function guessReferenceStyle(rows: readonly { reference: string; tor: string }[]): ReferenceStyle {
  let thai = 0;
  let english = 0;
  for (const { reference } of rows) {
    if (/หน้า/.test(reference)) thai += 1;
    else if (/\bpages?\b/i.test(reference)) english += 1;
  }
  if (thai || english) return thai >= english ? "thai" : "english";
  const tor = rows.map((row) => row.tor).join(" ");
  return (tor.match(THAI_LETTER)?.length ?? 0) >= (tor.match(LATIN_LETTER)?.length ?? 0) / 2 ? "thai" : "english";
}

// The word the SOC's own references put before the chapter number ("ส่วนที่",
// "บทที่"), else เอกสารส่วนที่.
export function chapterWording(references: readonly string[]): string {
  for (const reference of references) {
    const word = /(เอกสารส่วนที่|เอกสารบทที่|ส่วนที่|บทที่)\s*\d/.exec(reference)?.[1];
    if (word) return word;
  }
  return DEFAULT_WORDING;
}

// ---------------------------------------------------------------- the text

const folderOf = (sheet: DocSheet) => sheet.path.split("/").slice(0, -1);
const fileStem = (sheet: DocSheet) => (sheet.path.split("/").pop() ?? sheet.path).replace(/\.pdf$/i, "");
const TOP_NUMBER = /^(?:เอกสาร)?(?:บทที่|ส่วนที่)?\s*(\d+)(?=[\s.\-:]|$)/;
const chapterOf = (sheet: DocSheet) => {
  const top = folderOf(sheet)[0];
  return top === undefined ? null : TOP_NUMBER.exec(toArabicDigits(top))?.[1] ?? null;
};

// The lines of one document's block. `all`: every live Datasheet, to know
// whether the folder holds more than one PDF.
function thaiBlock({ sheet, pages }: CitedDocument, all: readonly DocSheet[], wording: string, forceFileName: boolean): string[] {
  const folders = folderOf(sheet);
  const lines: string[] = [];
  const chapter = chapterOf(sheet);
  if (chapter !== null) lines.push(`${wording} ${chapter}`);
  const sub = chapter !== null ? (folders.length >= 2 ? folders[folders.length - 1] : null) : (folders.at(-1) ?? null);
  if (sub) lines.push(sub);
  if (forceFileName || all.filter((other) => folderOf(other).join("/") === folders.join("/")).length > 1) lines.push(fileStem(sheet));
  lines.push(`หน้า ${formatPages(pages)}`);
  return lines;
}

// A new reference. `blocks`: one array of lines per document.
export function referenceBlocks(style: ReferenceStyle, documents: readonly CitedDocument[], all: readonly DocSheet[], wording = DEFAULT_WORDING, forceFileName = false): string[][] {
  if (style === "thai") return documents.map((document) => thaiBlock(document, all, wording, forceFileName));
  return documents.map(({ sheet, pages }) => [`${sheet.citationName}, page ${formatPages(pages)}`]);
}

export const referenceText = (style: ReferenceStyle, blocks: string[][]) => blocks.map((block) => block.join("\n")).join(style === "thai" ? "\n" : "; ");

// What a title-only reference gets: Thai a new line `หน้า N`, English `, page N`.
export function pageAddition(style: ReferenceStyle, pages: readonly number[]): string {
  return style === "thai" ? `หน้า ${formatPages(pages)}` : `, page ${formatPages(pages)}`;
}

// ---------------------------------------------------------------- the guard

const HEADING_LINE = /^(?:เอกสาร)?(?:ส่วนที่|บทที่)\s*\d+\s*$/;
const DOTTED_LINE = /^(\d+(?:\.\d+)+)(?![\d.])/;

function share(wanted: string[], own: Set<string>): number {
  return wanted.length ? wanted.filter((word) => own.has(word)).length / wanted.length : 0;
}

// Which Datasheets the check's reader would find in one reference block (the
// text of one document): none or several when it is not clear.
function readBlock(text: string, sheets: readonly DocSheet[]): { sheets: DocSheet[]; pages: number[] } {
  const lines = toArabicDigits(text).split(/\n|;/).map((line) => line.trim()).filter(Boolean);
  const pages = citedPages(text);
  let found = [...sheets];
  const chapter = /(?:ส่วนที่|บทที่)\s*(\d+)/.exec(toArabicDigits(text))?.[1];
  if (chapter) found = found.filter((sheet) => chapterOf(sheet) === chapter);
  for (const line of lines) {
    if (HEADING_LINE.test(line)) continue;
    const code = DOTTED_LINE.exec(line)?.[1];
    if (code) {
      found = found.filter((sheet) => folderOf(sheet).some((folder) => /^\d+(?:\.\d+)*/.exec(toArabicDigits(folder))?.[0] === code));
      continue;
    }
    const words = nameWords(line.replace(PAGE_PARTS, " "));
    if (!words.length) continue; // a page line
    found = found.filter((sheet) => share(words, new Set(nameWords(sheet.path))) >= NAME_MATCH_SHARE);
  }
  return { sheets: found, pages };
}

// Null when `text` (one document's block) reads back to exactly `intended` and
// its pages; otherwise why not, in Thai.
export function readBackProblem(text: string, intended: CitedDocument, sheets: readonly DocSheet[]): string | null {
  const read = readBlock(text, sheets);
  if (!read.pages.length) return "อ่านกลับแล้วไม่พบเลขหน้า";
  if (read.pages.join(",") !== [...new Set(intended.pages)].sort((a, b) => a - b).join(",")) return `อ่านกลับแล้วได้หน้า ${formatPages(read.pages)} ไม่ตรงกับหน้า ${formatPages(intended.pages)}`;
  if (read.sheets.length === 1 && read.sheets[0].id === intended.sheet.id) return null;
  return read.sheets.length === 0 ? "อ่านกลับแล้วไม่พบไฟล์ที่เลือก" : `อ่านกลับแล้วชี้ได้ ${read.sheets.length} ไฟล์ ไม่ชัดว่าเป็นไฟล์ไหน`;
}
