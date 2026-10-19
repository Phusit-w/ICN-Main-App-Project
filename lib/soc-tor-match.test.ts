import { test } from "node:test";
import assert from "node:assert/strict";
import { readSocTable, type SocTableRow } from "@/lib/soc-table";
import { matchTor, type TorMatch, type TorMatchSoc, type TorPage } from "@/lib/soc-tor-match";
import { buildSocDocx } from "@/test/docx-fixture";

const HEADER = ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"];

// A SOC as TOR Match reads it: [item, TOR text, major item key], or an Image Row.
type Row = [item: string, tor: string, majorItem: string] | { image: string };
function soc(rows: Row[], { annexed = false } = {}): TorMatchSoc {
  const tableRows: SocTableRow[] = rows.map((row, i) =>
    Array.isArray(row) ? { position: i + 1, item: row[0], tor: row[1], image: false, majorItem: row[2] } : { position: i + 1, item: "", tor: "", image: true, majorItem: row.image });
  const keys = [...new Set(tableRows.map((row) => row.majorItem!))];
  return { rows: tableRows, majorItems: keys.map((key) => ({ key, label: annexed ? `ผนวก ${key}` : key, groupLabel: null })) };
}
const page = (text: string, picture = false): TorPage => ({ text, picture });
const outcomes = (result: TorMatch) => result.rows.map((row) => [row.item || row.position, row.outcome]);

test("rows are matched by text in TOR order, though the TOR numbers from 1 again under every heading", () => {
  const result = matchTor(soc([
    ["1.", "ข้อกำหนดทั่วไป", "1"],
    ["1.1", "ระบบกล้อง", "1"],
    ["1.1.1", "ความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล", "1"],
    ["1.1.2", "รองรับการบันทึกภาพกลางคืน", "1"],
    ["1.2", "ระบบจัดเก็บ", "1"],
    ["1.2.1", "ความจุไม่น้อยกว่า 8 เทราไบต์", "1"],
    ["1.2.2", "รองรับ RAID 5", "1"],
  ]), [page("1. ข้อกำหนดทั่วไป\nก. ระบบกล้อง\n1. ความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล\n2. รองรับการบันทึกภาพกลางคืน\nข. ระบบจัดเก็บ\n1. ความจุไม่น้อยกว่า 8 เทราไบต์\n2. รองรับ RAID 5\n")]);

  assert.deepEqual(outcomes(result), [["1.", "ตรง"], ["1.1", "ตรง"], ["1.1.1", "ตรง"], ["1.1.2", "ตรง"], ["1.2", "ตรง"], ["1.2.1", "ตรง"], ["1.2.2", "ตรง"]]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.warnings, []);
});

test("a numbered SOC: each major item is the TOR line \"N.\" that reads like its heading row, and a list inside it stays in it", () => {
  // The SOC table reader (ticket 01) keeps the list "1." "2." inside ข้อ 5.
  const table = readSocTable(buildSocDocx([
    HEADER,
    ["1.", "ข้อกำหนดทั่วไป", "", ""],
    ["1.1", "ผู้ยื่นข้อเสนอต้องมีประสบการณ์ไม่น้อยกว่า 3 ปี", "ได้", "หน้า 1"],
    ["5.", "สถานที่ติดตั้ง ดังนี้", "", ""],
    ["1.", "อาคาร A ชั้น 18 จำนวน 4 จุด", "ได้", "หน้า 2"],
    ["2.", "อาคาร A ชั้น 19 จำนวน 6 จุด", "ได้", "หน้า 2"],
    ["6.", "ระบบไฟฟ้าสำรอง", "", ""],
    ["6.1", "เครื่องสำรองไฟขนาดไม่น้อยกว่า 3 kVA", "ได้", "หน้า 3"],
  ]));
  const result = matchTor(table, [
    page("1. ข้อกำหนดทั่วไป\n1.1 ผู้ยื่นข้อเสนอต้องมีประสบการณ์ไม่น้อยกว่า 3 ปี\n"),
    page("5. สถานที่ติดตั้ง ดังนี้\n1. อาคาร A ชั้น 18 จำนวน 4 จุด\n2. อาคาร A ชั้น 19 จำนวน 6 จุด\n"),
    page("6. ระบบไฟฟ้าสำรอง\n6.1 เครื่องสำรองไฟขนาดไม่น้อยกว่า 3 kVA\n"),
  ]);

  assert.deepEqual(result.rows.map((row) => [row.item, row.majorItem, row.outcome, row.torPage]), [
    ["1.", "1", "ตรง", 1], ["1.1", "1", "ตรง", 1],
    ["5.", "5", "ตรง", 2], ["1.", "5", "ตรง", 2], ["2.", "5", "ตรง", 2],
    ["6.", "6", "ตรง", 3], ["6.1", "6", "ตรง", 3],
  ]);
  assert.deepEqual(result.missing, []);
});

test("a ผนวก SOC: each ผนวก is the TOR's last \"ผนวก N\" heading; a ผนวก the SOC lacks is not missing", () => {
  const result = matchTor(soc([
    ["", "ผนวก 7 ตู้กระจายสาย", "7"],
    ["1.", "ตู้ทำจากเหล็กหนาไม่น้อยกว่า 1.2 มิลลิเมตร", "7"],
    ["", "ผนวก 8 สายใยแก้ว", "8"],
    ["1.", "สายมีจำนวนแกนไม่น้อยกว่า 12 core", "8"],
  ], { annexed: true }), [
    page("สารบัญ\nผนวก 7\nผนวก 8\nผนวก 9\n"),
    page("ผนวก 7\nตู้กระจายสาย\n1. ตู้ทำจากเหล็กหนาไม่น้อยกว่า 1.2 มิลลิเมตร\n"),
    page("ผนวก 8\nสายใยแก้ว\n1. สายมีจำนวนแกนไม่น้อยกว่า 12 core\n"),
    page("ผนวก 9\nเสาไฟฟ้า\n1. เสาสูงไม่น้อยกว่า 9 เมตร\n"),
  ]);

  assert.deepEqual(result.rows.map((row) => [row.majorItem, row.outcome, row.torPage]), [["7", "ตรง", 2], ["7", "ตรง", 2], ["8", "ตรง", 3], ["8", "ตรง", 3]]);
  assert.deepEqual(result.missing, []);
});

test("a repeated spec block: an exact copy behind loses to a near match ahead", () => {
  const camera = "กล้องความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล รองรับการบีบอัด H.265 และมีระบบอินฟราเรดระยะไม่น้อยกว่า 30 เมตร";
  const result = matchTor(soc([
    ["1.", "ระบบกล้อง", "1"],
    ["1.2", camera, "1"],
    ["1.4", camera, "1"],
  ]), [page(`1. ระบบกล้อง\n1.2 ${camera}\n`), page(`1.4 ${camera.replace("30 เมตร", "50 เมตร")}\n`)]);

  assert.deepEqual(result.rows.map((row) => [row.item, row.outcome, row.torPage]), [["1.", "ตรง", 1], ["1.2", "ตรง", 1], ["1.4", "ความหมายต่าง", 2]]);
  assert.match(result.rows[2].torText!, /50 เมตร/);
});

// One TOR row with a variant SOC row, between two rows that match.
function oneRow(socText: string, torText: string) {
  const result = matchTor(soc([
    ["1.", "ข้อกำหนดทางเทคนิค", "1"],
    ["1.1", socText, "1"],
    ["1.2", "รับประกันไม่น้อยกว่า 2 ปี นับจากวันส่งมอบ", "1"],
  ]), [page(`1. ข้อกำหนดทางเทคนิค\n1.1 ${torText}\n1.2 รับประกันไม่น้อยกว่า 2 ปี นับจากวันส่งมอบ\n`)]);
  assert.equal(result.rows[2].outcome, "ตรง");
  return { outcome: result.rows[1].outcome, missing: result.missing.map((m) => m.torText) };
}

const SWITCH = "สวิตช์มีพอร์ตไม่น้อยกว่า 24 พอร์ต ความเร็ว 1 Gbps รองรับมาตรฐาน IEEE 802.3at";

test("format only: Thai vs Arabic digits, punctuation and line breaks are ต่างแค่รูปแบบ", () => {
  assert.deepEqual(oneRow(SWITCH.replace("24", "๒๔").replace("802.3at", "๘๐๒.๓at"), SWITCH), { outcome: "ต่างแค่รูปแบบ", missing: [] });
  assert.deepEqual(oneRow(SWITCH.replace(" ความเร็ว", ",\nความเร็ว"), SWITCH), { outcome: "ต่างแค่รูปแบบ", missing: [] });
  assert.deepEqual(oneRow(SWITCH.replace(" ความเร็ว", "\nความเร็ว"), SWITCH), { outcome: "ตรง", missing: [] });
});

test("a changed number, sign or condition is ความหมายต่าง", () => {
  assert.equal(oneRow(SWITCH.replace("24", "16"), SWITCH).outcome, "ความหมายต่าง");
  const sign = "แรงดันไฟฟ้า ≥ 220 โวลต์ ที่ความถี่ 50 เฮิรตซ์ อุณหภูมิใช้งาน 0-40 องศา";
  assert.equal(oneRow(sign.replace("≥", ">"), sign).outcome, "ความหมายต่าง");
  assert.equal(oneRow(SWITCH.replace("ไม่น้อยกว่า", "ไม่เกิน"), SWITCH).outcome, "ความหมายต่าง");
});

test("the TOR text of a near match starts and ends on whole words, not mid-word", () => {
  // MEA page 128: the TOR misspells "Wight", the SOC types "Weight"; the shared run starts at "ight".
  const result = matchTor(soc([
    ["1.", "ตู้ขนาดดังนี้", "1"],
    ["", "* Depth : ≥ 120 มิลลิเมตร", "1"],
    ["", "* Weight : ≤ 12 กิโลกรัม", "1"],
  ]), [page("1. ตู้ขนาดดังนี้\n*   Depth   :   ≥  120  มิลลิเมตร\n*   Wight   :   ≤  12 กิโลกรัม\n")]);
  assert.deepEqual(result.rows.map((row) => [row.outcome, row.torText?.trim()]), [["ตรง", "ตู้ขนาดดังนี้"], ["ตรง", "Depth   :   ≥  120  มิลลิเมตร"], ["ความหมายต่าง", "Wight   :   ≤  12 กิโลกรัม"]]);
});

test("a dropped middle word is ความหมายต่าง; a dropped last word leaves it ไม่พบใน SOC", () => {
  assert.equal(oneRow(SWITCH.replace(" ความเร็ว 1 Gbps", ""), SWITCH).outcome, "ความหมายต่าง");
  assert.deepEqual(oneRow(SWITCH.replace(" IEEE 802.3at", ""), SWITCH), { outcome: "ตรง", missing: ["IEEE 802.3at\n1.2"] }); // the next row's number runs on
});

test("a TOR item with no SOC row is ไม่พบใน SOC with its page; a SOC row not in the TOR is ไม่พบใน TOR", () => {
  const result = matchTor(soc([
    ["1.", "ข้อกำหนดทางเทคนิค", "1"],
    ["1.1", "รองรับการทำงานต่อเนื่อง 24 ชั่วโมง", "1"],
    ["1.2", "มีระบบแจ้งเตือนผ่านแอปพลิเคชันบนโทรศัพท์มือถือ", "1"],
  ]), [page("1. ข้อกำหนดทางเทคนิค\n1.1 รองรับการทำงานต่อเนื่อง 24 ชั่วโมง\n"), page("1.3 ผู้ขายต้องจัดอบรมการใช้งานไม่น้อยกว่า 2 วัน\n")]);

  assert.deepEqual(outcomes(result), [["1.", "ตรง"], ["1.1", "ตรง"], ["1.2", "ไม่พบใน TOR"]]);
  assert.deepEqual(result.missing, [{ section: "ข้อ 1", torText: "1.3 ผู้ขายต้องจัดอบรมการใช้งานไม่น้อยกว่า 2 วัน", torPage: 2 }]);
});

test("an Image Row, and a row the TOR may have on a picture page, are ยืนยันไม่ได้", () => {
  const result = matchTor(soc([
    ["1.", "ข้อกำหนดตู้", "1"],
    { image: "1" },
    ["1.1", "ตู้มีสีเทา RAL 7035 ตามรูปตัวอย่าง", "1"],
  ]), [page("1. ข้อกำหนดตู้\n"), page("", true)]);

  assert.deepEqual(outcomes(result), [["1.", "ตรง"], [2, "ยืนยันไม่ได้"], ["1.1", "ยืนยันไม่ได้"]]);
});

test("a major item the TOR has no section for: its rows are ยืนยันไม่ได้ and the job is warned", () => {
  const result = matchTor(soc([
    ["1.", "ข้อกำหนดทั่วไป", "1"],
    ["3.", "ระบบไฟฟ้าสำรอง", "3"],
    ["3.1", "เครื่องสำรองไฟขนาดไม่น้อยกว่า 3 kVA", "3"],
  ]), [page("1. ข้อกำหนดทั่วไป\n")]);

  assert.deepEqual(outcomes(result), [["1.", "ตรง"], ["3.", "ยืนยันไม่ได้"], ["3.1", "ยืนยันไม่ได้"]]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /ข้อ 3/);
});

// The prototype's mutation test on one fixture: change one ตรง row one way at
// a time; a real change must always be noticed, a digit-script change never.
test("number, sign and condition changes always flag; digit-script changes never do", () => {
  const rows: [string, string][] = [
    ["1.1", "เครื่องแม่ข่ายมีหน่วยประมวลผลไม่น้อยกว่า 16 แกน ความเร็วไม่น้อยกว่า 2.4 GHz"],
    ["1.2", "หน่วยความจำ ≥ 128 GB แบบ DDR5 ขยายได้ถึง 1 TB"],
    ["1.3", "มีพอร์ตเครือข่ายความเร็ว 10 Gbps จำนวนไม่น้อยกว่า 4 พอร์ต"],
    ["1.4", "แหล่งจ่ายไฟแบบ Hot-swap จำนวน 2 ชุด กำลังไม่น้อยกว่า 800 วัตต์"],
    ["1.5", "อุณหภูมิใช้งาน ≤ 35 องศาเซลเซียส ความชื้นสัมพัทธ์ 8-90 เปอร์เซ็นต์"],
  ];
  const pages = [page(`1. ข้อกำหนดเครื่องแม่ข่าย\n${rows.map(([item, text]) => `${item} ${text}`).join("\n")}\n`)];
  const run = (texts: string[]) => matchTor(soc([["1.", "ข้อกำหนดเครื่องแม่ข่าย", "1"], ...rows.map(([item], i): Row => [item, texts[i], "1"])]), pages);
  const base = run(rows.map(([, text]) => text));
  assert.ok(base.rows.every((row) => row.outcome === "ตรง"));

  const mutations: [string, (s: string) => string | null, boolean][] = [
    ["number + 1", (s) => (/\d/.test(s) ? s.replace(/\d+/, (n) => String(Number(n) + 1)) : null), true],
    ["≥ ↔ ≤", (s) => (/[≥≤]/.test(s) ? s.replace(/[≥≤]/g, (c) => (c === "≥" ? "≤" : "≥")) : null), true],
    ["ไม่น้อยกว่า → ไม่เกิน", (s) => (s.includes("ไม่น้อยกว่า") ? s.replace("ไม่น้อยกว่า", "ไม่เกิน") : null), true],
    ["Thai digits", (s) => (/\d/.test(s) ? s.replace(/\d/g, (d) => String.fromCharCode(0x0e50 + Number(d))) : null), false],
  ];
  for (const [name, mutate, mustFlag] of mutations) {
    let tried = 0;
    rows.forEach(([, text], i) => {
      const changed = mutate(text);
      if (!changed) return;
      tried++;
      const result = run(rows.map(([, t], k) => (k === i ? changed : t)));
      const flagged = !["ตรง", "ต่างแค่รูปแบบ"].includes(result.rows[i + 1].outcome) || result.missing.length > base.missing.length;
      assert.equal(flagged, mustFlag, `${name}: ${changed}`);
    });
    assert.ok(tried > 0, name);
  }
});
