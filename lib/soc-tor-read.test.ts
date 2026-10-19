import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CellReader } from "@/lib/soc-pdf-soc";
import { readScannedTor, readTextTor, scannedTorPages } from "@/lib/soc-tor-read";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";

const page = (lines: (string | { text: string; underline?: number[] })[], extra: Partial<TablePage> = {}): TablePage =>
  ({ columns: [], rows: [], lines: lines.map((line) => (typeof line === "string" ? { text: line } : line)), ...extra });

const lineList = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

// The pages of a TOR that has a text layer.
function textPages(pdf: Uint8Array) {
  const { pages } = readTextTor(pdf);
  assert.ok(pages, "read as a text TOR");
  return pages;
}

test("Thai private-use glyphs from the text layer are read back as Thai", () => {
  // พร้อม with its tone mark as the shifted glyph U+F70B; ปี่ with U+F702 + U+F705; U+F8FF a bullet.
  const pages = textPages(buildTablePdf([page(["พรอม", "ป", "ข้อ ทดสอบ"])]));
  assert.deepEqual(lineList(pages[0].text), ["พร้อม", "ปี่", "ข้อ ทดสอบ"]);
});

test("an underlined < > + is read as ≤ ≥ ±, a plain one stays", () => {
  const pages = textPages(buildTablePdf([page([
    { text: "a < 5 and b > 6", underline: [2] },
    { text: "c > 7 and d + 1", underline: [2, 12] },
    "e < 8",
  ])]));
  assert.deepEqual(lineList(pages[0].text), ["a ≤ 5 and b > 6", "c ≥ 7 and d ± 1", "e < 8"]);
});

test("a running header and the page counter are left out", () => {
  const numbers = [1, 2, 3, 4, 5];
  const pdf = buildTablePdf(numbers.map((n) => page(["การไฟฟ้านครหลวง TOR งานจัดระเบียบสาย", `ข้อความหน้า ${n}`, `(${n}/5)`])));
  const pages = textPages(pdf);
  assert.deepEqual(pages.map((p) => lineList(p.text)), numbers.map((n) => [`ข้อความหน้า ${n}`]));
  assert.ok(pages.every((p) => !p.picture));
});

test("a short TOR keeps lines that repeat on its pages", () => {
  // A spec repeated on two pages of three (TORs repeat specs) is TOR text, not a header.
  const pages = textPages(buildTablePdf([page(["ข้อ ๑", "เหมือนกัน"]), page(["ข้อ ๒", "เหมือนกัน"]), page(["ข้อ ๓"])]));
  assert.deepEqual(pages.map((p) => lineList(p.text)), [["ข้อ ๑", "เหมือนกัน"], ["ข้อ ๒", "เหมือนกัน"], ["ข้อ ๓"]]);
});

test("a page that is mostly a picture is a picture page", () => {
  const pages = textPages(buildTablePdf([
    page(Array(15).fill("ข้อ ๑ ระบบต้องรองรับผู้ใช้งาน")),
    page(["รูปที่ ๑ แผนผัง"], { picture: true }),
    page(Array(15).fill("ข้อ ๒ ระบบต้องรองรับผู้ใช้งาน"), { picture: true }), // a picture beside a page of text
  ]));
  assert.deepEqual(pages.map((p) => p.picture), [false, true, false]);
});

test("a TOR that is mostly scanned has no text pages (it needs OCR); one scanned page among text pages is a picture page", () => {
  const scanned = readTextTor(buildTablePdf([{ columns: [], rows: [], scanned: true }, { columns: [], rows: [], scanned: true }, page(["ข้อ ๑"])]));
  assert.deepEqual(scanned, { pageCount: 3, pages: null });
  const pages = textPages(buildTablePdf([page(["ข้อ ๑ ระบบ"]), { columns: [], rows: [], scanned: true }, page(["ข้อ ๒ ระบบ"])]));
  assert.deepEqual(pages.map((p) => p.picture), [false, true, false]);
});

test("a file that is not a readable PDF is refused", () => {
  assert.throws(() => readTextTor(new TextEncoder().encode("not a pdf")), /PDF/);
  assert.throws(() => readTextTor(buildTablePdf([page(["ข้อ ๑"])], { password: "x" })), /รหัสผ่าน/);
});

// A scanned TOR's pages as OCR reads them: the page number and the signature
// block come out a little different on each page (Apron), and must not be left
// as TOR text no SOC row covers.
const signed = (body: string[], name = "(นายกฤษณรัฐ เพชรเสมอใจ)", number = "- ๑ -") =>
  [number, ...body, "ประธานกรรมการ", name, "กรรมการ", "( นางสาวธนภรณ์ โสตถิอุดม )"].join("\n");

test("lines OCR reads nearly the same on most pages are left out; spec lines stay", () => {
  const pages = scannedTorPages([
    signed(["๑. ระบบกล้อง", "๑.๑ กล้องความละเอียด 4 ล้านพิกเซล", "รองรับ PoE"]),
    signed(["๑.๒ บันทึกภาพ 30 วัน", "รองรับ PoE"], "( นายกฤษณ์รัฐ เพชร์เสมอใจ)", "- ๒ -"),
    signed(["๒. ระบบเครือข่าย"], "๑.)  (นายกฤษณรัฐ เพชรเสมอใจ)", "- ๓ -"),
    signed(["๒.๑ สวิตช์ 24 พอร์ต"], undefined, "- ๑๒ -"),
    signed(["๒.๒ สวิตช์ 48 พอร์ต"]),
    // The signers on one line, one name misread, a spec line running on with no number of its own.
    ["- ๖ -", "๒.๓ หน่วยความจำ DDR5", "หรือดีกว่า", "๑.) ประธานกรรมการ ๒.) _______ กรรมการ ๓.) กรรมการ", "(นายกฤษณรัฐ โพธ์ชมสมอใจ) (นางสาวธนภรณ์ โสตถิอดม)"].join("\n"),
    "ภาคผนวก ไม่มีลายเซ็น",
    null, // a page that is only a figure
  ]);
  assert.deepEqual(pages.map((p) => [lineList(p.text), p.picture]), [
    [["๑. ระบบกล้อง", "๑.๑ กล้องความละเอียด 4 ล้านพิกเซล", "รองรับ PoE"], false],
    [["๑.๒ บันทึกภาพ 30 วัน", "รองรับ PoE"], false],
    [["๒. ระบบเครือข่าย"], false],
    [["๒.๑ สวิตช์ 24 พอร์ต"], false],
    [["๒.๒ สวิตช์ 48 พอร์ต"], false],
    [["๒.๓ หน่วยความจำ DDR5", "หรือดีกว่า"], false],
    [["ภาคผนวก ไม่มีลายเซ็น"], false],
    [[], true],
  ]);
});

test("a short scanned TOR keeps its repeated lines", () => {
  const pages = scannedTorPages([signed(["๑. ระบบ"]), signed(["๒. ระบบ"])]);
  assert.ok(pages.every((p) => p.text.includes("ประธานกรรมการ")));
});

test("a scanned TOR is read whole page by whole page; each page is saved as it is read and never read twice", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "soc-tor-ocr-"));
  try {
    const file = path.join(dir, "tor.jsonl");
    const pdf = buildTablePdf([{ columns: [], rows: [], scanned: true }, { columns: [], rows: [], scanned: true }]);
    const calls: number[] = [];
    let failOn = 2;
    const readPage: CellReader = async (image, at) => {
      assert.ok(image.length > 1000, "a page image is sent");
      assert.deepEqual([at.row, at.column], [0, 0]);
      if (at.page === failOn) throw new Error("OCR down");
      calls.push(at.page);
      return at.page === 1 ? "๑. ระบบกล้อง" : null;
    };
    const seen: string[] = [];
    const onPage = (done: number, total: number) => { seen.push(`${done}/${total}`); };
    await assert.rejects(readScannedTor(pdf, file, readPage, onPage), /OCR down/);
    assert.equal((await readFile(file, "utf8")).trim().split("\n").length, 1);
    failOn = 0;
    const pages = await readScannedTor(pdf, file, readPage, onPage);
    assert.deepEqual(calls, [1, 2]); // page 1 was not read again
    assert.deepEqual(pages, [{ text: "๑. ระบบกล้อง", picture: false }, { text: "", picture: true }]);
    assert.deepEqual(seen, ["1/2", "1/2", "2/2"]);

    // A line half-written when the process stopped: only that page is read again.
    const saved = await readFile(file, "utf8");
    await writeFile(file, `${saved.split("\n")[0]}\n{"page":2,"te`);
    calls.length = 0;
    await readScannedTor(pdf, file, readPage);
    await readScannedTor(pdf, file, readPage);
    assert.deepEqual(calls, [2]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
