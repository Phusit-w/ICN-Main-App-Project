// The review page of an Imported SOC Check (ticket 08): what an import fills
// in for the page, the per-row Final Decision, and the view the page reads.
// Driven through importLocalCheckRun(), the decideSocRow action, the upload
// route and socReviewView(), with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx } from "@/test/docx-fixture";
import { majorItemKey } from "@/lib/soc-major-items";
import { socAxisValueLabel } from "@/lib/soc-review";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: importRoute } = await import("@/app/api/soc/jobs/[id]/major-items/[itemId]/import/route");
const { createImportedSocJob } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");
const { socReviewView } = await import("@/lib/soc-review-view");
const { decideSocRow } = await import("@/actions/soc");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

type Row = Record<string, unknown>;
type RunFile = { results: Row[] } & Record<string, unknown>;
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/soc/${name}`, import.meta.url)));
const SOC_DEMO = fixture("SOC_Demo.docx");
const SONNET_RUN = JSON.parse(new TextDecoder().decode(fixture("results_sonnet.json"))) as RunFile;
const SOC_CHECK = buildDocx("<w:p><w:r><w:t>ผลการตรวจสอบ SOC</w:t></w:r></w:p>");
const PDF = new TextEncoder().encode("%PDF-1.4\n%fake evidence\n");

function runFor(key: string): RunFile {
  const copy = structuredClone(SONNET_RUN);
  copy.results = copy.results.filter((row) => majorItemKey(String(row.item)) === key);
  return copy;
}

function user(username: string, appAccess: string[] = ["soc"], role = "USER") {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess } });
}

async function importedJob(ownerName = "owner") {
  const owner = await user(ownerName);
  const jobId = await createImportedSocJob(owner, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "Datasheet_Demo.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  return { owner, jobId, items, item: (key: string) => items.find((m) => m.key === key)! };
}

function importRun(actor: Actor, jobId: string, majorItemId: string, results: unknown) {
  return importLocalCheckRun(actor, {
    jobId, majorItemId, results,
    socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK },
    run: { skillVersion: "sha256:66938c26cb0ed5ae", model: "claude-cli:sonnet", source: "manual" },
  });
}

const rowOf = (jobId: string, item: string) => prisma.socCheckResult.findFirstOrThrow({ where: { jobId, item } });

test("an import fills the TOR text, the bidder's text and the cited pages from the job's SOC", { skip }, async () => {
  const { owner, jobId, item } = await importedJob();
  assert.ok((await importRun(owner, jobId, item("1").id, runFor("1"))).ok);

  const zoom = await rowOf(jobId, "๑.๒.๓");
  assert.match(zoom.socText, /^การย่อขยาย \(Zoom\) แบบดิจิตอล/);
  assert.match(zoom.proposalText ?? "", /^Supports zoom function: 16x digital/);
  assert.deepEqual(zoom.referencePages, [4, 5]);

  const heading = await rowOf(jobId, "๑.");
  assert.match(heading.socText, /^ระบบเฝ้าระวังพื้นที่ขนาดใหญ่/);
  assert.deepEqual(heading.referencePages, []);
});

test("an import still succeeds, with empty text, when the SOC has no matching row", { skip }, async () => {
  const { owner, jobId, item } = await importedJob();
  const run = runFor("1");
  // A row number past the table and an item the SOC doesn't have.
  const target = run.results.find((r) => r.item === "๑.๑.๙")!;
  target.row = 99;
  target.item = "๑.๙.๙";
  assert.ok((await importRun(owner, jobId, item("1").id, run)).ok);
  const row = await rowOf(jobId, "๑.๙.๙");
  assert.deepEqual([row.socText, row.proposalText, row.referencePages], ["", null, [3]]);
});

test("any soc user, including whoever ran the check, sets a Final Decision and note, audited and apart from the recommendation", { skip }, async () => {
  const { jobId, item } = await importedJob();
  const runner = await user("runner");
  assert.ok((await importRun(runner, jobId, item("3").id, runFor("3"))).ok);
  const row = await rowOf(jobId, "๓.๓.๑");
  assert.equal(row.torDecision, "non_compliant");

  signedIn = runner;
  await decideSocRow({ jobId, resultId: row.id, decision: "compliant", note: "  ผู้ตรวจยืนยันจากหน้า 9 ว่าแสดงเวลาได้  " });
  const decided = await prisma.socCheckResult.findUniqueOrThrow({ where: { id: row.id } });
  assert.deepEqual([decided.finalDecision, decided.finalNote, decided.reviewedById], ["compliant", "ผู้ตรวจยืนยันจากหน้า 9 ว่าแสดงเวลาได้", runner.id]);
  assert.ok(decided.reviewedAt);
  // The System Recommendation is untouched.
  assert.equal(decided.torDecision, "non_compliant");

  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "ROW_DECIDED" } });
  assert.equal(event.actorId, runner.id);
  assert.deepEqual(event.detail, { resultId: row.id, rowNumber: row.rowNumber, item: "๓.๓.๑", decision: "compliant", note: "ผู้ตรวจยืนยันจากหน้า 9 ว่าแสดงเวลาได้", previousDecision: null, recommendation: "non_compliant" });
  assert.equal((await prisma.auditLog.findFirstOrThrow({ where: { entityId: jobId, action: "SOC_ROW_DECIDED" } })).actorId, runner.id);

  // A colleague changes it; the previous decision is in the new event.
  signedIn = await user("colleague");
  await decideSocRow({ jobId, resultId: row.id, decision: "non_compliant", note: "" });
  const changed = await prisma.socCheckResult.findUniqueOrThrow({ where: { id: row.id } });
  assert.deepEqual([changed.finalDecision, changed.finalNote, changed.reviewedById], ["non_compliant", null, signedIn.id]);
  const events = await prisma.socAuditEvent.findMany({ where: { jobId, action: "ROW_DECIDED" }, orderBy: { createdAt: "asc" } });
  assert.equal((events[1].detail as { previousDecision: string }).previousDecision, "compliant");
});

test("a Final Decision is refused for a bad value, a long note, a heading row, another job's row or a user without soc access", { skip }, async () => {
  const { owner, jobId, item } = await importedJob();
  assert.ok((await importRun(owner, jobId, item("1").id, runFor("1"))).ok);
  const row = await rowOf(jobId, "๑.๑");
  const heading = await rowOf(jobId, "๑.");
  const other = await importedJob("other-owner");
  signedIn = owner;

  await assert.rejects(decideSocRow({ jobId, resultId: row.id, decision: "match", note: "" }), /Final Decision/);
  await assert.rejects(decideSocRow({ jobId, resultId: row.id, decision: "better", note: "ก".repeat(2001) }), /2,000/);
  await assert.rejects(decideSocRow({ jobId, resultId: heading.id, decision: "compliant", note: "" }), /หัวข้อ/);
  await assert.rejects(decideSocRow({ jobId: other.jobId, resultId: row.id, decision: "compliant", note: "" }), /ไม่พบ/);
  signedIn = await user("expense-only", ["expense"]);
  await assert.rejects(decideSocRow({ jobId, resultId: row.id, decision: "compliant", note: "" }));

  assert.equal(await prisma.socCheckResult.count({ where: { jobId, reviewedAt: { not: null } } }), 0);
  assert.equal(await prisma.socAuditEvent.count({ where: { action: "ROW_DECIDED" } }), 0);
});

test("a row decided on the review page makes a re-check answer 409", { skip }, async () => {
  const { owner, jobId, item } = await importedJob();
  assert.ok((await importRun(owner, jobId, item("1").id, runFor("1"))).ok);
  const row = await rowOf(jobId, "๑.๑.๑");
  signedIn = owner;
  await decideSocRow({ jobId, resultId: row.id, decision: "better", note: "" });

  const form = new FormData();
  form.set("results", new File([JSON.stringify(runFor("1"))], "results.json", { type: "application/json" }));
  form.set("socCheck", new File([SOC_CHECK], "SOC_Check.docx"));
  const response = await importRoute(
    new Request(`http://localhost/api/soc/jobs/${jobId}/major-items/${item("1").id}/import`, { method: "POST", body: form }),
    { params: Promise.resolve({ id: jobId, itemId: item("1").id }) },
  );
  assert.equal(response.status, 409);
  assert.deepEqual(((await response.json()) as { confirmedRows: unknown }).confirmedRows, [{ rowNumber: row.rowNumber, item: "๑.๑.๑" }]);
});

test("a run with highlight_check partial_visible imports, and the row passes with the Thai label", { skip }, async () => {
  const { owner, jobId, item } = await importedJob();
  const run = runFor("1");
  const zoom = run.results.find((r) => r.item === "๑.๒.๓")!;
  zoom.highlight_check = "partial_visible";
  assert.ok((await importRun(owner, jobId, item("1").id, run)).ok);

  const row = (await socReviewView(jobId)).rows.find((r) => r.item === "๑.๒.๓")!;
  assert.deepEqual([row.status, row.reasons], ["ok", []]);
  const highlight = row.axes.find((a) => a.key === "highlight_check")!;
  assert.deepEqual([highlight.value, highlight.ok, socAxisValueLabel(highlight.value)], ["partial_visible", true, "ครบตามที่เห็นในหน้า (บางคำไม่ได้ highlight)"]);
});

test("the review view lists rows with their status, problems first, and shows a major item confirmed once every row is decided", { skip }, async () => {
  const { owner, jobId, item } = await importedJob();
  assert.ok((await importRun(owner, jobId, item("1").id, runFor("1"))).ok);
  assert.ok((await importRun(owner, jobId, item("3").id, runFor("3"))).ok);

  let view = await socReviewView(jobId);
  assert.deepEqual(view.rows.map((r) => [r.item, r.status]), [
    ["๓.๓.๑", "fail"], ["๑.๑", "review"],
    ["๑.๑.๑", "ok"], ["๑.๑.๕", "ok"], ["๑.๑.๙", "ok"], ["๑.๒.๓", "ok"], ["๑.๓.๑", "ok"], ["๓.๒", "ok"],
  ]);
  const zoom = view.rows.find((r) => r.item === "๑.๒.๓")!;
  assert.deepEqual([zoom.majorItemId, zoom.referencePages, zoom.systemRecommendation, zoom.declaredSelection, zoom.finalDecision], [item("1").id, [4, 5], "better", "better", null]);
  assert.match(zoom.torText, /Zoom/);
  assert.equal(zoom.axes.find((a) => a.key === "highlight_check")?.value, "complete");
  assert.deepEqual(view.confirmedItemIds, []);

  signedIn = owner;
  for (const row of view.rows.filter((r) => r.majorItemId === item("3").id)) {
    await decideSocRow({ jobId, resultId: row.id, decision: "compliant", note: "" });
  }
  view = await socReviewView(jobId);
  assert.deepEqual(view.confirmedItemIds, [item("3").id]);
  const decided = view.rows.find((r) => r.item === "๓.๓.๑")!;
  assert.deepEqual([decided.finalDecision, decided.systemRecommendation, decided.reviewedByName], ["compliant", "non_compliant", "owner"]);
});
