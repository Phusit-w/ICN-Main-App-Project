// Reads a text PDF TOR ต้นฉบับ for TOR Match (docs/SOC-DOMAIN-GLOSSARY.md
// "TOR Match"): its text layer per page, as lib/soc-tor-match.ts compares it.
// From the prototype (.scratch/tor-match/prototype/FINDINGS.md): Thai
// private-use glyphs are mapped back, a < > + Word drew with a line under it
// is ≤ ≥ ±, the running header and the page counter "(124/149)" are left out,
// and a page that is mostly a picture is a picture page.
import * as mupdf from "mupdf";
import { pageDrawing } from "@/lib/soc-pdf-soc";
import { thaiText, type TorPage } from "@/lib/soc-tor-match";

export const TOR_IS_SCANNED = "TOR ต้นฉบับนี้เป็น PDF แบบสแกน ตอนนี้แนบได้เฉพาะ PDF ที่มีข้อความ (TOR ต้นฉบับแบบสแกนกำลังพัฒนา)";
const UNREADABLE_PDF = "ไม่สามารถเปิดไฟล์ PDF ของ TOR ต้นฉบับได้ ไฟล์อาจเสีย กรุณาตรวจไฟล์แล้วแนบใหม่";
const LOCKED_PDF = "ไฟล์ PDF ของ TOR ต้นฉบับใส่รหัสผ่านไว้ กรุณาเอารหัสผ่านออกแล้วแนบใหม่";

const UNDERLINED: Record<string, string> = { "<": "≤", ">": "≥", "+": "±" };
const PAGE_COUNTER = /^\([0-9๐-๙]+\/[0-9๐-๙]+\)$/;
const PICTURE_TEXT = 300; // a page with a picture and less text than this (not counting spaces) is a picture page
const NO_TEXT = 20; // a page with less text than this, header included, has no text layer
const HEADER_PAGES = 5; // shorter, a spec line repeated on two pages would pass for a running header

type PageRead = { lines: string[]; hasImage: boolean };

export function readTextTor(pdf: Uint8Array): TorPage[] {
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
  if (!pages.some((page) => page.text) || pages.filter((page) => page.scanned).length > pages.length / 2) throw new Error(TOR_IS_SCANNED);
  return pages.map(({ text, picture }) => ({ text, picture }));
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
