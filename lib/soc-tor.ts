// TOR Match on a job (docs/SOC-DOMAIN-GLOSSARY.md "TOR Match"): the TOR
// ต้นฉบับ attached to it, read, compared with the job's SOC by
// lib/soc-tor-match.ts, and the result stored. A report only: nothing here
// touches major items, check requests or check results.
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { resolveStorageKey, storeSocFile } from "@/lib/soc";
import { jobSocDocument } from "@/lib/soc-import";
import { readSocTable } from "@/lib/soc-table";
import { matchTor, TOR_MATCH_OUTCOMES, type TorMatch, type TorMatchOutcome, type TorPage } from "@/lib/soc-tor-match";
import { readTextTor } from "@/lib/soc-tor-read";

type SocActor = Awaited<ReturnType<typeof requireAccess>>;

export const TOR_DOCUMENT = "TOR_ORIGINAL";
// The SOC's rows change only while a scanned PDF SOC is read; the TOR waits for the full table.
const SOC_NOT_READ = "แนบ TOR ต้นฉบับได้หลังอ่านตาราง SOC ครบแล้ว";

export type TorMatchCounts = Record<TorMatchOutcome, number>;

// The stored lines of a compare: the SOC rows in SOC order, then the TOR
// text no row covers in TOR order.
function torMatchLines(result: TorMatch) {
  type Line = { socRow: number | null; item: string | null; outcome: TorMatchOutcome; socText: string | null; torText: string | null; torPage: number | null };
  const lines: Line[] = [
    ...result.rows.map((row) => ({ socRow: row.position, item: row.item, outcome: row.outcome, socText: row.socText, torText: row.torText, torPage: row.torPage })),
    ...result.missing.map((missing) => ({ socRow: null, item: null, outcome: "ไม่พบใน SOC" as const, socText: null, torText: missing.torText, torPage: missing.torPage })),
  ];
  return lines.map((line, position) => ({ ...line, position }));
}

function torMatchCounts(lines: { outcome: TorMatchOutcome }[]): TorMatchCounts {
  return Object.fromEntries(TOR_MATCH_OUTCOMES.map((outcome) => [outcome, lines.filter((line) => line.outcome === outcome).length])) as TorMatchCounts;
}

// Compares the job's SOC, as its file reads now, with the TOR's pages. The
// major items are the file's as read today: a job made before the list rule
// (TOR Match 01) may show other ones, which a report only can live with.
async function compareWithSoc(jobId: string, pages: TorPage[]): Promise<TorMatch> {
  const soc = await jobSocDocument(jobId);
  if (!soc) throw new Error(SOC_NOT_READ);
  return matchTor(readSocTable(new Uint8Array(await readFile(resolveStorageKey(soc.storageKey)))), pages);
}

// Attaches a TOR ต้นฉบับ (a PDF validateUpload() has already checked) to an
// Imported SOC Check the actor may open, and compares it with the SOC at once.
// A TOR already attached is replaced: its document, text and result go. A
// scanned TOR is refused (readTextTor), and nothing is stored.
export async function attachTorOriginal(actor: SocActor, job: { id: string; title: string; kind: string; status: string }, upload: { name: string; bytes: Uint8Array }) {
  if (job.kind !== "IMPORTED") throw new Error("แนบ TOR ต้นฉบับได้เฉพาะงานตรวจแบบนำเข้าผล");
  if (job.status === "READING" || job.status === "READ_FAILED") throw new Error(SOC_NOT_READ);
  const pages = readTextTor(upload.bytes);
  const result = await compareWithSoc(job.id, pages);
  const lines = torMatchLines(result);
  const old = await prisma.socDocument.findMany({ where: { jobId: job.id, type: TOR_DOCUMENT } });
  const stored = await storeSocFile(job.id, upload.name, ".pdf", upload.bytes);
  const documentId = randomUUID();
  const counts = torMatchCounts(lines);
  const detail = { documentId, name: stored.originalName, replaced: old.map((d) => d.originalName), counts };
  try {
    await prisma.$transaction([
      // Deleting the old document deletes its TOR Match and lines too.
      prisma.socDocument.deleteMany({ where: { jobId: job.id, type: TOR_DOCUMENT } }),
      prisma.socDocument.create({ data: { id: documentId, jobId: job.id, type: TOR_DOCUMENT, mimeType: "application/pdf", pageCount: pages.length, ...stored } }),
      prisma.socTorMatch.create({ data: { jobId: job.id, documentId, state: "ready", pages, counts, warnings: result.warnings, lines: { createMany: { data: lines } } } }),
      prisma.socJob.update({ where: { id: job.id }, data: { updatedAt: new Date() } }),
      prisma.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: old.length ? "TOR_REPLACED" : "TOR_ATTACHED", detail } }),
    ]);
  } catch (error) {
    await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    throw error;
  }
  for (const document of old) await rm(resolveStorageKey(document.storageKey), { force: true }).catch(() => undefined);
  await writeAudit({ actorId: actor.id, action: "SOC_TOR_ATTACHED", entityType: "SOC_JOB", entityId: job.id, summary: `แนบ TOR ต้นฉบับ ${stored.originalName} ในงาน ${job.title}`, metadata: detail });
  return { documentId, counts, warnings: result.warnings };
}

// What the job page shows of a job's TOR Match; null when no TOR is attached.
export async function torMatchView(jobId: string) {
  const match = await prisma.socTorMatch.findUnique({
    where: { jobId },
    include: {
      document: { select: { originalName: true } },
      lines: { orderBy: { position: "asc" }, select: { id: true, socRow: true, item: true, outcome: true, socText: true, torText: true, torPage: true, claudeOutcome: true, claudeReason: true } },
    },
  });
  if (!match) return null;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  return {
    documentId: match.documentId,
    name: match.document.originalName,
    state: match.state,
    counts: (match.counts ?? null) as TorMatchCounts | null,
    warnings: strings(match.warnings),
    errorMessage: match.errorMessage,
    // Every outcome line, ตรง included: the issue list hides those by default.
    lines: match.lines.map((line) => ({ ...line, outcome: line.outcome as TorMatchOutcome })),
  };
}
export type TorMatchView = NonNullable<Awaited<ReturnType<typeof torMatchView>>>;
