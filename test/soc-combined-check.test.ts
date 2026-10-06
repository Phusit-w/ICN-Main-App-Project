// Downloading a job's combined SOC_Check document (ADR 0008, ticket 10),
// driven through the download route with the signed-in user stubbed. The
// document is built by the SOC skill's append_results_to_docx.py, so these
// tests need Python with python-docx (soc-worker/requirements.txt).
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx } from "@/test/docx-fixture";
import { majorItemKey, readZipEntry } from "@/lib/soc-major-items";

function pythonDocxMissing(): false | string {
  try {
    execFileSync(process.env.SOC_PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-c", "import docx"], { stdio: "ignore", windowsHide: true });
    return false;
  } catch {
    return "Python with python-docx not found (set SOC_PYTHON)";
  }
}

const skip = setupTestDatabase() || pythonDocxMissing();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { GET: downloadRoute } = await import("@/app/api/soc/jobs/[id]/soc-check/route");
const { createImportedSocJob } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");

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

// One major item's rows of the real run, each tagged with `marker` as its
// key_issue, which the skill writes into the ประเด็นหลัก column.
function runFor(key: string, marker: string): RunFile {
  const copy = structuredClone(SONNET_RUN);
  copy.results = copy.results.filter((row) => majorItemKey(String(row.item)) === key).map((row) => ({ ...row, key_issue: `${marker} ${row.row}` }));
  return copy;
}

function user(username: string, appAccess: string[] = ["soc"], role = "USER") {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role, appAccess } });
}

async function setup() {
  const owner = await user("owner");
  const jobId = await createImportedSocJob(owner, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence: [{ name: "Datasheet_Demo.pdf", bytes: PDF }] });
  const items = await prisma.socMajorItem.findMany({ where: { jobId }, orderBy: { position: "asc" } });
  const byKey = (key: string) => items.find((m) => m.key === key)!;
  return { owner, jobId, items, byKey };
}

async function importRun(actor: Actor, jobId: string, majorItemId: string, results: RunFile) {
  const imported = await importLocalCheckRun(actor, {
    jobId, majorItemId, results,
    socCheck: { name: "SOC_Check.docx", bytes: SOC_CHECK },
    run: { skillVersion: "sha256:66938c26cb0ed5ae", model: "claude-cli:sonnet", source: "manual" },
  });
  assert.ok(imported.ok, JSON.stringify(imported));
}

function download(jobId: string) {
  return downloadRoute(new Request(`http://localhost/api/soc/jobs/${jobId}/soc-check`), { params: Promise.resolve({ id: jobId }) });
}

const tables = (xml: string) => xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];

test("the download holds every checked major item's latest rows, marks the unchecked ones, and leaves the SOC table unchanged", { skip }, async () => {
  const { owner, jobId, items, byKey } = await setup();
  assert.equal(items.length, 4);
  await importRun(owner, jobId, byKey("1").id, runFor("1", "FIRST-RUN"));
  await importRun(owner, jobId, byKey("2").id, runFor("2", "ITEM-TWO"));
  await importRun(owner, jobId, byKey("1").id, runFor("1", "RECHECKED")); // supersedes FIRST-RUN

  signedIn = await user("colleague"); // any soc user may download
  const response = await download(jobId);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename\*=UTF-8''SOC_Check-/);
  const docx = new Uint8Array(await response.arrayBuffer());
  const xml = readZipEntry(docx, "word/document.xml");

  for (const row of runFor("1", "RECHECKED").results) assert.ok(xml.includes(`RECHECKED ${row.row}`), `latest row ${row.row} of ข้อ ๑`);
  for (const row of runFor("2", "ITEM-TWO").results) assert.ok(xml.includes(`ITEM-TWO ${row.row}`), `row ${row.row} of ข้อ ๒`);
  assert.ok(!xml.includes("FIRST-RUN"), "a superseded run never appears");

  assert.ok(xml.includes("ตรวจแล้ว 2/4 ข้อใหญ่"));
  const uncheckedNote = xml.match(/ยังไม่ได้ตรวจ 2 ข้อใหญ่[^<]*/)?.[0] ?? "";
  assert.match(uncheckedNote, /ข้อ ๓/);
  assert.match(uncheckedNote, /ข้อ ๔/);
  assert.doesNotMatch(uncheckedNote, /ข้อ [๑๒]/);

  const original = tables(readZipEntry(SOC_DEMO, "word/document.xml"));
  assert.ok(original.length > 0);
  assert.deepEqual(tables(xml).slice(0, original.length), original, "the original SOC tables come first, unchanged");

  const event = await prisma.socAuditEvent.findFirstOrThrow({ where: { jobId, action: "SOC_CHECK_DOWNLOADED" } });
  assert.equal(event.actorId, signedIn.id);
  assert.deepEqual((event.detail as { checked: string[]; unchecked: string[] }).unchecked, ["๓", "๔"]);
  assert.equal(await prisma.auditLog.count({ where: { entityId: jobId, action: "SOC_CHECK_DOWNLOADED", actorId: signedIn.id } }), 1);
});

test("a user without soc access can't download, and nothing is audited", { skip }, async () => {
  const { owner, jobId, byKey } = await setup();
  await importRun(owner, jobId, byKey("1").id, runFor("1", "X"));
  signedIn = await user("expense-only", ["expense"]);
  const response = await download(jobId);
  assert.equal(response.status, 403);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "SOC_CHECK_DOWNLOADED" } }), 0);

  signedIn = null;
  assert.equal((await download(jobId)).status, 401);
});

test("before any major item is checked the download is refused with a Thai reason", { skip }, async () => {
  const { owner, jobId } = await setup();
  signedIn = owner;
  const response = await download(jobId);
  assert.equal(response.status, 409);
  assert.match(((await response.json()) as { error: string }).error, /ยังไม่มีข้อใหญ่ที่ตรวจแล้ว/);
  assert.equal(await prisma.socAuditEvent.count({ where: { jobId, action: "SOC_CHECK_DOWNLOADED" } }), 0);
});
