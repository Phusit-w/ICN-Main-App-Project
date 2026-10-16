import { appendFile, readFile } from "node:fs/promises";
import { convertPdfSoc, type CellReader, type PdfSoc } from "@/lib/soc-pdf-soc";

// Reads a scanned PDF SOC (ADR 0010) with every cell the reader returns saved
// to `cellsFile` as it arrives (one JSON line per cell), so a read that stops
// (restart, deploy, a failure) goes on from the saved cells and never reads a
// cell twice. The grid is cut again on each run; that is quick and needs no OCR.
export async function readScannedSoc(
  pdf: Uint8Array,
  cellsFile: string,
  readCell: CellReader,
  onPage?: (done: number, total: number) => void | Promise<void>,
): Promise<PdfSoc> {
  const saved = await loadCells(cellsFile);
  const cached: CellReader = async (image, at) => {
    const key = `${at.page}/${at.row}/${at.column}`;
    if (saved.has(key)) return saved.get(key) ?? null;
    const text = await readCell(image, at);
    await appendFile(cellsFile, `${JSON.stringify({ ...at, text })}\n`);
    saved.set(key, text);
    return text;
  };
  return convertPdfSoc(pdf, { readCell: cached, onPage });
}

async function loadCells(cellsFile: string) {
  const saved = new Map<string, string | null>();
  const lines = (await readFile(cellsFile, "utf8").catch(() => "")).split("\n");
  for (const line of lines) {
    try {
      const { page, row, column, text } = JSON.parse(line) as { page: number; row: number; column: number; text: string | null };
      saved.set(`${page}/${row}/${column}`, text);
    } catch {
      // The last line may be half-written when the process stopped; that cell is read again.
    }
  }
  return saved;
}
