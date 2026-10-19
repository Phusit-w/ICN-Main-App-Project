import { test } from "node:test";
import assert from "node:assert/strict";
import { torDiff, type DiffPart } from "@/lib/soc-tor-diff";

// The changed text of each side, in order.
const changed = (parts: DiffPart[]) => parts.filter((part) => part.changed).map((part) => part.text.trim());
// Each side, joined back, is its text unchanged.
const joined = (parts: DiffPart[]) => parts.map((part) => part.text).join("");

test("a changed number is highlighted on both sides", () => {
  const soc = "ซีพียูไม่น้อยกว่า (8 core)";
  const tor = "ซีพียูไม่น้อยกว่า (๑๒ core)";
  const diff = torDiff(soc, tor);
  assert.deepEqual(changed(diff.soc), ["8"]);
  assert.deepEqual(changed(diff.tor), ["๑๒"]);
  assert.equal(joined(diff.soc), soc);
  assert.equal(joined(diff.tor), tor);
});

test("a changed word is highlighted, the shared words are not", () => {
  const diff = torDiff("หน่วยความจำไม่เกิน 16 GB", "หน่วยความจำไม่น้อยกว่า 16 GB");
  assert.deepEqual(changed(diff.soc), ["เกิน"]);
  assert.deepEqual(changed(diff.tor), ["น้อยกว่า"]);
});

test("a changed comparison sign is highlighted", () => {
  const diff = torDiff("ความเร็ว > 100 Mbps", "ความเร็ว ≥ 100 Mbps");
  assert.deepEqual(changed(diff.soc), [">"]);
  assert.deepEqual(changed(diff.tor), ["≥"]);
  assert.deepEqual(changed(torDiff("ค่าคลาดเคลื่อน 5%", "ค่าคลาดเคลื่อน ± 5%").tor), ["±"]);
});

test("Thai vs Arabic digits, punctuation, spaces and line breaks are not highlighted", () => {
  const diff = torDiff("1.1 กล้องความละเอียดไม่น้อยกว่า 4 ล้านพิกเซล, Full HD", "๑.๑  กล้องความละเอียด\nไม่น้อยกว่า ๔ ล้านพิกเซล Full HD");
  assert.deepEqual(changed(diff.soc), []);
  assert.deepEqual(changed(diff.tor), []);
  assert.deepEqual(changed(torDiff("Full HD", "full hd").soc), []);
});

test("a thousands comma or a space OCR put inside a Thai word is not highlighted", () => {
  assert.deepEqual(changed(torDiff("กำลังไฟ 1,000 วัตต์", "กำลังไฟ ๑๐๐๐ วัตต์").soc), []);
  const spaced = torDiff("กล้องความละเอียดสูง", "กล้องความ ละเอียดสูง");
  assert.deepEqual([changed(spaced.soc), changed(spaced.tor)], [[], []]);
  assert.equal(joined(spaced.tor), "กล้องความ ละเอียดสูง");
  // Latin words still part at a space: one changed word marks that word only.
  assert.deepEqual(changed(torDiff("Full HD", "Full 4K").soc), ["HD"]);
});

test("a dropped word is highlighted on the side that has it only", () => {
  const diff = torDiff("รองรับการทำงาน 24 ชั่วโมง", "รองรับการทำงานต่อเนื่อง 24 ชั่วโมง");
  assert.deepEqual(changed(diff.soc), []);
  assert.deepEqual(changed(diff.tor), ["ต่อเนื่อง"]);
});

test("a missing side gives an empty diff for it", () => {
  const diff = torDiff(null, "ข้อความใน TOR");
  assert.deepEqual(diff.soc, []);
  assert.deepEqual(changed(diff.tor), []);
  assert.equal(joined(diff.tor), "ข้อความใน TOR");
});
