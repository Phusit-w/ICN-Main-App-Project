// Major items (ข้อใหญ่) of a SOC: the top-level item numbers in the first
// column of the SOC's tables, in document order. This is a deterministic read
// of the table structure, not a compliance check (spec "Job model"); a major
// item is the unit one Local Check Run covers.
//
// The rules here work on table rows (cells of text); lib/soc-table.ts reads
// the rows out of the SOC file.
import { SPLIT_MAJOR_ITEM_ROWS, toArabicDigits as toArabic } from "@/lib/soc-shared";

export type SocMajorItemSpec = {
  key: string; // the number in Arabic digits, e.g. "1" for both "๑" and "1.", or "5.5" for a sub-section of a split item
  label: string; // the number as the SOC writes it, e.g. "๑" or "๕.๕"; "ผนวก 7" when the SOC is divided into ผนวก
  title: string | null; // text of the item's own heading row, when the SOC has one
  rowCount: number; // SOC table rows the item covers, its heading row and unnumbered rows included
  imageRowCount: number; // of those, the Image Rows (TOR cell is an image, no text)
  groupLabel: string | null; // a sub-section of a split major item: that major item's label, e.g. "๕"
  groupTitle: string | null; // and its heading row's text
  // ไม่ต้องตรวจ, guessed on import: when a large item was split, that item is
  // the specification part, and the others (หลักการ, คุณสมบัติผู้ยื่น …) are
  // not checked against datasheets. Without a split there is no guess. The
  // user can switch any item either way on the job page.
  skipped: boolean;
};

const MAX_TITLE = 300;

// "๑.๒.๗", "4.3.1", "1.5.1." — the same shape soc-worker's is_item_label accepts.
const ITEM_LABEL = /^[0-9๐-๙]+(?:\.[0-9๐-๙]+)*\.?$/;

// The item number's segments as written ("๕.๕.๓" → ["๕", "๕", "๓"]), or
// null when the text isn't an item number.
function itemSegments(item: string): string[] | null {
  const compact = item.replace(/\s+/g, "");
  return ITEM_LABEL.test(compact) ? compact.replace(/\.$/, "").split(".") : null;
}

const segmentKey = (segments: string[]) => segments.map((s) => String(Number(toArabic(s)))).join(".");

// The major item an item number belongs to before any split ("๑.๒.๗" →
// "1"), or null when the text isn't an item number.
export function majorItemKey(item: string): string | null {
  const segments = itemSegments(item);
  return segments ? segmentKey(segments.slice(0, 1)) : null;
}

// Whether an item number belongs to a major item record: "๕.๕.๓" belongs to
// "5" and, after a split, to "5.5". The split major item's own heading row
// ("๕") belongs to its first sub-section only (`takesGroupHeading`).
export function isItemInMajorItem(item: string, majorItem: { key: string }, { takesGroupHeading = false } = {}): boolean {
  const segments = itemSegments(item);
  if (!segments) return false;
  const path = segmentKey(segments).split(".");
  const key = majorItem.key.split(".");
  if (takesGroupHeading && path.length === 1 && path[0] === key[0]) return true;
  return key.every((segment, i) => path[i] === segment);
}

type ItemTally = { key: string; label: string; title: string | null; rowCount: number; imageRowCount: number };
// rowsBeforeSubs (imagesBeforeSubs): its heading row and any row before its first sub-section (the Image Rows among them).
type MajorItemTally = ItemTally & { rowsBeforeSubs: number; imagesBeforeSubs: number; subs: Map<string, ItemTally> };

// The heading row of a ผนวก: no item number, and the TOR cell starts with
// "ผนวก 7 …" or "ภาคผนวกที่ ๘ …". The skill reads the same rule
// (build_evidence_packet.py annex_heading).
const ANNEX_HEADING = /^(?:ภาค)?ผนวก\s*(?:ที่)?\s*([0-9๐-๙]+)(?![0-9๐-๙.])[\s:.-]*(.*)$/;

function annexHeading(cells: string[]): { key: string; label: string; title: string | null } | null {
  if (/[0-9๐-๙]/.test(cells[0] || "")) return null;
  const match = ANNEX_HEADING.exec((cells[1] || "").trim());
  return match ? { key: String(Number(toArabic(match[1]))), label: `ผนวก ${match[1]}`, title: match[2].slice(0, MAX_TITLE) || null } : null;
}

// The ผนวก heading of each row that is one, or null when the SOC isn't
// divided into ผนวก (fewer than two ผนวก).
function annexHeadingsOfRows(rows: string[][]) {
  const headings = rows.map(annexHeading);
  return new Set(headings.flatMap((heading) => heading?.key ?? [])).size < 2 ? null : headings;
}

// The key of the ผนวก each row lies in (null above the first ผนวก), or null
// when the SOC isn't divided into ผนวก.
export function annexKeysOfRows(rows: string[][]): (string | null)[] | null {
  let key: string | null = null;
  return annexHeadingsOfRows(rows)?.map((heading) => (key = heading?.key ?? key)) ?? null;
}

// A SOC divided into ผนวก (MEA Y69): at least two ผนวก heading rows. Its rows
// number from 1 again in every ผนวก, so each ผนวก is a major item: key = the
// ผนวก number, and a row's item is that number, then the row's own ("7.1").
// A ผนวก over SPLIT_MAJOR_ITEM_ROWS with two or more own items ("1.", "2." …)
// is split into one major item per own item (key "7.2": items "7.2", "7.2.1"
// …). Rows above the first ผนวก belong to no major item.
function annexItemsOfRows(rows: string[][], isImageRow: (index: number) => boolean): SocMajorItemSpec[] | null {
  const headings = annexHeadingsOfRows(rows);
  if (!headings) return null;
  const annexes = new Map<string, MajorItemTally>();
  let annex: MajorItemTally | null = null;
  let part: ItemTally | null = null;
  for (const [index, heading] of headings.entries()) {
    if (heading) {
      annex = annexes.get(heading.key) ?? { ...heading, rowCount: 0, imageRowCount: 0, rowsBeforeSubs: 0, imagesBeforeSubs: 0, subs: new Map() };
      annexes.set(heading.key, annex);
      part = null;
    }
    if (!annex) continue;
    // A part is the ผนวก's own item "4" (and "4.1" under it): the first segment of the row's number.
    const segments = itemSegments(rows[index][0] || "");
    if (segments) {
      const partKey = `${annex.key}.${segmentKey(segments.slice(0, 1))}`;
      part = annex.subs.get(partKey) ?? { key: partKey, label: `${annex.label.replace(/^ผนวก\s*/, "")}.${segments[0]}`, title: null, rowCount: 0, imageRowCount: 0 };
      annex.subs.set(partKey, part);
      if (segments.length === 1 && !part.title) part.title = rows[index].slice(1).find((t) => t)?.slice(0, MAX_TITLE) || null;
    }
    const image = isImageRow(index) ? 1 : 0;
    annex.rowCount += 1;
    annex.imageRowCount += image;
    if (part) {
      part.rowCount += 1;
      part.imageRowCount += image;
    } else {
      annex.rowsBeforeSubs += 1;
      annex.imagesBeforeSubs += image;
    }
  }
  // A big ผนวก is split into its own items, as a big major item is (SPLIT_MAJOR_ITEM_ROWS); none is guessed ไม่ต้องตรวจ.
  return [...annexes.values()].flatMap(({ rowsBeforeSubs, imagesBeforeSubs, subs, ...item }): SocMajorItemSpec[] => {
    if (item.rowCount <= SPLIT_MAJOR_ITEM_ROWS || subs.size < 2) return [{ ...item, groupLabel: null, groupTitle: null, skipped: false }];
    // The ผนวก's heading row and any row before its first item join the first part.
    return [...subs.values()].map((s, i) => ({ ...s, rowCount: s.rowCount + (i === 0 ? rowsBeforeSubs : 0), imageRowCount: s.imageRowCount + (i === 0 ? imagesBeforeSubs : 0), groupLabel: item.label, groupTitle: item.title, skipped: false }));
  });
}

// The major items of a SOC, from every row of its tables in order (first cell
// = item number). `isImageRow(i)`: whether row i is an Image Row.
export function majorItemsOfRows(rows: string[][], isImageRow: (index: number) => boolean = () => false): SocMajorItemSpec[] {
  const annexes = annexItemsOfRows(rows, isImageRow);
  if (annexes) return annexes;
  // Each row counts towards the item number above it, until the next one.
  const majors = new Map<string, MajorItemTally>();
  let major: MajorItemTally | null = null;
  let sub: ItemTally | null = null;
  for (const [index, cells] of rows.entries()) {
    const segments = itemSegments(cells[0] || "");
    const text = () => cells.slice(1).find((t) => t)?.slice(0, MAX_TITLE) || null;
    if (segments) {
      const key = segmentKey(segments.slice(0, 1));
      major = majors.get(key) ?? { key, label: segments[0], title: null, rowCount: 0, imageRowCount: 0, rowsBeforeSubs: 0, imagesBeforeSubs: 0, subs: new Map() };
      majors.set(key, major);
      if (segments.length === 1 && !major.title) major.title = text();
      sub = null;
      if (segments.length > 1) {
        const subKey = segmentKey(segments.slice(0, 2));
        sub = major.subs.get(subKey) ?? { key: subKey, label: segments.slice(0, 2).join("."), title: null, rowCount: 0, imageRowCount: 0 };
        major.subs.set(subKey, sub);
        if (segments.length === 2 && !sub.title) sub.title = text();
      }
    }
    if (!major) continue;
    const image = isImageRow(index) ? 1 : 0;
    major.rowCount += 1;
    major.imageRowCount += image;
    if (sub) {
      sub.rowCount += 1;
      sub.imageRowCount += image;
    } else {
      major.rowsBeforeSubs += 1;
      major.imagesBeforeSubs += image;
    }
  }
  // Over SPLIT_MAJOR_ITEM_ROWS: split one level, into the second-level
  // sub-sections (๕ → ๕.๑ … ๕.๑๕). A sub-section isn't split again.
  const items = [...majors.values()].flatMap(({ rowsBeforeSubs, imagesBeforeSubs, subs, ...item }): Omit<SocMajorItemSpec, "skipped">[] => {
    if (item.rowCount <= SPLIT_MAJOR_ITEM_ROWS || subs.size < 2) return [{ ...item, groupLabel: null, groupTitle: null }];
    // The major item's own heading row (and any row before ๕.๑) joins the first sub-section.
    return [...subs.values()].map((s, i) => ({ ...s, rowCount: s.rowCount + (i === 0 ? rowsBeforeSubs : 0), imageRowCount: s.imageRowCount + (i === 0 ? imagesBeforeSubs : 0), groupLabel: item.label, groupTitle: item.title }));
  });
  const split = items.some((item) => item.groupLabel);
  return items.map((item) => ({ ...item, skipped: split && !item.groupLabel }));
}

// The same item number, whatever its digits or trailing dot ("๒.๑" = "2.1.").
export const normalItem = (item: string) => toArabic(item.replace(/\s+/g, "")).replace(/\.$/, "");
export const sameItem = (a: string, b: string) => normalItem(a) === normalItem(b);
