// DEV ONLY, not shipped (SOC Builder ticket 02): builds a SOC from the MEA (text),
// MOF and Apron (scanned, TOR Match's cached OCR text) TORs with lib/soc-builder.ts
// and compares the draft with each set's real SOC: rows, item numbers, text.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/measure-split.ts [set]
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSocDraft, type PageRange } from "@/lib/soc-builder";
import { normalItem } from "@/lib/soc-major-items";
import { readSocTable, type SocTableRow } from "@/lib/soc-table";
import { ANNEX_LINE, thaiText, type TorPage } from "@/lib/soc-tor-match";
import { readTextTor, scannedTorPages } from "@/lib/soc-tor-read";
import { toArabicDigits } from "@/lib/soc-shared";
import { buildSocDocx } from "@/test/docx-fixture";

const examples = path.resolve("..", "Example SOC+TOR+Datasheet");
const ocr = path.resolve(".scratch/tor-match/prototype/ocr");
const short = path.resolve(".scratch/soc-builder/dev/_real-soc.docx"); // example paths pass MAX_PATH
const apron = path.join(examples, "4. DOAXXX_Apron_ท่าอากาศยานสุราษฎร์ธานี (Re-bidding)", "Proposal A");
const apronDir = readdirSync(apron).find((name) => name.startsWith("2."))!;
const mea = path.join(examples, "2. MEA_จัดระเบียบสายสาธารณูปโภคฯ Y69");

const ocrPages = (dir: string) => scannedTorPages(readdirSync(dir).filter((n) => /^page-\d+\.txt$/.test(n)).sort().map((n) => readFileSync(path.join(dir, n), "utf8")));

type Set = { name: string; soc: string; pages: () => TorPage[]; ranges: (pages: TorPage[]) => PageRange[] };
const sets: Set[] = [
  {
    name: "MEA Y69 (text, ผนวก 7-21)",
    soc: path.join(mea, "Proposal", "บทที่ 3 ตารางเปรียบเทียบรายละเอียดที่เสนอตามข้อกำหนด", "S5_SOC_MEA_จัดระเบียบสาย Y69_ผนวก 7 - ผนวก 21_R1.docx"),
    pages: () => readTextTor(readFileSync(path.join(mea, "Attach_TOR_1.pdf"))).pages!,
    ranges: (pages) => {
      // From the last "ผนวก 7" heading line to the page before "ผนวก 22" (or the end).
      const heads = pages.flatMap((p, i) => thaiText(p.text).split("\n").flatMap((l) => { const m = ANNEX_LINE.exec(l); return m ? [[Number(toArabicDigits(m[1])), i + 1]] : []; }));
      console.log("  annex heading pages:", heads.map(([n, p]) => `${n}@${p}`).join(" "));
      const from = heads.findLast(([n]) => n === 7)![1];
      const next = heads.find(([n, p]) => n >= 22 && p > from);
      return [[from, next ? next[1] - 1 : pages.length]];
    },
  },
  {
    name: "MOF RFID (scanned, OCR)",
    soc: path.join(examples, "MOF_RFID", "บทที่ 5 ตารางเปรียบเทียบรายละเอียดคุณลักษณะเฉพาะ", "ICN_ตารางเปรียบเทียบรายละเอียดคุณลักษณะเฉพ.docx"),
    pages: () => ocrPages(path.join(ocr, "mof")),
    ranges: (pages) => [[1, pages.length]],
  },
  {
    name: "Apron (scanned, OCR, TOR pages 13-39)",
    soc: path.join(apron, apronDir, readdirSync(path.join(apron, apronDir)).find((n) => n.endsWith(".docx"))!),
    pages: () => ocrPages(path.join(ocr, "apron")),
    ranges: () => [[13, 39]],
  },
];

// ---- text comparison
const letters = (text: string) => toArabicDigits(thaiText(text).normalize("NFKC")).toLowerCase().replace(/[^\p{L}\p{M}\p{N}<>≤≥±+=%]/gu, "");
const spaced = (text: string) => thaiText(text).replace(/\s+/g, "");
const kind = (built: string, real: string) => {
  if (spaced(built) === spaced(real)) return "exact";
  const [a, b] = [letters(built), letters(real)];
  if (a === b) return "format";
  if (a && b && (a.includes(b) || b.includes(a))) return "contained";
  return "different";
};

// ---- item alignment: longest common subsequence of item numbers
const key = (row: SocTableRow) => normalItem(row.item) || (/^ผนวก/.test(row.tor) ? `annex:${toArabicDigits(row.tor.match(/ผนวก\s*([0-9๐-๙]+)/)?.[1] ?? "")}` : "");
function lcs(a: string[], b: string[]): [number, number][] {
  const t = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) { out.push([i++, j++]); } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
  }
  return out;
}

const only = process.argv[2];
const template = buildSocDocx([["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิง", "หมายเหตุ"], ["", "", "", "", ""]]);
for (const set of sets) {
  if (only && !set.name.toLowerCase().includes(only.toLowerCase())) continue;
  console.log(`\n=== ${set.name}`);
  copyFileSync(`\\\\?\\${set.soc}`, short);
  // Real rows the builder is meant to make: dotted items, ผนวก headings, and "N." rows
  // that are a major item's heading (or, in a ผนวก SOC, any "N." row). Sub-lists "(1)", "1)"
  // and list rows inside an item stay inside their parent by design (spec decision 6).
  const all = readSocTable(readFileSync(short)).rows.filter((row) => key(row));
  const annexed = all.some((row) => key(row).startsWith("annex:"));
  const seen = new Set<string>();
  const real = all.filter((row) => {
    const k = key(row);
    if (k.startsWith("annex:") || k.includes(".") && /^\d+(\.\d+)+$/.test(k)) return true;
    if (!/^\d+$/.test(k)) return false;
    if (annexed) return true;
    const heading = row.majorItem?.split(".")[0] === k && !seen.has(k);
    seen.add(k);
    return heading;
  });
  console.log(`  real rows ${all.length}, of them item rows ${real.length}`);
  const pages = set.pages();
  const ranges = set.ranges(pages);
  console.log(`  TOR pages ${pages.length}, range ${ranges.map((r) => r.join("-")).join(", ")}`);
  const started = performance.now();
  let draft;
  try {
    draft = buildSocDraft(template, pages, ranges);
  } catch (error) {
    console.log("  BUILD ERROR:", (error as Error).message);
    continue;
  }
  const built = readSocTable(draft.bytes).rows.slice(1);
  const pairs = lcs(real.map(key), built.map(key));
  const counts: Record<string, number> = { exact: 0, format: 0, contained: 0, different: 0 };
  const samples: string[] = [];
  for (const [i, j] of pairs) {
    const k = kind(built[j].tor, real[i].tor);
    counts[k]++;
    if ((k === "different" || (k === "contained" && process.env.DETAIL)) && samples.length < 16) samples.push(`  ${built[j].item} | real: ${real[i].tor.slice(0, 90)}\n      built: ${built[j].tor.slice(0, 90)}`);
  }
  const missing = real.filter((_, i) => !pairs.some(([p]) => p === i)).map((r) => key(r));
  const extra = built.filter((_, j) => !pairs.some(([, q]) => q === j)).map((r) => key(r));
  const keyed = (rows: SocTableRow[]) => rows.map((r) => key(r)).filter(Boolean);
  console.log(`  ${Math.round(performance.now() - started)} ms; warnings ${draft.warnings.length}`);
  console.log(`  real numbered rows ${real.length}, built rows ${built.length}`);
  console.log(`  item numbers matched ${pairs.length}/${real.length} of real (${((100 * pairs.length) / real.length).toFixed(1)}%), ${((100 * pairs.length) / built.length).toFixed(1)}% of built`);
  console.log(`  text of matched: exact ${counts.exact}, format-only ${counts.format}, contained ${counts.contained}, different ${counts.different}`);
  console.log(`  real rows missing from draft (${missing.length}): ${missing.slice(0, 40).join(" ")}`);
  console.log(`  draft rows not in real (${extra.length}): ${extra.slice(0, 40).join(" ")}`);
  console.log(`  warnings: ${draft.warnings.slice(0, 6).join(" || ")}`);
  if (process.env.DETAIL) {
    console.log("  real major items:", readSocTable(readFileSync(short)).majorItems.map((m) => `${m.label}:${m.rowCount}`).join(" "));
    for (const [i] of real.map((r, n) => [n, r] as const).filter(([n]) => !pairs.some(([p]) => p === n))) console.log(`  MISSING ${real[i].majorItem} ${real[i].item} | ${real[i].tor.slice(0, 70)}`);
    for (const j of built.map((_, n) => n).filter((n) => !pairs.some(([, q]) => q === n))) console.log(`  EXTRA ${built[j].item} | ${built[j].tor.slice(0, 70)}`);
  }
  console.log(samples.join("\n"));
  void keyed;
  writeFileSync(path.resolve(`.scratch/soc-builder/dev/_draft-${sets.indexOf(set)}.docx`), draft.bytes);
}
