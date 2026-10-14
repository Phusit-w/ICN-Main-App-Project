// Renders one page of an evidence PDF to a PNG for the review page's
// evidence panel (ticket 09), and of a PDF SOC for its "ดูหน้า PDF SOC"
// (soc-pdf-soc ticket 04). A deterministic render with MuPDF (the same
// engine as soc-worker's PyMuPDF), annotations included, so the highlights in
// the vendor's PDF show as they do in a PDF reader. Server-only.
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import * as mupdf from "mupdf";

// About 1200 px wide for an A4 page, never more than 2× the page's own size,
// and never more than ~6 megapixels however tall or wide the page is.
const TARGET_WIDTH_PX = 1200;
const MAX_SCALE = 2;
const MAX_PIXELS = 6_000_000;

export type PdfPageRender =
  | { ok: true; png: Uint8Array; pageCount: number }
  | { ok: false; reason: "unreadable" }
  | { ok: false; reason: "no_such_page"; pageCount: number | null };

export function renderPdfPage(bytes: Uint8Array, pageNumber: number): PdfPageRender {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return { ok: false, reason: "no_such_page", pageCount: null };
  let document: mupdf.Document;
  try {
    document = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  try {
    const pageCount = document.countPages();
    if (pageCount < 1) return { ok: false, reason: "unreadable" };
    if (pageNumber > pageCount) return { ok: false, reason: "no_such_page", pageCount };
    const page = document.loadPage(pageNumber - 1);
    try {
      const [x0, y0, x1, y1] = page.getBounds();
      const width = Math.max(1, x1 - x0);
      const height = Math.max(1, y1 - y0);
      const scale = Math.min(MAX_SCALE, TARGET_WIDTH_PX / width, Math.sqrt(MAX_PIXELS / (width * height)));
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      try {
        return { ok: true, png: pixmap.asPNG(), pageCount };
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    document.destroy();
  }
}

// Page `page` (as the route was asked for it) of the stored PDF at
// `filePath`, as the review page's PNG response. A page the PDF doesn't have
// answers 404 and a PDF that can't be read answers 422, each with a Thai
// message naming the file as `name`.
export async function pdfPageResponse(filePath: string, name: string, page: string): Promise<NextResponse> {
  const unreadable = NextResponse.json({ error: `อ่านไฟล์ ${name} ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่ PDF` }, { status: 422 });
  const pageNumber = /^\d{1,5}$/.test(page) ? Number(page) : NaN;
  let bytes: Uint8Array;
  try {
    bytes = await readFile(filePath);
  } catch {
    return unreadable;
  }
  const rendered = renderPdfPage(bytes, pageNumber);
  if (!rendered.ok && rendered.reason === "unreadable") return unreadable;
  if (!rendered.ok) {
    const total = rendered.pageCount ? ` (ไฟล์นี้มีทั้งหมด ${rendered.pageCount} หน้า)` : "";
    return NextResponse.json({ error: `ไม่พบหน้า ${page} ใน ${name}${total}` }, { status: 404 });
  }
  return new NextResponse(Buffer.from(rendered.png), {
    headers: {
      "Content-Type": "image/png",
      // The file behind a document never changes, so a viewer paging back
      // and forth needn't re-render it; private keeps it off shared caches,
      // and 5 minutes bounds how long a revoked user still sees it.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
