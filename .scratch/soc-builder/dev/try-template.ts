// DEV ONLY: tries a real SOC Template with the builder, on Apron's cached OCR text (TOR pages 13-39).
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/try-template.ts <template.docx> <out.docx>
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSocTemplate, buildSocDraft } from "@/lib/soc-builder";
import { scannedTorPages } from "@/lib/soc-tor-read";

const [template, out] = process.argv.slice(2);
const short = path.resolve(".scratch/soc-builder/dev/_template.docx"); // example paths pass MAX_PATH
copyFileSync(`\\\\?\\${template}`, short);
const bytes = readFileSync(short);
try {
  assertSocTemplate(bytes);
  console.log("template contract: OK");
} catch (error) {
  console.log("template contract: REFUSED -", (error as Error).message);
  process.exit(0);
}
const dir = path.resolve(".scratch/tor-match/prototype/ocr/apron");
const pages = scannedTorPages(readdirSync(dir).filter((n) => /^page-\d+\.txt$/.test(n)).sort().map((n) => readFileSync(path.join(dir, n), "utf8")));
try {
  const draft = buildSocDraft(bytes, pages, [[Number(process.argv[4] ?? 13), Number(process.argv[5] ?? 39)]]);
  writeFileSync(out, draft.bytes);
  console.log(`built ${draft.rowCount} rows, ${draft.warnings.length} warnings ->`, out);
} catch (error) {
  console.log("build FAILED -", (error as Error).message);
}
