import { test } from "node:test";
import assert from "node:assert/strict";
import { readTextTor, TOR_IS_SCANNED } from "@/lib/soc-tor-read";
import { buildTablePdf, type TablePage } from "@/test/pdf-table-fixture";

const page = (lines: (string | { text: string; underline?: number[] })[], extra: Partial<TablePage> = {}): TablePage =>
  ({ columns: [], rows: [], lines: lines.map((line) => (typeof line === "string" ? { text: line } : line)), ...extra });

const lineList = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

test("Thai private-use glyphs from the text layer are read back as Thai", () => {
  // พร้อม with its tone mark as the shifted glyph U+F70B; ปี่ with U+F702 + U+F705; U+F8FF a bullet.
  const pages = readTextTor(buildTablePdf([page(["พรอม", "ป", "ข้อ ทดสอบ"])]));
  assert.deepEqual(lineList(pages[0].text), ["พร้อม", "ปี่", "ข้อ ทดสอบ"]);
});

test("an underlined < > + is read as ≤ ≥ ±, a plain one stays", () => {
  const pages = readTextTor(buildTablePdf([page([
    { text: "a < 5 and b > 6", underline: [2] },
    { text: "c > 7 and d + 1", underline: [2, 12] },
    "e < 8",
  ])]));
  assert.deepEqual(lineList(pages[0].text), ["a ≤ 5 and b > 6", "c ≥ 7 and d ± 1", "e < 8"]);
});

test("a running header and the page counter are left out", () => {
  const numbers = [1, 2, 3, 4, 5];
  const pdf = buildTablePdf(numbers.map((n) => page(["การไฟฟ้านครหลวง TOR งานจัดระเบียบสาย", `ข้อความหน้า ${n}`, `(${n}/5)`])));
  const pages = readTextTor(pdf);
  assert.deepEqual(pages.map((p) => lineList(p.text)), numbers.map((n) => [`ข้อความหน้า ${n}`]));
  assert.ok(pages.every((p) => !p.picture));
});

test("a short TOR keeps lines that repeat on its pages", () => {
  // A spec repeated on two pages of three (TORs repeat specs) is TOR text, not a header.
  const pages = readTextTor(buildTablePdf([page(["ข้อ ๑", "เหมือนกัน"]), page(["ข้อ ๒", "เหมือนกัน"]), page(["ข้อ ๓"])]));
  assert.deepEqual(pages.map((p) => lineList(p.text)), [["ข้อ ๑", "เหมือนกัน"], ["ข้อ ๒", "เหมือนกัน"], ["ข้อ ๓"]]);
});

test("a page that is mostly a picture is a picture page", () => {
  const pages = readTextTor(buildTablePdf([
    page(Array(15).fill("ข้อ ๑ ระบบต้องรองรับผู้ใช้งาน")),
    page(["รูปที่ ๑ แผนผัง"], { picture: true }),
    page(Array(15).fill("ข้อ ๒ ระบบต้องรองรับผู้ใช้งาน"), { picture: true }), // a picture beside a page of text
  ]));
  assert.deepEqual(pages.map((p) => p.picture), [false, true, false]);
});

test("a scanned TOR is refused; one scanned page among text pages is a picture page", () => {
  assert.throws(() => readTextTor(buildTablePdf([{ columns: [], rows: [], scanned: true }, { columns: [], rows: [], scanned: true }, page(["ข้อ ๑"])])), { message: TOR_IS_SCANNED });
  const pages = readTextTor(buildTablePdf([page(["ข้อ ๑ ระบบ"]), { columns: [], rows: [], scanned: true }, page(["ข้อ ๒ ระบบ"])]));
  assert.deepEqual(pages.map((p) => p.picture), [false, true, false]);
});

test("a file that is not a readable PDF is refused", () => {
  assert.throws(() => readTextTor(new TextEncoder().encode("not a pdf")), /PDF/);
  assert.throws(() => readTextTor(buildTablePdf([page(["ข้อ ๑"])], { password: "x" })), /รหัสผ่าน/);
});
