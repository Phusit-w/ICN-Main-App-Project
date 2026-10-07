// The PDF evidence panel (ticket 09): the review page shows the cited page of
// the evidence PDF a row's reference names, rendered on the server with the
// PDF's highlights. Driven through the page-image route and socReviewView(),
// with the signed-in user stubbed.
import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { buildDocx } from "@/test/docx-fixture";
import { buildPdf, pixelAt, pngSize } from "@/test/pdf-fixture";
import { majorItemKey } from "@/lib/soc-major-items";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { GET: pageRoute } = await import("@/app/api/soc/jobs/[id]/evidence/[documentId]/pages/[page]/route");
const { createImportedSocJob } = await import("@/lib/soc");
const { importLocalCheckRun } = await import("@/lib/soc-import");
const { socReviewView } = await import("@/lib/soc-review-view");

let storageRoot = "";
before(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "soc-storage-"));
  process.env.SOC_STORAGE_ROOT = storageRoot;
});
after(() => rm(storageRoot, { recursive: true, force: true }));

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/soc/${name}`, import.meta.url)));
const SOC_DEMO = fixture("SOC_Demo.docx");
const SONNET_RUN = JSON.parse(new TextDecoder().decode(fixture("results_sonnet.json"))) as { results: Record<string, unknown>[] };
// Page 2 has a highlight at (40, 60)–(200, 100) in PDF points.
const DATASHEET = buildPdf(3, [{ page: 2, rect: [40, 60, 200, 100] }]);

function user(username: string, appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: username, passwordHash: "x", role: "USER", appAccess } });
}

async function importedJob(evidence: { name: string; bytes: Uint8Array }[] = [{ name: "Datasheet_Demo.pdf", bytes: DATASHEET }]) {
  const owner = await user(`owner-${Math.random().toString(36).slice(2, 8)}`);
  const jobId = await createImportedSocJob(owner, { title: "SOC Demo", soc: { name: "SOC_Demo.docx", bytes: SOC_DEMO }, evidence });
  const documents = await prisma.socDocument.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
  return { owner, jobId, documents, evidence: (name: string) => documents.find((d) => d.originalName === name)! };
}

function getPage(jobId: string, documentId: string, page: string) {
  return pageRoute(new Request(`http://test/api/soc/jobs/${jobId}/evidence/${documentId}/pages/${page}`), { params: Promise.resolve({ id: jobId, documentId, page }) });
}

test("the cited page renders as an image with its highlight visible", { skip }, async () => {
  const { owner, jobId, evidence } = await importedJob();
  signedIn = owner;
  const doc = evidence("Datasheet_Demo.pdf");

  const page2 = await getPage(jobId, doc.id, "2");
  assert.equal(page2.status, 200);
  assert.equal(page2.headers.get("content-type"), "image/png");
  assert.match(page2.headers.get("cache-control") ?? "", /private/);
  const png = new Uint8Array(await page2.arrayBuffer());
  const { width } = pngSize(png);
  const scale = width / 300;
  const inside = pixelAt(png, Math.round(120 * scale), Math.round(80 * scale));
  const outside = pixelAt(png, Math.round(120 * scale), Math.round(300 * scale));
  assert.deepEqual(inside, [255, 255, 0], "the highlight shows in yellow");
  assert.deepEqual(outside, [255, 255, 255]);

  // Pages are rendered one by one, so a multi-page citation can be paged through.
  const page1 = new Uint8Array(await (await getPage(jobId, doc.id, "1")).arrayBuffer());
  assert.deepEqual(pixelAt(page1, Math.round(120 * scale), Math.round(80 * scale)), [255, 255, 255], "page 1 has no highlight");
});

test("a page the PDF doesn't have, or a PDF that can't be read, answers with a Thai message", { skip }, async () => {
  const { owner, jobId, evidence } = await importedJob([
    { name: "Datasheet_Demo.pdf", bytes: DATASHEET },
    { name: "Broken.pdf", bytes: new TextEncoder().encode("%PDF-1.4\n%not really a pdf\n") },
  ]);
  signedIn = owner;

  for (const page of ["4", "0", "abc"]) {
    const response = await getPage(jobId, evidence("Datasheet_Demo.pdf").id, page);
    assert.equal(response.status, 404, `page ${page}`);
    assert.match((await response.json()).error, /ไม่พบหน้า/);
  }
  const missing = await getPage(jobId, evidence("Datasheet_Demo.pdf").id, "4");
  assert.match((await missing.json()).error, /มีทั้งหมด 3 หน้า/);

  const broken = await getPage(jobId, evidence("Broken.pdf").id, "1");
  assert.equal(broken.status, 422);
  assert.match((await broken.json()).error, /อ่านไฟล์ Broken\.pdf ไม่ได้/);
});

test("only users with soc access get page images, and only of the job's own evidence PDFs", { skip }, async () => {
  const { jobId, documents, evidence } = await importedJob();
  const other = await importedJob();
  const doc = evidence("Datasheet_Demo.pdf");

  signedIn = null;
  assert.equal((await getPage(jobId, doc.id, "1")).status, 401);
  signedIn = await user("no-soc", ["project-card"]);
  assert.equal((await getPage(jobId, doc.id, "1")).status, 403);

  // Any soc user may open an Imported SOC Check, not only its owner.
  signedIn = await user("teammate");
  assert.equal((await getPage(jobId, doc.id, "1")).status, 200);
  assert.equal((await getPage(jobId, other.evidence("Datasheet_Demo.pdf").id, "1")).status, 404, "another job's PDF");
  assert.equal((await getPage(jobId, documents.find((d) => d.type === "SOC")!.id, "1")).status, 404, "the SOC docx");
  assert.equal((await getPage("no-such-job", doc.id, "1")).status, 404);
});

test("each row names the evidence PDF its reference cites", { skip }, async () => {
  const { owner, jobId } = await importedJob([
    { name: "Datasheet_Demo.pdf", bytes: DATASHEET },
    { name: "Other_Brochure.pdf", bytes: buildPdf(1) },
  ]);
  const item = await prisma.socMajorItem.findFirstOrThrow({ where: { jobId, key: "1" } });
  const results = { ...structuredClone(SONNET_RUN), results: SONNET_RUN.results.filter((r) => majorItemKey(String(r.item)) === "1") };
  results.results.find((r) => r.item === "๑.๑.๕")!.reference = "Installation Guide, page 2";
  const imported = await importLocalCheckRun(owner, {
    jobId, majorItemId: item.id, results,
    socCheck: { name: "SOC_Check.docx", bytes: buildDocx("<w:p><w:r><w:t>ผล</w:t></w:r></w:p>") },
    run: { skillVersion: "sha256:66938c26cb0ed5ae", model: "claude-cli:sonnet", source: "manual" },
  });
  assert.ok(imported.ok);

  const datasheet = await prisma.socDocument.findFirstOrThrow({ where: { jobId, originalName: "Datasheet_Demo.pdf" } });
  const rows = new Map((await socReviewView(jobId)).rows.map((r) => [r.item, r]));
  assert.deepEqual(rows.get("๑.๒.๓")!.citations, [{ cited: "Datasheet Demo", document: { id: datasheet.id, name: "Datasheet_Demo.pdf" }, pages: [4, 5] }]);
  assert.deepEqual(rows.get("๑.๑.๕")!.citations, [{ cited: "Installation Guide", document: null, pages: [2] }], "a document the job doesn't have");
});
