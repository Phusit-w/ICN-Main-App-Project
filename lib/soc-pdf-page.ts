// Renders one page of an evidence PDF to a PNG for the review page's
// evidence panel (ticket 09). A deterministic render with MuPDF (the same
// engine as soc-worker's PyMuPDF), annotations included, so the highlights in
// the vendor's PDF show as they do in a PDF reader. Server-only.
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
