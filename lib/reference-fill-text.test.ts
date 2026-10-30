// กรอกอ้างอิง text rules and the read-back guard (proposal-build 09), seam C.
// The expected texts are the team's samples: MOF RFID (แบบไทย) and Apron (แบบอังกฤษ).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterWording, citedPages, formatPages, guessReferenceStyle, pageAddition, readBackProblem, referenceBlocks, referenceText, type DocSheet } from "@/lib/reference-fill-text";

const TOP = "บทที่ 2 แคตตาล็อกและหรือรายการละเอียดคุณลักษณะเฉพาะของพัสดุ";
const SERVER = "2.1 เครื่องคอมพิวเตอร์แม่ข่าย (Server) แบบ On premise";
const xeon: DocSheet = { id: "xeon", path: `${TOP}/${SERVER}/Intel® Xeon® 6505P Processor.pdf`, citationName: "Intel Xeon 6505P Processor" };
const dell: DocSheet = { id: "dell", path: `${TOP}/${SERVER}/Dell PowerEdge R660.pdf`, citationName: "Dell PowerEdge R660" };
const switchSheet: DocSheet = { id: "switch", path: `${TOP}/2.2 อุปกรณ์สลับสัญญาณ (Switch)/Cisco Catalyst 9300.pdf`, citationName: "Cisco Catalyst 9300" };
const casri: DocSheet = { id: "casri", path: "ส่วนที่ 1/08 CASRI Product brochure - surat-1_ab12.pdf", citationName: "CASRI Product brochure" };
const other: DocSheet = { id: "other", path: "ส่วนที่ 1/09 Hikvision DS-2CD.pdf", citationName: "Hikvision DS-2CD" };
const all = [xeon, dell, switchSheet, casri, other];

test("pages: several as 3, 6 and consecutive ones as a range", () => {
  assert.equal(formatPages([6, 3]), "3, 6");
  assert.equal(formatPages([12, 13]), "12-13");
  assert.equal(formatPages([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10");
  assert.deepEqual(citedPages("หน้า 3, 6 และ 12-13"), [3, 6, 12, 13]);
  assert.deepEqual(citedPages("CASRI Product brochure, page 2"), [2]);
  assert.deepEqual(citedPages("หน้าที่ ๔"), [4]);
  assert.deepEqual(citedPages("ไม่มีเลขหน้า"), []);
});

test("แบบไทย (MOF RFID): chapter line, the sub-folder, the file when the folder holds more than one PDF, then the page", () => {
  assert.deepEqual(referenceBlocks("thai", [{ sheet: xeon, pages: [3] }], all), [["เอกสารส่วนที่ 2", SERVER, "Intel® Xeon® 6505P Processor", "หน้า 3"]]);
  assert.equal(referenceText("thai", referenceBlocks("thai", [{ sheet: switchSheet, pages: [6, 3] }], all)), `เอกสารส่วนที่ 2\n2.2 อุปกรณ์สลับสัญญาณ (Switch)\nหน้า 3, 6`, "a folder with one PDF names no file");
});

test("แบบไทย: the chapter's wording follows the rows the SOC already has; no numbered top folder leaves the chapter line out", () => {
  assert.equal(chapterWording(["", "บทที่ 2 / 2.1 / หน้า 3"]), "บทที่");
  assert.equal(chapterWording(["Datasheet หน้า 3"]), "เอกสารส่วนที่");
  assert.deepEqual(referenceBlocks("thai", [{ sheet: switchSheet, pages: [3] }], all, "บทที่")[0].slice(0, 1), ["บทที่ 2"]);
  const loose: DocSheet = { id: "loose", path: "Datasheets/Camera X.pdf", citationName: "Camera X" };
  assert.deepEqual(referenceBlocks("thai", [{ sheet: loose, pages: [4] }], [loose]), [["Datasheets", "หน้า 4"]]);
  const rootFile: DocSheet = { id: "root", path: "Camera X.pdf", citationName: "Camera X" };
  assert.deepEqual(referenceBlocks("thai", [{ sheet: rootFile, pages: [4] }], [rootFile]), [["หน้า 4"]]);
  const dotted: DocSheet = { id: "dotted", path: "2. แคตตาล็อก/2.1 กล้อง/Camera X.pdf", citationName: "Camera X" };
  assert.deepEqual(referenceBlocks("thai", [{ sheet: dotted, pages: [1] }], [dotted])[0].slice(0, 2), ["เอกสารส่วนที่ 2", "2.1 กล้อง"]);
});

test("แบบอังกฤษ (Apron): Citation Name, page; several documents joined by '; '", () => {
  assert.equal(referenceText("english", referenceBlocks("english", [{ sheet: casri, pages: [1] }], all)), "CASRI Product brochure, page 1");
  assert.equal(referenceText("english", referenceBlocks("english", [{ sheet: casri, pages: [3, 6] }, { sheet: other, pages: [12, 13] }], all)), "CASRI Product brochure, page 3, 6; Hikvision DS-2CD, page 12-13");
  assert.equal(referenceText("thai", referenceBlocks("thai", [{ sheet: switchSheet, pages: [3] }, { sheet: casri, pages: [1] }], all)).split("\n").length, 6, "แบบไทย: a block per document, each on its own lines");
});

test("a title-only reference gets only the page: a new line in แบบไทย, ', page N' in แบบอังกฤษ", () => {
  assert.equal(pageAddition("thai", [4]), "หน้า 4");
  assert.equal(pageAddition("english", [4, 5]), ", page 4-5");
});

test("the Reference Style is guessed from the references already in the SOC, else from the TOR's language", () => {
  assert.equal(guessReferenceStyle([{ reference: "เอกสารส่วนที่ 2 หน้า 3", tor: "x" }, { reference: "CASRI, page 1", tor: "x" }, { reference: "หน้า 5", tor: "x" }]), "thai");
  assert.equal(guessReferenceStyle([{ reference: "CASRI Product brochure, page 1", tor: "กล้อง" }]), "english");
  assert.equal(guessReferenceStyle([{ reference: "", tor: "กล้องวงจรปิด ความละเอียด 4K" }]), "thai");
  assert.equal(guessReferenceStyle([{ reference: "", tor: "Camera resolution shall be at least 4K" }]), "english");
});

test("the guard: every text the writer makes reads back to its file and pages", () => {
  const cases: [string, "thai" | "english", DocSheet, number[]][] = [
    ["thai", "thai", xeon, [3]], ["thai", "thai", dell, [3, 6]], ["thai", "thai", switchSheet, [12, 13]],
    ["english", "english", casri, [1]], ["english", "english", other, [3, 6]],
  ];
  for (const [label, style, sheet, pages] of cases) {
    const cited = { sheet, pages };
    assert.equal(readBackProblem(referenceText(style, referenceBlocks(style, [cited], all)), cited, all), null, label);
  }
});

test("the guard: a text that does not land on one file and page is refused with why", () => {
  // Two PDFs of one folder with no file line: the folder alone does not say which.
  assert.match(readBackProblem(`เอกสารส่วนที่ 2\n${SERVER}\nหน้า 3`, { sheet: xeon, pages: [3] }, all)!, /2 ไฟล์/);
  // The same Citation Name on two files.
  const twin = { ...other, id: "twin", path: "ส่วนที่ 1/10 Hikvision DS-2CD copy.pdf" };
  assert.match(readBackProblem("Hikvision DS-2CD, page 2", { sheet: other, pages: [2] }, [...all, twin])!, /2 ไฟล์/);
  // A name no file carries.
  assert.match(readBackProblem("Unknown brochure, page 2", { sheet: casri, pages: [2] }, all)!, /ไม่พบไฟล์/);
  // No page, or other pages.
  assert.match(readBackProblem("CASRI Product brochure", { sheet: casri, pages: [2] }, all)!, /ไม่พบเลขหน้า/);
  assert.match(readBackProblem("CASRI Product brochure, page 5", { sheet: casri, pages: [2] }, all)!, /ไม่ตรง/);
  // A title-only reference whose document is not the chosen one.
  assert.match(readBackProblem("CASRI Product brochure, page 2", { sheet: other, pages: [2] }, all)!, /ไฟล์/);
});
