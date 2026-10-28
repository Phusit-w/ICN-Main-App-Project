// Reads a text PDF TOR ต้นฉบับ for TOR Match (docs/SOC-DOMAIN-GLOSSARY.md
// "TOR Match"): its text layer per page, as lib/soc-tor-match.ts compares it.
// From the prototype (.scratch/tor-match/prototype/FINDINGS.md): Thai
// private-use glyphs are mapped back, a < > + Word drew with a line under it
// is ≤ ≥ ±, the running header and the page counter "(124/149)" are left out,
// and a page that is mostly a picture is a picture page.
// A scanned TOR is read by OCR instead (readScannedTor), and the signature
// block OCR reads differently on each page is left out (scannedTorPages).
import { appendFile, readFile } from "node:fs/promises";
import * as mupdf from "mupdf";
import { pageDrawing, type CellReader } from "@/lib/soc-pdf-soc";
import { thaiText, type TorPage } from "@/lib/soc-tor-match";

const UNREADABLE_PDF = "ไม่สามารถเปิดไฟล์ PDF ของ TOR ต้นฉบับได้ ไฟล์อาจเสีย กรุณาตรวจไฟล์แล้วแนบใหม่";
const LOCKED_PDF = "ไฟล์ PDF ของ TOR ต้นฉบับใส่รหัสผ่านไว้ กรุณาเอารหัสผ่านออกแล้วแนบใหม่";

const UNDERLINED: Record<string, string> = { "<": "≤", ">": "≥", "+": "±" };
const PAGE_COUNTER = /^\([0-9๐-๙]+\/[0-9๐-๙]+\)$/;
const PICTURE_TEXT = 300; // a page with a picture and less text than this (not counting spaces) is a picture page
const NO_TEXT = 20; // a page with less text than this, header included, has no text layer
const HEADER_PAGES = 5; // shorter, a spec line repeated on two pages would pass for a running header

type PageRead = { lines: string[]; hasImage: boolean };

// The TOR's pages from its text layer; `pages` is null when most of the TOR
// is scanned (or it has no text at all): it needs an OCR read (readScannedTor).
export function readTextTor(pdf: Uint8Array): { pageCount: number; pages: TorPage[] | null } {
  let document: mupdf.Document;
  try {
    document = mupdf.Document.openDocument(pdf, "application/pdf");
  } catch {
    throw new Error(UNREADABLE_PDF);
  }
  let read: PageRead[];
  try {
    if (document.needsPassword()) throw new Error(LOCKED_PDF);
    read = [];
    for (let index = 0; index < document.countPages(); index++) {
      const page = document.loadPage(index);
      try {
        read.push(readPage(page));
      } finally {
        page.destroy();
      }
    }
  } catch (error) {
    throw error instanceof Error && error.message === LOCKED_PDF ? error : new Error(UNREADABLE_PDF);
  } finally {
    document.destroy();
  }

  // Running header: a line on more than half of the pages.
  const linePages = new Map<string, number>();
  for (const { lines } of read) for (const line of new Set(lines)) linePages.set(line, (linePages.get(line) ?? 0) + 1);
  const running = read.length >= HEADER_PAGES ? new Set([...linePages].filter(([, n]) => n > read.length / 2).map(([line]) => line)) : new Set<string>();
  const textLength = (lines: string[]) => lines.join("").replace(/\s+/g, "").length;
  const pages = read.map(({ lines, hasImage }) => {
    const own = lines.filter((line) => !running.has(line) && !PAGE_COUNTER.test(line));
    // A drawing page of a text TOR still has the running header; a scanned page has no text at all.
    return { text: own.join("\n"), picture: hasImage && textLength(own) < PICTURE_TEXT, scanned: hasImage && textLength(lines) < NO_TEXT };
  });
  // Most pages a scan, or no text anywhere: an OCR read is needed.
  if (!pages.some((page) => page.text) || pages.filter((page) => page.scanned).length > pages.length / 2) return { pageCount: pages.length, pages: null };
  return { pageCount: pages.length, pages: pages.map(({ text, picture }) => ({ text, picture })) };
}

const PAGE_IMAGE_SIDE = 1800; // pixels on the long side of a page sent to OCR (as the prototype)

// Reads a scanned TOR with the OCR, whole page by whole page (decision 11):
// every page read is saved to `pagesFile` (one JSON line per page) as it
// arrives, so a read that stopped goes on from the saved pages and never sends
// a page twice. `readPage` is the scanned SOC's cell reader, given the page.
export async function readScannedTor(pdf: Uint8Array, pagesFile: string, readPage: CellReader, onPage?: (done: number, total: number) => void | Promise<void>, only?: readonly number[]): Promise<TorPage[]> {
  const saved = await loadPages(pagesFile);
  const document = mupdf.Document.openDocument(pdf, "application/pdf");
  try {
    const total = document.countPages();
    // `only`: the page numbers to read (a build reads its chosen pages); the others are left unread and empty.
    const wanted = only && new Set(only);
    const numbers = Array.from({ length: total }, (_, index) => index + 1).filter((number) => !wanted || wanted.has(number));
    const texts: (string | null)[] = [];
    for (const number of numbers) {
      if (!saved.has(number)) {
        const text = await readPage(pageImage(document, number - 1), { page: number, row: 0, column: 0 });
        await appendFile(pagesFile, `${JSON.stringify({ page: number, text })}\n`);
        saved.set(number, text);
      }
      texts.push(saved.get(number) ?? null);
      await onPage?.(texts.length, numbers.length);
    }
    // Page headers and signature blocks are found among the pages read only.
    const read = scannedTorPages(texts);
    if (!wanted) return read;
    const pages: TorPage[] = Array.from({ length: total }, () => ({ text: "", picture: false }));
    numbers.forEach((number, at) => { pages[number - 1] = read[at]; });
    return pages;
  } finally {
    document.destroy();
  }
}

function pageImage(document: mupdf.Document, index: number): Uint8Array {
  const page = document.loadPage(index);
  try {
    const [x0, y0, x1, y1] = page.getBounds();
    const scale = PAGE_IMAGE_SIDE / Math.max(x1 - x0, y1 - y0);
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      return pixmap.asPNG();
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

async function loadPages(pagesFile: string) {
  const saved = new Map<number, string | null>();
  const content = await readFile(pagesFile, "utf8").catch(() => "");
  // A half-written last line is ended, so the next page saved starts a line of its own.
  if (content && !content.endsWith("\n")) await appendFile(pagesFile, "\n");
  for (const line of content.split("\n")) {
    try {
      const { page, text } = JSON.parse(line) as { page: number; text: string | null };
      saved.set(page, text);
    } catch {
      // The last line may be half-written when the process stopped; that page is read again.
    }
  }
  return saved;
}

const REPEAT_SIMILARITY = 0.8; // OCR reads a signer's name or a page header about this close each time (Apron)
const HEAD_LINES = 3; // a page header lies within this many lines of a page's top
const FOOT_LINES = 8; // a signature block within this many lines of its foot
const DASHED_PAGE_NUMBER = /^[-–]\s*[0-9๐-๙]+\s*[-–]$/; // "- ๑๒ -"
const SIGNER_MARK = /[0-9๐-๙]+\.?\)/g; // "๑.)" or "๓)" before a signer
const wordsOf = (line: string) => line.replace(SIGNER_MARK, " ").split(/[\s()|_]+/).map((word) => word.replace(/[^\p{L}\p{M}]/gu, "")).filter((word) => word.length >= 2);
const lineKey = (line: string) => line.replace(/[^\p{L}\p{M}\p{N}]/gu, "");

// A scanned TOR's pages from the OCR's page texts (null: only a figure, a
// picture page). What OCR reads a little differently on each page is left
// out (Apron: names misread, signers on one line or on three):
// - from a page's top down: a dashed page number, and lines nearly the same
//   as a line at the top of at least a quarter of the pages (a dated header
//   per annex);
// - from its foot up: lines with no number of their own (but a signer's
//   "๑.)") whose words are mostly words found near the foot of more than
//   half of the pages (the signature block).
// A TOR shorter than HEADER_PAGES keeps everything, as readTextTor's running header.
export function scannedTorPages(texts: (string | null)[]): TorPage[] {
  const pageLines = texts.map((text) => (text ?? "").split("\n").map((line) => thaiText(line).trim()).filter(Boolean));
  const n = texts.length;
  const header = repeatedKeys(pageLines.map((lines) => lines.slice(0, HEAD_LINES).map(lineKey)), Math.max(3, Math.ceil(n / 4)));
  const signature = repeatedKeys(pageLines.map((lines) => lines.slice(-FOOT_LINES).flatMap(wordsOf)), Math.floor(n / 2) + 1);
  const headLine = (line: string) => DASHED_PAGE_NUMBER.test(line) || header(lineKey(line));
  const footLine = (line: string) => {
    if (/[0-9๐-๙]/.test(line.replace(SIGNER_MARK, ""))) return false;
    const words = wordsOf(line);
    return words.filter(signature).length >= words.length / 2;
  };
  return pageLines.map((lines, page) => {
    let [start, end] = [0, lines.length];
    while (start < end && start < HEAD_LINES && headLine(lines[start])) start++;
    while (end > start && end > lines.length - FOOT_LINES && footLine(lines[end - 1])) end--;
    return { text: lines.slice(start, end).join("\n"), picture: texts[page] === null };
  });
}

// Whether a key is, give or take an OCR misreading, among the keys of at
// least `minPages` pages. Never for a TOR shorter than HEADER_PAGES.
function repeatedKeys(pages: string[][], minPages: number): (key: string) => boolean {
  const keyPages = new Map<string, Set<number>>();
  pages.forEach((keys, page) => {
    for (const key of keys) if (key) keyPages.set(key, (keyPages.get(key) ?? new Set()).add(page));
  });
  const keys = [...keyPages.keys()];
  const repeated = new Set(pages.length >= HEADER_PAGES ? keys.filter((key) => {
    const found = new Set<number>();
    for (const other of keys) if (similarity(key, other) >= REPEAT_SIMILARITY) for (const page of keyPages.get(other)!) found.add(page);
    return found.size >= minPages;
  }) : []);
  return (key) => repeated.has(key);
}

// 1 - edit distance / longer length; 0 at once when the lengths alone are too far apart.
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > longer * (1 - REPEAT_SIMILARITY)) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return 1 - previous[b.length] / longer;
}

// The page's lines (trimmed, Thai mapped back, no empty ones), and whether it
// has a picture.
function readPage(page: mupdf.Page): PageRead {
  const { horizontal, images } = pageDrawing(page);
  const underlined = (quad: mupdf.Quad) => {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return horizontal.some((line) => line.at >= (y0 + y1) / 2 && line.at <= y1 + 3 && line.from < x1 && line.to > x0);
  };
  const lines: string[] = [];
  let line = "";
  const text = page.toStructuredText("preserve-whitespace");
  try {
    text.walk({
      beginLine() { line = ""; },
      onChar(char, _origin, _font, _size, quad) { line += UNDERLINED[char] && underlined(quad) ? UNDERLINED[char] : char; },
      endLine() {
        const clean = thaiText(line).trim();
        if (clean) lines.push(clean);
      },
    });
  } finally {
    text.destroy();
  }
  return { lines, hasImage: images.length > 0 };
}
