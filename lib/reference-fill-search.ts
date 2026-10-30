// กรอกอ้างอิง, the code step (proposal-build 08): the SOC table and the
// Proposal's Datasheets (text per PDF page) in; per row that needs a
// reference, up to three suggestions (document, PDF page, a matching snippet,
// and where it came from) or ไม่พบ out. Pure: no I/O but `readDatasheetPages`,
// which reads a Datasheet PDF's text layer. Nothing is written to a file.
//
// Two ways to place a row, as the spec has them:
// - เลขข้อกำกับ: the Datasheet page carries the row's item label ("5.3.1")
//   written on it;
// - ค่าสเปก: the page carries the numbers and Latin words of the row's TOR text.
// A row whose reference names a document but no page (title-only) is searched
// only in the document it names. A full reference (it has a page) is never
// touched; heading rows, Image Rows and ไม่ต้องตรวจ major items are left out.
import * as mupdf from "mupdf";
import { nameWords } from "@/lib/reference-fill-text";
import { toArabicDigits } from "@/lib/soc-shared";
import { thaiText } from "@/lib/soc-tor-match";
import type { SocTable, SocTableRow } from "@/lib/soc-table";

export type Datasheet = { id: string; name: string; pages: string[] };
export type SuggestionSource = "label" | "value";
export type Suggestion = { datasheetId: string; page: number; snippet: string; source: SuggestionSource };
// `kind`: what the row's reference cell holds now. `suggestions[0]` is the
// suggestion; the others are its alternatives (at most two).
export type RowSuggestions = {
  position: number; item: string; tor: string; reference: string;
  kind: "empty" | "title_only";
  suggestions: Suggestion[];
  // The only page that carries the row's label: what "รับทั้งหมดที่พบจากเลขข้อกำกับ" accepts.
  certain: boolean;
};

export const MAX_ALTERNATIVES = 2;
const MIN_VALUE_MATCHES = 2;
const MIN_VALUE_SHARE = 0.6;
const NAME_MATCH_SHARE = 0.6; // of a reference's words that a Datasheet's name must carry to be the document it names
const SNIPPET_MAX = 160;

// The same shape the check reads a page out of a reference with.
export const PAGE_PART = /(?:หน้า(?:ที่)?|\bpages?\b\.?|\bpp?\.)\s*\d/i;
const STOP_WORDS = new Set(["with", "than", "from", "that", "this", "type", "least", "support", "supports", "minimum", "maximum", "must", "have", "more", "less", "each", "and", "the", "for"]);

const flat = (text: string) => toArabicDigits(thaiText(text)).toLowerCase();


// The label a row's item number gives to look for on a page: "๕.๓.๑" → "5.3.1".
// A number with no dot ("5", "(1)") is too common on a page to mean anything.
function itemLabel(item: string): string | null {
  const label = toArabicDigits(item).replace(/\s+/g, "").replace(/\.$/, "");
  return /^\d+(?:\.\d+)+$/.test(label) ? label : null;
}

const LABEL_ON_PAGE = /(?<![0-9.])\d+(?:\.\d+)+(?![0-9])/g;

// Numbers (two digits or a decimal) and Latin words of the TOR text that a page can carry.
function valueTokens(tor: string): string[] {
  const text = flat(tor);
  const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => n.length >= 2);
  const words = (text.match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((word) => !STOP_WORDS.has(word));
  return [...new Set([...numbers, ...words])];
}

type PageIndex = { datasheetId: string; page: number; lines: string[]; labels: Set<string>; tokens: Set<string> };

function indexOf(datasheet: Datasheet): PageIndex[] {
  return datasheet.pages.map((text, i) => {
    const lines = toArabicDigits(thaiText(text)).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const joined = lines.join("\n").toLowerCase();
    return {
      datasheetId: datasheet.id, page: i + 1, lines,
      labels: new Set<string>(joined.match(LABEL_ON_PAGE) ?? []),
      tokens: new Set<string>([...(joined.match(/\d+(?:\.\d+)?/g) ?? []), ...(joined.match(/[a-z][a-z0-9-]{3,}/g) ?? [])]),
    };
  });
}

const cut = (line: string) => (line.length > SNIPPET_MAX ? `${line.slice(0, SNIPPET_MAX - 1)}…` : line);

// The line of a page that best shows why it matched: the one carrying the
// label, or else the one with most of the TOR's tokens.
function snippetOf(page: PageIndex, label: string | null, tokens: string[]): string {
  if (label) {
    const line = page.lines.find((candidate) => (candidate.match(LABEL_ON_PAGE) ?? ([] as string[])).includes(label));
    if (line) return cut(line);
  }
  let best = page.lines[0] ?? "";
  let bestCount = -1;
  for (const line of page.lines) {
    const lowered = line.toLowerCase();
    const words = new Set([...(line.match(/\d+(?:\.\d+)?/g) ?? []), ...(lowered.match(/[a-z][a-z0-9-]{3,}/g) ?? [])]);
    const count = tokens.filter((token) => words.has(token)).length;
    if (count > bestCount) { best = line; bestCount = count; }
  }
  return cut(best);
}

// The Datasheets a title-only reference names: those whose path carries enough
// of its words. None when it names nothing the Proposal has.
function namedDatasheets(reference: string, datasheets: Datasheet[]): Datasheet[] {
  const wanted = nameWords(reference);
  if (!wanted.length) return [];
  return datasheets.filter((datasheet) => {
    const own = new Set(nameWords(datasheet.name));
    return wanted.filter((word) => own.has(word)).length / wanted.length >= NAME_MATCH_SHARE;
  });
}

const blank = (reference: string) => !reference.replace(/[\s\-–—_.]/g, "");

export function suggestReferences(table: Pick<SocTable, "rows" | "majorItems">, datasheets: Datasheet[]): RowSuggestions[] {
  const skipped = new Set(table.majorItems.filter((item) => item.skipped).map((item) => item.key));
  const pages = new Map(datasheets.map((datasheet) => [datasheet.id, indexOf(datasheet)]));
  const results: RowSuggestions[] = [];
  table.rows.forEach((row, index) => {
    if (!needsReference(row, table.rows[index + 1], skipped)) return;
    const kind = blank(row.reference) ? "empty" : "title_only";
    const searched = kind === "empty" ? datasheets : namedDatasheets(row.reference, datasheets);
    const { suggestions, certain } = search(row, searched.flatMap((datasheet) => pages.get(datasheet.id) ?? []));
    results.push({ position: row.position, item: row.item, tor: row.tor, reference: row.reference, kind, suggestions, certain });
  });
  return results;
}

// A row to fill: it has TOR text, is not a heading (the next row's item is
// inside it), not in a ไม่ต้องตรวจ major item, and its reference has no page yet.
function needsReference(row: SocTableRow, next: SocTableRow | undefined, skipped: Set<string>): boolean {
  // A row with no item number is a header row or a continuation line, not an item to cite for.
  if (row.image || !row.tor.trim() || !/\d/.test(toArabicDigits(row.item)) || (row.majorItem && skipped.has(row.majorItem))) return false;
  if (!blank(row.reference) && PAGE_PART.test(toArabicDigits(row.reference))) return false;
  const own = itemLabel(row.item) ?? toArabicDigits(row.item).replace(/\s+/g, "").replace(/\.$/, "");
  const later = next ? toArabicDigits(next.item).replace(/\s+/g, "") : "";
  return !(own && later.startsWith(`${own}.`));
}

function search(row: SocTableRow, pages: PageIndex[]): { suggestions: Suggestion[]; certain: boolean } {
  const label = itemLabel(row.item);
  const tokens = valueTokens(row.tor);
  const found: { page: PageIndex; labelled: boolean; share: number }[] = [];
  for (const page of pages) {
    const labelled = label !== null && page.labels.has(label);
    const matched = tokens.filter((token) => page.tokens.has(token)).length;
    const share = tokens.length ? matched / tokens.length : 0;
    const byValue = matched >= MIN_VALUE_MATCHES && share >= MIN_VALUE_SHARE;
    if (labelled || byValue) found.push({ page, labelled, share });
  }
  found.sort((a, b) => Number(b.labelled) - Number(a.labelled) || b.share - a.share);
  const labelled = found.filter((f) => f.labelled);
  return {
    certain: labelled.length === 1,
    suggestions: found.slice(0, 1 + MAX_ALTERNATIVES).map((f) => ({
      datasheetId: f.page.datasheetId, page: f.page.page, source: f.labelled ? "label" : "value",
      snippet: snippetOf(f.page, f.labelled ? label : null, tokens),
    })),
  };
}

// A Datasheet PDF's text per page (PDF page 1 = the first page of the file),
// as `suggestReferences` takes it. An unreadable or locked PDF has no pages.
export function readDatasheetPages(bytes: Uint8Array): string[] {
  let document: mupdf.Document;
  try {
    document = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch {
    return [];
  }
  try {
    if (document.needsPassword()) return [];
    const pages: string[] = [];
    for (let i = 0; i < document.countPages(); i++) {
      const page = document.loadPage(i);
      try {
        const text = page.toStructuredText("preserve-whitespace");
        try { pages.push(text.asText()); } finally { text.destroy(); }
      } finally {
        page.destroy();
      }
    }
    return pages;
  } catch {
    return [];
  } finally {
    document.destroy();
  }
}
