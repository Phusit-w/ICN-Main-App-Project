import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSocFile, readSocTable } from "@/lib/soc-table";
import { buildDocx, buildSocDocx, PNG, tableXml } from "@/test/docx-fixture";

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

test("a Word SOC's Bidder Remark is the column its header row names หมายเหตุ / Remark", () => {
  const table = readSocTable(buildSocDocx([
    ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ", "หมายเหตุ"],
    ["๑.", "ระบบเฝ้าระวัง", "", "", ""],
    ["๑.๑", "กล้อง", "CASRI", "หน้า 3", "ความละเอียด 4K"],
    ["๑.๒", "เรดาร์", "X", "หน้า 5", ""],
  ]));
  assert.deepEqual(table.rowText(3, "๑.๑"), { tor: "กล้อง", proposal: "CASRI", remark: "ความละเอียด 4K" });
  assert.deepEqual(table.rowText(4, "๑.๒"), { tor: "เรดาร์", proposal: "X" });
  // A header row without such a column: no remark, though cells follow the reference.
  const noRemark = readSocTable(buildSocDocx([
    ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "Reference", "ตรงตามข้อกำหนด"],
    ["1.1", "กล้อง", "CASRI", "page 3", "ใช่"],
  ]));
  assert.deepEqual(noRemark.rowText(2, "1.1"), { tor: "กล้อง", proposal: "CASRI" });
  // A title with a number above the header row doesn't hide the header.
  const underTitle = readSocTable(buildSocDocx([
    ["ผนวก 7 รายละเอียดของ Indoor Fiber"],
    ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "หมายเหตุ", "เอกสารอ้างอิง"],
    ["1.1", "กล้อง", "CASRI", "ความละเอียด 4K", "หน้า 3"],
  ]));
  assert.equal(underTitle.rowText(3, "1.1")?.remark, "ความละเอียด 4K");
});

// Shaped like MEA Y69 ผนวก 11: the first row is the ผนวก title (no header row),
// the TOR cell spans several grid columns or is split in two, the Comply and
// Better boxes (ticks Word draws as symbols, so no text) come right after it:
// there is no offer column. Then the reference, then the remark.
const MEA_SOC = buildSocDocx([
  ["", { text: "ผนวก 11 รายละเอียดของ Optical Fiber Closure", span: 3 }, "", "", "เอกสารส่วนที่ 25.5 Optical Fiber Closure", ""],
  ["1.", { text: "ข้อกำหนดทั่วไป", span: 3 }, "", "", "", ""],
  ["1.1", { text: "ข้อกำหนดนี้เป็นรายละเอียดของ Optical Fiber Closure", span: 3 }, "", "", "เอกสารส่วนที่ 25.5 Optical Fiber Closure", "max. 96 fibers"],
  ["1.2", { text: "สามารถใช้กับสายที่ติดตั้งแบบแขวน", span: 3 }, "", "", "เอกสารส่วนที่ 25.5 Optical Fiber Closure", ""],
  ["2.4", "ความยาว", { text: ": ≤ 580 มิลลิเมตร", span: 2 }, "", "", "เอกสารส่วนที่ 25.5 Optical Fiber Closure", ""],
  ["3.3", { text: "มี Heat shrink splice protector", span: 3 }, "ü", "", "เอกสารส่วนที่ 25.5 Optical Fiber Closure", "as per requirement"],
]);

test("with no header row, the Bidder Remark is the column with text after the reference column", () => {
  const table = readSocTable(MEA_SOC);
  assert.equal(table.rowText(3, "1.1")?.remark, "max. 96 fibers");
  assert.equal(table.rowText(6, "3.3")?.remark, "as per requirement");
  assert.equal(table.rowText(4, "1.2")?.remark, undefined);
  assert.equal(table.rowText(5, "2.4")?.remark, undefined);
});

test("a Word SOC with no offer column gives no offer text, not the tick box or the rest of a split TOR", () => {
  const table = readSocTable(MEA_SOC);
  assert.deepEqual(table.rowText(3, "1.1"), { tor: "ข้อกำหนดนี้เป็นรายละเอียดของ Optical Fiber Closure", proposal: null, remark: "max. 96 fibers" });
  assert.equal(table.rowText(5, "2.4")?.proposal, null);
  assert.equal(table.rowText(6, "3.3")?.proposal, null);
});

test("a Word SOC with no offer column joins a TOR split over two cells", () => {
  const table = readSocTable(MEA_SOC);
  assert.equal(table.rowText(5, "2.4")?.tor, "ความยาว : ≤ 580 มิลลิเมตร");
  assert.equal(table.rowText(6, "3.3")?.tor, "มี Heat shrink splice protector");
});

// Rows 4 and 6 have an image in the TOR cell and no text: Image Rows.
const OTHER_PNG = new Uint8Array([...PNG, 0]);
const SOC_WITH_IMAGES = buildSocDocx([
  ["ลำดับ", "ข้อกำหนด TOR", "ข้อเสนอ", "เลขอ้างอิงในเอกสารข้อเสนอ"],
  ["๑.", "ท่อร้อยสาย", "", ""],
  ["๑.๑", "ขนาดท่อตามตาราง", "HDPE", "หน้า 3"],
  ["", { image: PNG }, "", ""],
  ["๑.๒", "ข้อต่อ", "ตามรูป", "หน้า 4"],
  ["", { image: OTHER_PNG, name: "image2.jpeg", vml: true }, "ตามรูป", "หน้า 5"],
  ["๒.๑", "เรดาร์", "X", "หน้า 6"],
]);

test("a row whose TOR cell is an image is an Image Row of the numbered row above it", () => {
  const table = readSocTable(SOC_WITH_IMAGES);
  assert.deepEqual(table.majorItems.map((m) => [m.label, m.rowCount]), [["๑", 5], ["๒", 1]]);
  assert.deepEqual(table.rowText(4, "๑.๑"), { tor: "", proposal: "", image: true });
  assert.deepEqual(table.rowText(6, "๑.๒"), { tor: "", proposal: "ตามรูป", image: true });
  assert.equal(table.rowText(3, "๑.๑")?.image, undefined);
});

test("an Image Row's image comes out of the SOC file, whichever way Word stored it", () => {
  const table = readSocTable(SOC_WITH_IMAGES);
  assert.deepEqual(table.rowImage(4, "๑.๑"), { name: "image1.png", data: PNG, mimeType: "image/png" });
  assert.deepEqual(table.rowImage(6, "๑.๒"), { name: "image2.jpeg", data: OTHER_PNG, mimeType: "image/jpeg" });
  assert.equal(table.rowImage(3, "๑.๑"), null, "a typed row");
  assert.equal(table.rowImage(99, "๑.๑"), null);
});

test("in a SOC of several tables an Image Row is found under its own numbered row, and its image wherever Word filed it", () => {
  const relationship = (id: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;
  const table = readSocTable(buildDocx(
    tableXml([["๑.๑", "ท่อ", "HDPE"], ["", { image: PNG }, ""]], () => "rId1") + tableXml([["๒.๑", "ข้อต่อ", "PVC"], ["", { image: OTHER_PNG }, ""]], () => "rId2"),
    { parts: {
      "word/_rels/document.xml.rels": `<Relationships>${relationship("rId1", "../media/a.png")}${relationship("rId2", "/word/media/b.png")}</Relationships>`,
      "media/a.png": PNG, "word/media/b.png": OTHER_PNG,
    } },
  ));
  assert.deepEqual(table.rowText(2, "๒.๑"), { tor: "", proposal: "", image: true });
  assert.deepEqual(table.rowImage(2, "๑.๑")?.data, PNG);
  assert.deepEqual(table.rowImage(2, "๒.๑")?.data, OTHER_PNG);
  assert.equal(table.rowImage(2, "๓.๑"), null);
});

test("an image kind a browser can't show has no type, and a typed TOR cell with an image is not an Image Row", () => {
  const emf = readSocTable(buildSocDocx([["๑.๑", "กล้อง", "CASRI"], ["", { image: PNG, name: "image1.emf" }, ""]]));
  assert.equal(emf.rowImage(2, "๑.๑")?.mimeType, null);

  const image = `<w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r>`;
  const cell = (xml: string) => `<w:tc><w:p>${xml}</w:p></w:tc>`;
  const text = (value: string) => `<w:r><w:t>${value}</w:t></w:r>`;
  const table = readSocTable(buildDocx(`<w:tbl><w:tr>${cell(text("๑.๑"))}${cell(text("ตามรูป") + image)}${cell(text("CASRI") + image)}</w:tr><w:tr>${cell("")}${cell(text("เงื่อนไข"))}${cell(image)}</w:tr></w:tbl>`));
  assert.deepEqual(table.rowText(1, "๑.๑"), { tor: "ตามรูป", proposal: "CASRI" });
  assert.deepEqual(table.rowText(2, "๑.๑"), { tor: "เงื่อนไข", proposal: "" }, "an image in the proposal cell");
  assert.equal(table.rowImage(1, "๑.๑"), null);
});

test("at upload a Word SOC is taken whatever the case of its extension", () => {
  assert.doesNotThrow(() => assertSocFile({ name: "SOC ภาคผนวก ก.DOCX", bytes: SOC }));
});
