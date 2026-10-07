// Builds small PDFs in memory for tests, and reads pixels back from a PNG,
// both with mupdf (the library the app renders evidence pages with).
import * as mupdf from "mupdf";

// A PDF of `pages` blank A6-ish pages; each highlight is a yellow Highlight
// annotation on one page (1-based), as [x0, y0, x1, y1] from the top left.
export function buildPdf(pages: number, highlights: { page: number; rect: [number, number, number, number] }[] = []): Uint8Array<ArrayBuffer> {
  const doc = new mupdf.PDFDocument();
  for (let i = 0; i < pages; i++) doc.insertPage(-1, doc.addPage([0, 0, 300, 400], 0, {}, ""));
  for (const { page, rect: [x0, y0, x1, y1] } of highlights) {
    const annot = doc.loadPage(page - 1).createAnnotation("Highlight");
    annot.setQuadPoints([[x0, y0, x1, y0, x0, y1, x1, y1]]);
    annot.setColor([1, 1, 0]);
    annot.update();
  }
  return new Uint8Array(doc.saveToBuffer("").asUint8Array());
}

// The RGB colour at (x, y) of a PNG.
export function pixelAt(png: Uint8Array, x: number, y: number): [number, number, number] {
  const pixmap = new mupdf.Image(png).toPixmap();
  const at = y * pixmap.getStride() + x * (pixmap.getStride() / pixmap.getWidth());
  const pixels = pixmap.getPixels();
  return [pixels[at], pixels[at + 1], pixels[at + 2]];
}

export function pngSize(png: Uint8Array): { width: number; height: number } {
  const pixmap = new mupdf.Image(png).toPixmap();
  return { width: pixmap.getWidth(), height: pixmap.getHeight() };
}
