// กรอกอ้างอิง of a Proposal (proposal-build 08): runs the code step
// (lib/reference-fill-search.ts) over the current SOC Version and the live
// Datasheets, keeps the run's suggestions, and keeps what people decide on each
// row so they can work in passes. Nothing is written to a SOC file here; the
// accepted rows are written into a new SOC Version by ticket 09.
import { readFile, rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { writeAudit } from "@/lib/authorization";
import { authorizeProposal } from "@/lib/proposal";
import { resolveStorageKey, storeSocFile } from "@/lib/soc";
import { createVersion } from "@/lib/proposal-soc";
import { readSocTable } from "@/lib/soc-table";
import { writeReferences, type ReferenceEdit } from "@/lib/soc-reference-write";
import {
  chapterWording, citedPages, guessReferenceStyle, pageAddition, readBackProblem, referenceBlocks, referenceText, REFERENCE_STYLES, REFERENCE_STYLE_LABELS,
  type CitedDocument, type DocSheet, type ReferenceStyle,
} from "@/lib/reference-fill-text";
import { referenceFillRequestViews } from "@/lib/soc-check-requests";
import { readDatasheetPages, suggestReferences, type RowSuggestions, type Suggestion } from "@/lib/reference-fill-search";

export const FILL_NO_SOC = "ยังไม่มี SOC ที่อ่านได้ใน Proposal นี้ กรุณาเพิ่ม SOC ก่อน";
export const FILL_NO_DATASHEETS = "Proposal นี้ยังไม่มี Datasheet กรุณาเพิ่ม Datasheet ก่อน";
export const FILL_BAD_PAGES = "เลขหน้าไม่ถูกต้อง ใส่เป็น 3 หรือ 3, 6 หรือ 12-13 (เลขหน้าของไฟล์ PDF)";
const NOT_FOUND = "ไม่พบผลกรอกอ้างอิงนี้";

export type FillDecisionInput =
  | { status: "accepted"; choice: number }
  | { status: "edited"; datasheetId: string; pages: string }
  | { status: "rejected" }
  | { status: "undecided" }; // takes a decision back

// "3", "3, 6", "12-13" → "3, 6" / "12-13": positive PDF pages, a range going up.
export function cleanPages(raw: unknown): string {
  const parts = String(raw ?? "").replace(/[–—]/g, "-").split(/[,\s]+/).filter(Boolean);
  const ok = parts.length > 0 && parts.every((part) => {
    const range = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    return range && Number(range[1]) >= 1 && (range[2] === undefined || Number(range[2]) > Number(range[1]));
  });
  if (!ok) throw new Error(FILL_BAD_PAGES);
  return parts.join(", ");
}

async function currentVersion(proposalId: string) {
  return prisma.socVersion.findFirst({ where: { proposalId, state: "ready", storageKey: { not: null } }, orderBy: { number: "desc" } });
}

// Runs the code search on the current SOC Version; a new run each time.
export async function startReferenceFill(proposalId: string) {
  const { actor, proposal } = await authorizeProposal(proposalId);
  const version = await currentVersion(proposalId);
  if (!version?.storageKey) throw new Error(FILL_NO_SOC);
  const sheets = await prisma.proposalDatasheet.findMany({ where: { proposalId, removedAt: null }, orderBy: { originalName: "asc" } });
  if (!sheets.length) throw new Error(FILL_NO_DATASHEETS);
  const table = readSocTable(new Uint8Array(await readFile(resolveStorageKey(version.storageKey))));
  const datasheets = [];
  for (const sheet of sheets) {
    const pages = readDatasheetPages(new Uint8Array(await readFile(resolveStorageKey(sheet.storageKey))));
    datasheets.push({ id: sheet.id, name: sheet.originalName, pages });
  }
  const suggestions = suggestReferences(table, datasheets);
  const run = await prisma.referenceFillRun.create({
    data: { proposalId, versionId: version.id, createdById: actor.id, suggestions: suggestions as unknown as Prisma.InputJsonValue, styleGuess: guessReferenceStyle(table.rows) },
  });
  const found = suggestions.filter((row) => row.suggestions.length).length;
  await writeAudit({
    actorId: actor.id, action: "PROPOSAL_REFERENCE_FILL_STARTED", entityType: "PROPOSAL", entityId: proposalId,
    summary: `กรอกอ้างอิง SOC ฉบับ ${version.number} ใน Proposal ${proposal.title}: พบ ${found} ไม่พบ ${suggestions.length - found}`,
    metadata: { runId: run.id, versionId: version.id, found, notFound: suggestions.length - found },
  });
  return { runId: run.id, found, notFound: suggestions.length - found };
}

export type FillRowView = Omit<RowSuggestions, "suggestions"> & {
  suggestions: (Suggestion & { documentName: string })[];
  decision: { status: "accepted" | "edited" | "rejected"; choice: number | null; datasheetId: string | null; pages: string | null } | null;
};
export type ReferenceFillView = {
  runId: string; versionNumber: number; createdAt: Date;
  rows: FillRowView[];
  found: number; notFound: number; undecided: number; certainUndecided: number;
  style: ReferenceStyle; // the Proposal's Reference Style, else the one guessed from the SOC
  toWrite: number; // rows accepted or edited, which "สร้างฉบับ SOC ใหม่" writes
  datasheets: { id: string; name: string }[]; // to pick from when a row is edited
  aiRequests: Awaited<ReturnType<typeof referenceFillRequestViews>>; // ให้ Claude หาอ้างอิง, latest per major item key
};

const documentLabel = (sheet: { citationName: string; originalName: string }) => sheet.originalName.split("/").pop()?.replace(/\.pdf$/i, "") ?? sheet.citationName;

// The newest run on the current SOC Version, or null (no run yet, or the
// SOC Version has moved on since: its rows are not the current SOC's).
export async function getReferenceFill(proposalId: string): Promise<ReferenceFillView | null> {
  await authorizeProposal(proposalId);
  return loadReferenceFill(proposalId);
}

async function loadReferenceFill(proposalId: string): Promise<ReferenceFillView | null> {
  const version = await currentVersion(proposalId);
  if (!version) return null;
  const run = await prisma.referenceFillRun.findFirst({ where: { versionId: version.id }, orderBy: { createdAt: "desc" }, include: { decisions: true } });
  if (!run) return null;
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId }, select: { referenceStyle: true } });
  const sheets = await prisma.proposalDatasheet.findMany({ where: { proposalId }, select: { id: true, originalName: true, citationName: true, removedAt: true } });
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]));
  const decisions = new Map(run.decisions.map((decision) => [decision.position, decision]));
  const rows = (run.suggestions as unknown as RowSuggestions[]).map((row): FillRowView => {
    const decision = decisions.get(row.position);
    return {
      ...row,
      suggestions: row.suggestions.map((suggestion) => ({ ...suggestion, documentName: documentLabel(byId.get(suggestion.datasheetId) ?? { citationName: "?", originalName: "?" }) })),
      decision: decision ? { status: decision.status as "accepted" | "edited" | "rejected", choice: decision.choice, datasheetId: decision.datasheetId, pages: decision.pages } : null,
    };
  });
  const found = rows.filter((row) => row.suggestions.length).length;
  const undecided = rows.filter((row) => row.suggestions.length && !row.decision).length;
  return {
    runId: run.id, versionNumber: version.number, createdAt: run.createdAt, rows, found, notFound: rows.length - found, undecided,
    style: (REFERENCE_STYLES as readonly string[]).includes(proposal?.referenceStyle ?? "") ? (proposal!.referenceStyle as ReferenceStyle) : (run.styleGuess as ReferenceStyle),
    toWrite: run.decisions.filter((decision) => decision.status !== "rejected").length,
    certainUndecided: rows.filter((row) => row.certain && row.suggestions[0]?.source === "label" && !row.decision).length,
    datasheets: sheets.filter((sheet) => !sheet.removedAt).map((sheet) => ({ id: sheet.id, name: documentLabel(sheet) })),
    aiRequests: await referenceFillRequestViews(run.id),
  };
}

// Rows with a suggestion that nobody has decided yet: while there are any the
// step is กำลังทำ. Zero for a Proposal with no run on the current SOC Version.
// For the Proposal page, which has authorized the viewer already.
export async function undecidedFillRows(proposalId: string): Promise<number> {
  return (await loadReferenceFill(proposalId))?.undecided ?? 0;
}

async function ownRun(proposalId: string, runId: string) {
  const run = await prisma.referenceFillRun.findUnique({ where: { id: runId } });
  if (!run || run.proposalId !== proposalId) throw new Error(NOT_FOUND);
  return run;
}

// รับ / แก้ / ไม่รับ one row, or take the decision back. Any SOC user may.
export async function decideReferenceFillRow(proposalId: string, runId: string, position: number, input: FillDecisionInput) {
  const { actor } = await authorizeProposal(proposalId);
  const run = await ownRun(proposalId, runId);
  const row = (run.suggestions as unknown as RowSuggestions[]).find((candidate) => candidate.position === position);
  if (!row) throw new Error(NOT_FOUND);
  if (input.status === "undecided") {
    await prisma.referenceFillDecision.deleteMany({ where: { runId, position } });
    return;
  }
  let data: { choice: number | null; datasheetId: string | null; pages: string | null } = { choice: null, datasheetId: null, pages: null };
  if (input.status === "accepted") {
    if (!Number.isInteger(input.choice) || !row.suggestions[input.choice]) throw new Error(NOT_FOUND);
    data = { choice: input.choice, datasheetId: null, pages: null };
  } else if (input.status === "edited") {
    const sheet = await prisma.proposalDatasheet.findUnique({ where: { id: input.datasheetId } });
    if (!sheet || sheet.proposalId !== proposalId || sheet.removedAt) throw new Error(NOT_FOUND);
    data = { choice: null, datasheetId: sheet.id, pages: cleanPages(input.pages) };
  }
  const values = { status: input.status, ...data, decidedById: actor.id, decidedAt: new Date() };
  await prisma.referenceFillDecision.upsert({ where: { runId_position: { runId, position } }, create: { runId, position, ...values }, update: values });
}

// "รับทั้งหมดที่พบจากเลขข้อกำกับ": every undecided row whose label is on exactly
// one page takes that page. Returns how many rows it accepted.
export async function acceptAllFromLabels(proposalId: string, runId: string): Promise<number> {
  const { actor } = await authorizeProposal(proposalId);
  const run = await ownRun(proposalId, runId);
  const decided = new Set((await prisma.referenceFillDecision.findMany({ where: { runId }, select: { position: true } })).map((decision) => decision.position));
  const rows = (run.suggestions as unknown as RowSuggestions[]).filter((row) => row.certain && row.suggestions[0]?.source === "label" && !decided.has(row.position));
  const { count } = await prisma.referenceFillDecision.createMany({
    data: rows.map((row) => ({ runId, position: row.position, status: "accepted", choice: 0, decidedById: actor.id })),
    skipDuplicates: true,
  });
  return count;
}

// ---------------------------------------------------------------- สร้างฉบับ SOC ใหม่ (proposal-build 09)

export const FILL_NOTHING_ACCEPTED = "ยังไม่มีแถวที่รับหรือแก้ไว้ กรุณารับอย่างน้อยหนึ่งแถวก่อนสร้างฉบับใหม่";
export const FILL_SOC_MOVED_ON = "Proposal นี้มี SOC ฉบับใหม่กว่าที่ค้นหาไว้แล้ว กรุณาค้นหาอ้างอิงใหม่";
export const FILL_BLOCKED = "สร้างฉบับใหม่ไม่ได้ เพราะอ้างอิงที่จะเขียนบางแถวอ่านกลับแล้วไม่ชี้ไปไฟล์และหน้าที่เลือก";

// Thrown when the read-back guard refuses: `problems` is one line per row.
export class ReferenceFillBlocked extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(FILL_BLOCKED);
    this.problems = problems;
  }
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

// Writes the accepted and edited rows of a run into a new SOC Version
// (source "reference_fill") in `style`; rows nobody accepted stay as they were.
// Every reference is read back first (lib/reference-fill-text.ts) and any that
// would not land on its file and page blocks the whole write. The written
// file is read again with the SOC table reader: same rows, same texts.
export async function createReferenceFillVersion(proposalId: string, runId: string, style: ReferenceStyle) {
  if (!REFERENCE_STYLES.includes(style)) throw new Error(NOT_FOUND);
  const { actor, proposal } = await authorizeProposal(proposalId);
  const run = await ownRun(proposalId, runId);
  const version = await currentVersion(proposalId);
  if (!version?.storageKey || version.id !== run.versionId) throw new Error(FILL_SOC_MOVED_ON);
  const decisions = await prisma.referenceFillDecision.findMany({ where: { runId, status: { in: ["accepted", "edited"] } }, orderBy: { position: "asc" } });
  if (!decisions.length) throw new Error(FILL_NOTHING_ACCEPTED);

  const suggestions = new Map((run.suggestions as unknown as RowSuggestions[]).map((row) => [row.position, row]));
  const sheets = await prisma.proposalDatasheet.findMany({ where: { proposalId, removedAt: null }, orderBy: { originalName: "asc" } });
  const all: DocSheet[] = sheets.map((sheet) => ({ id: sheet.id, path: sheet.originalName, citationName: sheet.citationName }));
  const original = new Uint8Array(await readFile(resolveStorageKey(version.storageKey)));
  const table = readSocTable(original);
  const wording = chapterWording(table.rows.map((row) => row.reference));

  const problems: string[] = [];
  const edits: (ReferenceEdit & { position: number; expected: string })[] = [];
  for (const decision of decisions) {
    const row = table.rows[decision.position - 1];
    const suggested = suggestions.get(decision.position);
    const name = row?.item || `แถว ${decision.position}`;
    if (!row || !suggested || row.item !== suggested.item) { problems.push(`${name}: แถวนี้ไม่ตรงกับ SOC ฉบับ ${version.number} แล้ว`); continue; }
    const chosen = decision.status === "accepted" ? suggested.suggestions[decision.choice ?? 0] : null;
    const sheet = all.find((candidate) => candidate.id === (chosen?.datasheetId ?? decision.datasheetId));
    const pages = chosen ? [chosen.page] : citedPages(`หน้า ${decision.pages ?? ""}`);
    if (!sheet || !pages.length) { problems.push(`${name}: ไม่พบ Datasheet ที่เลือก (อาจถูกลบไปแล้ว)`); continue; }
    if (!row.referenceAt) { problems.push(`${name}: SOC ไม่มีช่องอ้างอิงของแถวนี้`); continue; }
    const cited: CitedDocument = { sheet, pages };
    const titleOnly = !/^[\s\-–—_.]*$/.test(row.reference);
    if (titleOnly) {
      const addition = pageAddition(style, pages);
      const problem = readBackProblem(style === "thai" ? `${row.reference}\n${addition}` : `${row.reference}${addition}`, cited, all);
      if (problem) { problems.push(`${name}: ${problem}`); continue; }
      edits.push({ at: row.referenceAt, position: row.position, mode: style === "thai" ? "append-lines" : "append-inline", lines: [addition], existing: row.reference, expected: collapse(style === "thai" ? `${row.reference} ${addition}` : `${row.reference}${addition}`) });
      continue;
    }
    // A Thai block that does not name one file yet gets the file's name too.
    let blocks = referenceBlocks(style, [cited], all, wording);
    let problem = readBackProblem(referenceText(style, blocks), cited, all);
    if (problem && style === "thai") {
      blocks = referenceBlocks(style, [cited], all, wording, true);
      problem = readBackProblem(referenceText(style, blocks), cited, all);
    }
    if (problem) { problems.push(`${name}: ${problem}`); continue; }
    edits.push({ at: row.referenceAt, position: row.position, mode: "set", lines: blocks.flat(), existing: "", expected: collapse(blocks.flat().join(" ")) });
  }
  if (problems.length) throw new ReferenceFillBlocked(problems);

  const bytes = writeReferences(original, edits);
  const written = readSocTable(bytes);
  if (written.rows.length !== table.rows.length || edits.some((edit) => collapse(written.rows[edit.position - 1]?.reference ?? "") !== edit.expected)) {
    console.error("Reference Fill read-back mismatch", proposalId, runId);
    throw new Error("เขียนอ้างอิงลง SOC แล้วอ่านกลับไม่ตรงกับที่ตั้งใจ ไม่ได้สร้างฉบับใหม่ กรุณาแจ้งผู้ดูแลระบบ");
  }

  const extension = table.file.extension;
  const stem = (version.originalName ?? "SOC").replace(/\.[^./]*$/, "");
  const stored = await storeSocFile(`proposals/${proposalId}`, `${stem} (กรอกอ้างอิง)${extension}`, extension, bytes);
  try {
    const created = await createVersion(proposalId, {
      source: "reference_fill", state: "ready", createdById: actor.id, mimeType: table.file.mimeType, ...stored,
      warnings: (version.warnings as string[] | null) ?? undefined,
    });
    await prisma.proposal.update({ where: { id: proposalId }, data: { referenceStyle: style, updatedAt: new Date() } });
    await writeAudit({
      actorId: actor.id, action: "PROPOSAL_REFERENCE_FILL_WRITTEN", entityType: "PROPOSAL", entityId: proposalId,
      summary: `กรอกอ้างอิง: สร้าง SOC ฉบับ ${created.number} จากฉบับ ${version.number} ใน Proposal ${proposal.title} (${edits.length} แถว, ${REFERENCE_STYLE_LABELS[style]})`,
      metadata: { runId, from: version.number, to: created.number, written: edits.length, style },
    }).catch((error) => console.error("Audit of a Reference Fill version failed", error)); // the version exists: its file must stay
    return { versionNumber: created.number, written: edits.length };
  } catch (error) {
    await rm(resolveStorageKey(stored.storageKey), { force: true }).catch(() => undefined);
    throw error;
  }
}
