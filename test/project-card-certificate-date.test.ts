// Certificate Date and the document filters on ค้นหาโครงการ
// (app/(app)/project-card/CONTEXT.md's Certificate Date entry): pushed by a
// batch, never erased by a later push, never overwritten once a person edits
// it, shown in the popup's หนังสือรับรอง row, and filterable by age.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import {
  certificateIssuedSince,
  formatCertificateDate,
  parseCertificateDate,
} from "@/lib/project-card-certificate-date";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }), redirect: () => { throw new Error("REDIRECT"); } } });

const { POST: ingest } = await import("@/app/api/project-card/ingest/route");
const { updateProjectCardDetails } = await import("@/actions/projectCard");
const { default: ProjectCardPage } = await import("@/app/(app)/project-card/page");

const KEY = "test-ingest-key";
process.env.PROJECT_CARD_INGEST_KEY = KEY;
const CERT = String.raw`\\192.168.99.1\PS\_BID\02 Work Certificate\PEA\PEA001.pdf`;
const CONTRACT = String.raw`\\192.168.99.1\PS\_BID\01 Contract\PEA\PEA001.pdf`;

async function push(projects: Record<string, unknown>[]) {
  const response = await ingest(
    new Request("http://localhost/api/project-card/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ projects }),
    }),
  );
  return (await response.json()) as { created: number; updated: number; rejected: number; errors: { message: string }[] };
}

const card = (projectCode: string, extra: Record<string, unknown> = {}) => ({
  projectCode, client: "PEA", projectName: `โครงการ ${projectCode}`, ...extra,
});

async function signIn() {
  signedIn = await prisma.user.create({
    data: { username: "editor", passwordHash: "x", displayName: "ผู้แก้", appAccess: ["project-card-edit"] },
  });
}

async function pageHtml(searchParams: Record<string, string | string[]>) {
  return renderToStaticMarkup(await ProjectCardPage({ searchParams: Promise.resolve(searchParams) }));
}

test("a Certificate Date is a real calendar date written YYYY-MM-DD", () => {
  assert.equal(parseCertificateDate("2024-03-12")?.toISOString(), "2024-03-12T00:00:00.000Z");
  for (const bad of ["2024-02-30", "12/03/2024", "2567-03-12", "1999-12-31", "2024-3-12", ""]) {
    assert.equal(parseCertificateDate(bad), null, bad);
  }
});

test("a Certificate Date shows as a short Buddhist-era date", () => {
  assert.equal(formatCertificateDate(new Date("2024-03-12T00:00:00Z")), "12 มี.ค. 2567");
});

test("'issued within N years' counts back from today's date in Bangkok", () => {
  // 2026-10-27 01:00 Bangkok is still 2026-10-26 in UTC.
  const now = new Date("2026-10-26T18:00:00Z");
  assert.equal(certificateIssuedSince(3, now).toISOString(), "2023-10-27T00:00:00.000Z");
});

test("a push stores the Certificate Date; a later push without one keeps it", { skip }, async () => {
  assert.equal((await push([card("PEA001", { certificatePath: CERT, certificateDate: "2024-03-12" })])).created, 1);
  await push([card("PEA001", { certificatePath: CERT, budgetNote: "รอบสอง" })]);
  const stored = await prisma.projectCard.findUniqueOrThrow({ where: { projectCode: "PEA001" } });
  assert.equal(stored.certificateDate?.toISOString(), "2024-03-12T00:00:00.000Z");
});

test("a push is refused a Certificate Date that isn't a date, or comes without the certificate", { skip }, async () => {
  const result = await push([
    card("PEA001", { certificatePath: CERT, certificateDate: "12/03/2567" }),
    card("PEA002", { contractPath: CONTRACT, certificateDate: "2024-03-12" }),
  ]);
  assert.equal(result.rejected, 2);
  assert.equal(await prisma.projectCard.count(), 0);
});

test("a Certificate Date a person edited is never overwritten by a push; clearing it lets a push fill it again", { skip }, async () => {
  await signIn();
  await push([card("PEA001", { certificatePath: CERT, certificateDate: "2024-03-12" })]);
  const { id } = await prisma.projectCard.findUniqueOrThrow({ where: { projectCode: "PEA001" } });

  await updateProjectCardDetails(id, { descriptionTh: "", descriptionEn: "", budgetNote: "", certificateDate: "2024-04-01" });
  await push([card("PEA001", { certificatePath: CERT, certificateDate: "2020-01-01" })]);
  let stored = await prisma.projectCard.findUniqueOrThrow({ where: { id } });
  assert.equal(stored.certificateDate?.toISOString(), "2024-04-01T00:00:00.000Z");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "PROJECT_CARD_UPDATED" } });
  assert.match(audit.summary, /วันที่ลงรับรอง/);

  await updateProjectCardDetails(id, { descriptionTh: "", descriptionEn: "", budgetNote: "", certificateDate: null });
  await push([card("PEA001", { certificatePath: CERT, certificateDate: "2020-01-01" })]);
  stored = await prisma.projectCard.findUniqueOrThrow({ where: { id } });
  assert.equal(stored.certificateDate?.toISOString(), "2020-01-01T00:00:00.000Z");
});

test("the popup refuses a Certificate Date on a card with no Work Certificate", { skip }, async () => {
  await signIn();
  await push([card("PEA002", { contractPath: CONTRACT })]);
  const { id } = await prisma.projectCard.findUniqueOrThrow({ where: { projectCode: "PEA002" } });
  await assert.rejects(updateProjectCardDetails(id, { descriptionTh: "", descriptionEn: "", budgetNote: "", certificateDate: "2024-03-12" }));
});

test("the document filter keeps cards with every ticked document", { skip }, async () => {
  await signIn();
  await push([
    card("PEA001", { contractPath: CONTRACT }),
    card("PEA002", { certificatePath: CERT }),
    card("PEA003", { contractPath: CONTRACT, certificatePath: CERT }),
  ]);
  const shown = (html: string) => ["PEA001", "PEA002", "PEA003"].filter((code) => html.includes(`>${code}`));
  assert.deepEqual(shown(await pageHtml({ doc: "contract" })), ["PEA001", "PEA003"]);
  assert.deepEqual(shown(await pageHtml({ doc: "certificate" })), ["PEA002", "PEA003"]);
  assert.deepEqual(shown(await pageHtml({ doc: ["contract", "certificate"] })), ["PEA003"]);
});

test("the certificate-age filter keeps only cards certified within those years", { skip }, async () => {
  await signIn();
  const recent = new Date();
  recent.setUTCFullYear(recent.getUTCFullYear() - 1);
  await push([
    card("PEA001", { certificatePath: CERT, certificateDate: recent.toISOString().slice(0, 10) }),
    card("PEA002", { certificatePath: CERT, certificateDate: "2015-06-01" }),
    card("PEA003", { certificatePath: CERT }),
  ]);
  const html = await pageHtml({ certWithin: "3" });
  assert.ok(html.includes(">PEA001"));
  assert.ok(!html.includes(">PEA002"));
  assert.ok(!html.includes(">PEA003"));
});
