import { test } from "node:test";
import assert from "node:assert/strict";
import { evidencePath, uploadBatches } from "@/lib/soc-upload";
import { evidenceSelectionProblem } from "@/lib/soc-shared";

test("a picked folder keeps its sub-folders in the document name", () => {
  assert.equal(evidencePath("บทที่ 2/2.5 เครื่องอ่าน_ok (P)/1.เครื่องอ่าน/tc22.pdf"), "บทที่ 2/2.5 เครื่องอ่าน_ok (P)/1.เครื่องอ่าน/tc22.pdf");
  assert.equal(evidencePath("tc22.pdf"), "tc22.pdf");
});

test("a path can never climb out of the job or carry a drive, and Windows separators become /", () => {
  assert.equal(evidencePath("../../etc/passwd.pdf"), "etc/passwd.pdf");
  assert.equal(evidencePath("C:\\Users\\x\\2.5\\a.pdf"), "Users/x/2.5/a.pdf");
  assert.equal(evidencePath("/abs/./a.pdf"), "abs/a.pdf");
  assert.equal(evidencePath("a<b>/c:d.pdf"), "a_b_/c_d.pdf");
});

test("a path over 240 characters keeps its file name and the folders nearest to it", () => {
  const long = `${"ก".repeat(200)}/${"ข".repeat(30)}/datasheet.pdf`;
  assert.equal(evidencePath(long), `${"ข".repeat(30)}/datasheet.pdf`);
  assert.equal(evidencePath(`${"x".repeat(300)}.pdf`).length, 240);
});

test("files go up in batches small enough for IIS: at most 50 files and 200 MB each", () => {
  const mb = 1024 * 1024;
  const files = (sizes: number[]) => sizes.map((size, i) => ({ name: `f${i}.pdf`, size: size * mb }));
  assert.deepEqual(uploadBatches(files([100, 90, 20, 5])).map((batch) => batch.map((f) => f.name)), [["f0.pdf", "f1.pdf"], ["f2.pdf", "f3.pdf"]]);
  assert.deepEqual(uploadBatches(files(Array(120).fill(1))).map((batch) => batch.length), [50, 50, 20]);
  assert.deepEqual(uploadBatches([]), []);
});

test("the job as a whole takes up to 200 PDFs and 1 GB, counting what it already has", () => {
  const mb = 1024 * 1024;
  const pdf = (size = 1) => ({ name: "a.pdf", size: size * mb });
  assert.equal(evidenceSelectionProblem([pdf()]), null);
  assert.equal(evidenceSelectionProblem(Array(200).fill(pdf())), null);
  assert.match(evidenceSelectionProblem(Array(201).fill(pdf())) ?? "", /200/);
  assert.match(evidenceSelectionProblem([pdf()], { count: 200, bytes: 0 }) ?? "", /200/);
  assert.match(evidenceSelectionProblem([pdf(100)], { count: 1, bytes: 950 * mb }) ?? "", /1 GB/);
  assert.match(evidenceSelectionProblem([pdf(121)]) ?? "", /120 MB/);
  assert.match(evidenceSelectionProblem([]) ?? "", /PDF/);
});
