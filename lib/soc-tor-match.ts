// TOR Match (docs/SOC-DOMAIN-GLOSSARY.md "TOR Match"): did the SOC copy the
// TOR ต้นฉบับ faithfully? Pure: the SOC's rows and the TOR's page texts in;
// an outcome per SOC row, the TOR text no row covers, and warnings out. No
// I/O: attaching, reading (OCR) and storing the TOR wrap this.
//
// A port of the prototype (.scratch/tor-match/prototype/tor_match_prototype.py,
// branch prototype/tor-match), whose numbers on the example sets are the
// acceptance. Per section of the TOR (a ผนวก, or a major item), the SOC rows
// are found in TOR order as text, not by item number: the TOR numbers from 1
// again under every heading and annex, and numbers its lists like items.
import type { SocMajorItemSpec } from "@/lib/soc-major-items";
import { toArabicDigits } from "@/lib/soc-shared";
import type { SocTableRow } from "@/lib/soc-table";

// A scanned TOR is read by the outside OCR (Typhoon), which still misreads
// some characters: its result is marked Beta on the page and in the Excel.
export const TOR_OCR_BETA_NOTE = "Beta: TOR ต้นฉบับนี้อ่านด้วย OCR (Typhoon) ซึ่งยังไม่แม่นยำ 100% แถวที่ไม่ตรงบางแถวอาจมาจาก OCR อ่านผิด ไม่ใช่ SOC แก้ข้อความ ควรเปิดดูหน้า TOR จริง หรือส่งให้ Claude ตัดสิน";

export const TOR_MATCH_OUTCOMES =["ตรง", "ต่างแค่รูปแบบ", "ความหมายต่าง", "ไม่พบใน SOC", "ไม่พบใน TOR", "ยืนยันไม่ได้"] as const;
export type TorMatchOutcome = (typeof TOR_MATCH_OUTCOMES)[number];
export type TorMatchRowOutcome = Exclude<TorMatchOutcome, "ไม่พบใน SOC">;

// A TOR page as read (text layer or OCR), running header and page counter
// already removed. `picture`: the page is a picture, its text can't be trusted.
export type TorPage = { text: string; picture: boolean };

// A SOC row's outcome. `torText`, `torPage`: the TOR stretch the row matched
// (none for ไม่พบใน TOR, an Image Row or a row in a section the TOR lacks).
export type TorMatchRow = Pick<SocTableRow, "position" | "item" | "majorItem"> & {
  outcome: TorMatchRowOutcome;
  socText: string;
  torText: string | null;
  torPage: number | null;
};
// TOR text no SOC row covers (ไม่พบใน SOC), in the section labelled `section`.
export type TorMatchMissing = { section: string; torText: string; torPage: number | null };
export type TorMatch = { rows: TorMatchRow[]; missing: TorMatchMissing[]; warnings: string[] };

export type TorMatchSoc = { majorItems: Pick<SocMajorItemSpec, "key" | "label" | "groupLabel">[]; rows: SocTableRow[] };

// From the prototype, tuned on the three example sets (FINDINGS.md).
const PIECE = 8; // characters of a seed piece: a stretch is tried where one occurs
const MAX_SEEDS = 400;
const SLACK = 20; // characters either side of a tried stretch
const MIN_BLOCK = 3; // shorter common runs don't count towards the score
const AHEAD_BONUS = 0.02; // rows come in TOR order: prefer a stretch after the last match
const DIFFERENT = 0.6; // matched share: ≥ ความหมายต่าง
const UNSURE = 0.35; // ≥ ยืนยันไม่ได้, below ไม่พบใน TOR
const AHEAD_WINS = 0.9; // a match this good ahead beats an exact copy behind (TORs repeat specs)
const HEADING_LENGTH = 20; // characters of a heading compared to find a numbered SOC's section

// ---------------------------------------------------------------- normalising

// Thai fonts draw a mark shifted (over ป ฝ ฟ, or low with no vowel above)
// with a private-use glyph U+F700-F71A, which a PDF's text layer keeps
// ("พรอม" is พร้อม). Map them back; other private-use codes are bullets.
const THAI_PUA = [
  0x0e10, 0x0e34, 0x0e35, 0x0e36, 0x0e37, // F700 tho than, F701-F704 sara i, ii, ue, uee
  0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, // F705-F709 tone marks + thanthakhat, shifted left
  0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, // F70A-F70E the same, low
  0x0e0d, 0x0e31, 0x0e4d, 0x0e47, // F70F yo ying, F710 mai han akat, F711 nikhahit, F712 mai taikhu
  0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, // F713-F717 tone marks, low and shifted left
  0x0e38, 0x0e39, 0x0e3a, // F718-F71A sara u, uu, phinthu
];
const isPrivateUse = (code: number) => code >= 0xe000 && code <= 0xf8ff;

export function thaiText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xf700 && code <= 0xf71a) out += String.fromCodePoint(THAI_PUA[code - 0xf700]);
    else if (!isPrivateUse(code)) out += ch;
  }
  return out.normalize("NFC");
}

// Same text except line breaks, spaces and bullets.
const light = (text: string) => thaiText(text).replace(/\s+/g, "");

// Symbols that carry meaning: a changed one is ความหมายต่าง, not ต่างแค่รูปแบบ.
export const KEPT_SYMBOLS: ReadonlySet<string> = new Set("<>≤≥±+=%");
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
export const isThai = (c: string) => c >= "฀" && c <= "๿";

// The comparison text of `text` (no spaces, punctuation, digit script or
// case; NFKC, so µ is μ) and, per character of it, its index in `text`.
function compared(text: string): { norm: string; index: number[] } {
  let norm = "";
  const index: number[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    const at = i;
    i += ch.length;
    if (isPrivateUse(ch.codePointAt(0)!) || /\s/.test(ch)) continue;
    for (const c of toArabicDigits(ch.normalize("NFKC")).toLowerCase()) {
      if (!(LETTER_OR_DIGIT.test(c) || isThai(c) || KEPT_SYMBOLS.has(c))) continue;
      norm += c;
      for (let unit = 0; unit < c.length; unit++) index.push(at);
    }
  }
  return { norm, index };
}

// A list letter the TOR types and a Word SOC numbers itself ("a. Name",
// "ก. ชื่อ"), blanked to the same length so indexes hold.
const withoutListLetters = (text: string) => text.replace(/^(\s*)[a-zA-Zก-ฮ][.)](?=\s)/gm, "$1  ");

const comparable = (text: string) => compared(withoutListLetters(thaiText(text))).norm;

// ------------------------------------------- difflib's SequenceMatcher, no junk

type Block = { a: number; b: number; size: number };

function positions(b: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (let j = 0; j < b.length; j++) {
    const list = out.get(b[j]);
    if (list) list.push(j);
    else out.set(b[j], [j]);
  }
  return out;
}

function longestMatch(a: string, b: string, bPositions: Map<string, number[]>, alo: number, ahi: number, blo: number, bhi: number): Block {
  let best: Block = { a: alo, b: blo, size: 0 };
  let lengths = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const next = new Map<number, number>();
    for (const j of bPositions.get(a[i]) ?? []) {
      if (j < blo) continue;
      if (j >= bhi) break;
      const k = (lengths.get(j - 1) ?? 0) + 1;
      next.set(j, k);
      if (k > best.size) best = { a: i - k + 1, b: j - k + 1, size: k };
    }
    lengths = next;
  }
  return best;
}

// The common runs of a and b, in order, adjacent runs merged (as Python's
// SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()).
function matchingBlocks(a: string, b: string, bPositions = positions(b)): Block[] {
  const found: Block[] = [];
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const m = longestMatch(a, b, bPositions, alo, ahi, blo, bhi);
    if (!m.size) continue;
    found.push(m);
    if (alo < m.a && blo < m.b) queue.push([alo, m.a, blo, m.b]);
    if (m.a + m.size < ahi && m.b + m.size < bhi) queue.push([m.a + m.size, ahi, m.b + m.size, bhi]);
  }
  found.sort((x, y) => x.a - y.a || x.b - y.b);
  const merged: Block[] = [];
  for (const m of found) {
    const last = merged.at(-1);
    if (last && last.a + last.size === m.a && last.b + last.size === m.b) last.size += m.size;
    else merged.push({ ...m });
  }
  return merged;
}

function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  return (2 * matchingBlocks(a, b).reduce((sum, m) => sum + m.size, 0)) / (a.length + b.length);
}

// ---------------------------------------------------------------- matching

type Span = [number, number]; // in a section's comparison text

type Section = {
  raw: string; // the section's TOR text, list letters blanked
  norm: string;
  index: number[]; // per norm character, its index in raw
  pageStarts: [number, number][]; // [index in raw, page number], pages the section lies on
  picturePages: number[];
};

// The stretch of t that r lines up with best, and its matched share. Tried
// where one of a few pieces of r occurs in t.
function locate(r: string, t: string, cursor: number): { span: Span; score: number } | null {
  if (r.length < PIECE) return null;
  const starts = new Set<number>();
  const step = Math.max(1, Math.floor((r.length - PIECE) / 8));
  for (let i = 0; i <= r.length - PIECE; i += step) {
    const piece = r.slice(i, i + PIECE);
    for (let at = t.indexOf(piece); at >= 0 && starts.size < MAX_SEEDS; at = t.indexOf(piece, at + 1)) starts.add(Math.max(0, at - i));
  }
  const rPositions = positions(r);
  let best: { span: Span; score: number; rank: number } | null = null;
  for (const start of [...starts].sort((x, y) => x - y)) {
    const lo = Math.max(0, start - SLACK);
    const blocks = matchingBlocks(t.slice(lo, start + r.length + SLACK), r, rPositions).filter((m) => m.size >= MIN_BLOCK);
    if (!blocks.length) continue;
    const score = blocks.reduce((sum, m) => sum + m.size, 0) / r.length;
    const rank = score + (start >= cursor ? AHEAD_BONUS : 0);
    const last = blocks.at(-1)!;
    if (!best || rank > best.rank) best = { span: [lo + blocks[0].a, lo + last.a + last.size], score, rank };
  }
  return best && { span: best.span, score: best.score };
}

const rawOf = (section: Section, [a, b]: Span) => section.raw.slice(section.index[a], section.index[b - 1] + 1);

// A matched stretch, run on to whole words: a shared run can start or end
// inside a Latin word or number ("Wight" for "Weight" shares "ight"), and the
// rest of the word would be left as ไม่พบใน SOC. Thai has no word ends to run
// to and is left as matched. A step is taken only between neighbours in the
// TOR text (no space or line break between them).
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
function wholeWords(section: Section, [a, b]: Span): Span {
  const { raw, index, norm } = section;
  const joined = (i: number) => index[i + 1] === index[i] + 1 && LATIN_OR_DIGIT.test(raw[index[i]]) && LATIN_OR_DIGIT.test(raw[index[i + 1]]);
  while (a > 0 && joined(a - 1)) a--;
  while (b < norm.length && joined(b - 1)) b++;
  return [a, b];
}

function pageAt(section: Section, normIndex: number): number | null {
  if (!section.index.length) return null;
  const at = section.index[Math.min(normIndex, section.index.length - 1)];
  return section.pageStarts.findLast(([start]) => start <= at)?.[1] ?? null;
}

// One SOC row's text in a section, searched from `cursor` on.
function classify(socText: string, r: string, section: Section, cursor: number): { outcome: TorMatchRowOutcome; span: Span | null; moves: boolean } {
  const t = section.norm;
  let at = t.indexOf(r, cursor);
  if (at < 0) {
    at = t.indexOf(r);
    // A TOR repeats specs (the same camera under ๑.๒ and ๑.๔): an exact copy
    // behind loses to a near match ahead, where the row belongs.
    const ahead = at >= 0 ? locate(r, t.slice(cursor), 0) : null;
    if (ahead && ahead.score >= AHEAD_WINS) return { outcome: "ความหมายต่าง", span: [cursor + ahead.span[0], cursor + ahead.span[1]], moves: true };
  }
  if (at >= 0) {
    const span: Span = [at, at + r.length];
    const soc = light(socText);
    const tor = light(rawOf(section, span));
    return { outcome: tor.includes(soc) || soc.includes(tor) ? "ตรง" : "ต่างแค่รูปแบบ", span, moves: true };
  }
  const best = locate(r, t, cursor);
  if (!best || best.score < UNSURE) return { outcome: "ไม่พบใน TOR", span: null, moves: false };
  return best.score < DIFFERENT ? { outcome: "ยืนยันไม่ได้", span: best.span, moves: false } : { outcome: "ความหมายต่าง", span: best.span, moves: true };
}

function matchSection(rows: SocTableRow[], section: Section, label: string): { rows: TorMatchRow[]; missing: TorMatchMissing[] } {
  const results: TorMatchRow[] = [];
  const covered = new Uint8Array(section.norm.length);
  let cursor = 0;
  for (const row of rows) {
    const base = { position: row.position, item: row.item, majorItem: row.majorItem, socText: row.tor };
    if (row.image) {
      results.push({ ...base, outcome: "ยืนยันไม่ได้", torText: null, torPage: null });
      continue;
    }
    const r = comparable(row.tor);
    if (!r) continue; // no TOR text to compare
    const { outcome: found, span: matched, moves } = classify(row.tor, r, section, cursor);
    const span = matched && wholeWords(section, matched);
    // The row may be on a page of the section that is a picture.
    const outcome = found === "ไม่พบใน TOR" && section.picturePages.length ? "ยืนยันไม่ได้" : found;
    if (span) {
      covered.fill(1, span[0], span[1]);
      if (moves) cursor = Math.max(cursor, span[1]); // never back: a match behind is a repeat
    }
    results.push({ ...base, outcome, torText: span && rawOf(section, span), torPage: span && pageAt(section, span[0]) });
  }
  const missing: TorMatchMissing[] = [];
  for (let i = 0; i < covered.length; ) {
    if (covered[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < covered.length && !covered[j]) j++;
    // Item numbers between rows ("๑.๑.๒", "๓)", "(1)") aren't missing text; a lone value ("200") is.
    const at = section.index[i];
    const lineStart = section.raw.lastIndexOf("\n", at - 1) + 1;
    const atLineStart = /^[ \t#*(]*$/.test(section.raw.slice(lineStart, at));
    if (/[^0-9]/.test(section.norm.slice(i, j)) || !atLineStart) missing.push({ section: label, torText: rawOf(section, [i, j]).trim(), torPage: pageAt(section, i) });
    i = j;
  }
  return { rows: results, missing };
}

// ---------------------------------------------------------------- sections

type Tor = { raw: string; pageStarts: [number, number][]; pages: TorPage[] };

function readTor(pages: TorPage[]): Tor {
  let raw = "";
  const pageStarts: [number, number][] = [];
  pages.forEach((page, i) => {
    pageStarts.push([raw.length, i + 1]);
    const text = thaiText(page.text);
    raw += text.endsWith("\n") ? text : `${text}\n`;
  });
  return { raw, pageStarts, pages };
}

function makeSection(tor: Tor, start: number, end: number): Section {
  const raw = withoutListLetters(tor.raw.slice(start, end));
  const { norm, index } = compared(raw);
  const onPages = tor.pageStarts.filter(([s], k) => s < end && (tor.pageStarts[k + 1]?.[0] ?? Infinity) > start);
  return {
    raw,
    norm,
    index,
    pageStarts: onPages.map(([s, page]) => [Math.max(0, s - start), page]),
    picturePages: onPages.map(([, page]) => page).filter((page) => tor.pages[page - 1].picture),
  };
}

function lineStarts(raw: string): { line: string; at: number }[] {
  const out: { line: string; at: number }[] = [];
  for (let at = 0; at < raw.length; ) {
    const end = raw.indexOf("\n", at);
    const next = end < 0 ? raw.length : end + 1;
    out.push({ line: raw.slice(at, next), at });
    at = next;
  }
  return out;
}

// Sections from heading positions: each runs to the next one.
function sectionsAt(tor: Tor, heads: Map<number, number>, firstFromPageTop: boolean): Map<number, Section> {
  const order = [...heads].sort((x, y) => x[1] - y[1]);
  return new Map(order.map(([n, at], k) => {
    // The first major item takes its page's top too: the SOC's title rows are there.
    const start = k === 0 && firstFromPageTop ? Math.max(...tor.pageStarts.map(([s]) => s).filter((s) => s <= at)) : at;
    return [n, makeSection(tor, start, order[k + 1]?.[1] ?? tor.raw.length)];
  }));
}

const ANNEX_LINE = /^\s*ผนวก\s*([0-9๐-๙]+)\s*$/;
const number = (digits: string) => Number(toArabicDigits(digits));

// ผนวก N in the TOR: from its last heading line ("ผนวก N" alone) to the next.
function annexSections(tor: Tor): Map<number, Section> {
  const heads = new Map<number, number>();
  for (const { line, at } of lineStarts(tor.raw)) {
    const m = ANNEX_LINE.exec(line);
    if (m) heads.set(number(m[1]), at);
  }
  return sectionsAt(tor, heads, false);
}

// "๕. …", "## ๕. …"; not "๕.๕", not "5 …".
const MAJOR_LINE = /^[#\s*]*([0-9๐-๙]+)\.(?![0-9๐-๙])/;

// Major item N in the TOR: the line "N." that reads most like the SOC's own
// heading row of item N (lists and annexes number from ๑. again), after the
// previous major item's.
function majorSections(tor: Tor, headings: Map<number, string>): Map<number, Section> {
  const lines = lineStarts(tor.raw).flatMap(({ line, at }) => {
    const m = MAJOR_LINE.exec(line);
    return m ? [{ n: number(m[1]), at, text: comparable(line.slice(m[0].length)) }] : [];
  });
  const heads = new Map<number, number>();
  let after = -1;
  for (const n of [...headings.keys()].sort((x, y) => x - y)) {
    const title = headings.get(n)!;
    let best: { at: number; score: number } | null = null;
    for (const line of lines) {
      if (line.n !== n || line.at <= after) continue;
      const score = title ? similarity(line.text.slice(0, HEADING_LENGTH), title) : 0;
      if (!best || score > best.score) best = { at: line.at, score };
    }
    if (!best) continue;
    heads.set(n, best.at);
    after = best.at;
  }
  return sectionsAt(tor, heads, true);
}

// ---------------------------------------------------------------- the compare

const ITEM_ONLY = /^[0-9๐-๙]+\.?$/;
// The SOC table's header row (ลำดับ | ข้อกำหนด TOR | ข้อเสนอ …).
const isHeaderRow = (row: SocTableRow) => row.tor.includes("ข้อกำหนด") && row.tor.length < 40;

// Compares a SOC with a TOR ต้นฉบับ. Only the SOC's major items are compared
// (a split major item as one: its sections are the TOR's). Rows above the
// first major item go with it.
export function matchTor(soc: TorMatchSoc, pages: TorPage[]): TorMatch {
  const tor = readTor(pages);
  const annexed = soc.majorItems.some((item) => /^ผนวก/.test(item.groupLabel ?? item.label));
  const sectionOf = (majorItem: string) => Number(majorItem.split(".")[0]);
  const labels = new Map(soc.majorItems.map((item) => [sectionOf(item.key), annexed ? item.groupLabel ?? item.label : `ข้อ ${item.groupLabel ?? item.label}`]));
  const first = soc.rows.find((row) => row.majorItem !== null)?.majorItem;
  const bySection = new Map<number, SocTableRow[]>();
  for (const row of soc.rows) {
    if (row.majorItem === null && (first === undefined || isHeaderRow(row))) continue;
    const key = sectionOf(row.majorItem ?? first!);
    bySection.set(key, [...(bySection.get(key) ?? []), row]);
  }
  const headingOf = (rows: SocTableRow[]) => {
    const heading = rows.find((row) => ITEM_ONLY.test(row.item.replace(/\s+/g, "")));
    return heading ? comparable(heading.tor).slice(0, HEADING_LENGTH) : "";
  };
  const sections = annexed ? annexSections(tor) : majorSections(tor, new Map([...bySection].map(([n, rows]) => [n, headingOf(rows)])));

  const out: TorMatch = { rows: [], missing: [], warnings: [] };
  for (const [n, rows] of bySection) {
    const label = labels.get(n) ?? String(n);
    const section = sections.get(n);
    if (!section) {
      out.warnings.push(`ไม่พบหัวข้อ ${label} ใน TOR ต้นฉบับ แถวในหัวข้อนี้จึงยืนยันไม่ได้ กรุณาตรวจว่าแนบ TOR ถูกฉบับ`);
      for (const row of rows) if (row.image || comparable(row.tor)) out.rows.push({ position: row.position, item: row.item, majorItem: row.majorItem, socText: row.tor, outcome: "ยืนยันไม่ได้", torText: null, torPage: null });
      continue;
    }
    const result = matchSection(rows, section, label);
    out.rows.push(...result.rows);
    out.missing.push(...result.missing);
  }
  out.rows.sort((x, y) => x.position - y.position);
  return out;
}
