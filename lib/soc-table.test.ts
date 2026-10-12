import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSocFile, readSocTable } from "@/lib/soc-table";
import { buildSocDocx } from "@/test/docx-fixture";

const SOC = buildSocDocx([
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"],
  ["๑.", "ระบบเฝ้าระวัง", "", ""],
  ["๑.๑", "กล้อง", "CASRI", "หน้า 3"],
  ["๒.๑", "เรดาร์", "X", "หน้า 5"],
]);

test("one read of a Word SOC gives its major items, its row texts and how to store the file", () => {
  const table = readSocTable(SOC);
  assert.deepEqual(table.majorItems.map((m) => [m.key, m.label, m.title, m.rowCount]), [["1", "๑", "ระบบเฝ้าระวัง", 2], ["2", "๒", null, 1]]);
  assert.deepEqual(table.rowText(3, "๑.๑"), { tor: "กล้อง", proposal: "CASRI" });
  assert.equal(table.rowText(3, "๙.๙"), null);
  assert.deepEqual(table.file, { extension: ".docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
});

test("a Word SOC has no upload warnings, and no row is marked as an image", () => {
  const table = readSocTable(SOC);
  assert.deepEqual(table.warnings, []);
  assert.equal(table.rowText(3, "๑.๑")?.image, undefined);
});

test("at upload a file that isn't a .docx is refused, by its name or by its content", () => {
  assert.doesNotThrow(() => assertSocFile({ name: "SOC ภาคผนวก ก.DOCX", bytes: SOC }));
  assert.throws(() => assertSocFile({ name: "SOC.pdf", bytes: SOC }), /ไฟล์ SOC ต้องเป็น DOCX ที่ถูกต้อง/);
  assert.throws(() => assertSocFile({ name: "SOC.docx", bytes: new TextEncoder().encode("%PDF-1.4") }), /ไฟล์ SOC ต้องเป็น DOCX ที่ถูกต้อง/);
});
