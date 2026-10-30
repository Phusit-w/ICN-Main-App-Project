// The AI step of กรอกอ้างอิง (proposal-build 10): the rows the code step left
// ไม่พบ in one major item go to Claude on the user's own SOC Runner (or, through
// รอคนรับ, a teammate's) as one Check Request of kind "reference_fill", on the
// same queue as the checks (lib/soc-check-requests.ts: claim, heartbeat, cancel
// and failure handling are theirs). Claude looks for the page in the Proposal's
// Datasheets and returns suggestions in the code step's shape; the import adds
// them to the run's row (source "ai"), where people รับ / แก้ / ไม่รับ them like
// any other. Claude never judges compliance here.
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { authorizeProposal } from "@/lib/proposal";
import { ensureVersionJob } from "@/lib/proposal-check";
import { sendsToPool } from "@/lib/soc-runner";
import { resolveStorageKey } from "@/lib/soc";
import type { LocalCheckRunImport } from "@/lib/soc-import";
import { SOC_CHECK_REQUEST_OPEN_STATES } from "@/lib/soc-shared";
import { readDatasheetPages, MAX_ALTERNATIVES, type RowSuggestions, type Suggestion } from "@/lib/reference-fill-search";
import type { Prisma } from "@/lib/generated/prisma/client";

export const REFERENCE_FILL_REQUEST = "reference_fill";
const MAX_SNIPPET = 160;
const MAX_ERRORS = 20;
const STALE = "STALE";

export const AI_FILL_NOT_CURRENT = "ผลค้นหาชุดนี้ไม่ใช่ของ SOC ฉบับล่าสุดแล้ว กรุณาค้นหาอ้างอิงใหม่";
export const AI_FILL_NO_ROWS = "ข้อนี้ไม่มีแถวที่ไม่พบและยังไม่ได้ตัดสิน";
export const AI_FILL_OPEN = "ข้อนี้มีคำขอให้ Claude หาอ้างอิงที่ยังไม่เสร็จอยู่แล้ว";
export const AI_FILL_NO_DATASHEETS = "Proposal นี้ยังไม่มี Datasheet กรุณาเพิ่ม Datasheet ก่อน";

type RunRow = { suggestions: unknown; versionId: string; proposalId: string };
const rowsOf = (run: { suggestions: unknown }) => run.suggestions as RowSuggestions[];

// ให้ Claude หาอ้างอิง: one request for the ไม่พบ rows of `majorItemKey` that
// nobody has decided, pinned by row position. One open request per item of a
// run. Returns how many rows it asks about.
export async function requestReferenceFillAi(
  proposalId: string, runId: string, majorItemKey: string, { toPool = false } = {},
): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  const { actor, proposal } = await authorizeProposal(proposalId);
  const run = await prisma.referenceFillRun.findFirst({ where: { id: runId, proposalId }, include: { decisions: { select: { position: true } } } });
  if (!run) return { ok: false, error: "ไม่พบผลกรอกอ้างอิงนี้" };
  const current = await prisma.socVersion.findFirst({ where: { proposalId, state: "ready", storageKey: { not: null } }, orderBy: { number: "desc" }, select: { id: true } });
  if (current?.id !== run.versionId) return { ok: false, error: AI_FILL_NOT_CURRENT };
  if (!(await prisma.proposalDatasheet.count({ where: { proposalId, removedAt: null } }))) return { ok: false, error: AI_FILL_NO_DATASHEETS };
  const decided = new Set(run.decisions.map((d) => d.position));
  const rows = rowsOf(run).filter((row) => row.majorItem === majorItemKey && !row.suggestions.length && !decided.has(row.position));
  if (!rows.length) return { ok: false, error: AI_FILL_NO_ROWS };
  const { jobId } = await ensureVersionJob(actor, proposal);
  const waiting = await sendsToPool(actor.id, toPool);
  const created = await prisma.$transaction(async (tx) => {
    // Two clicks at once: the second waits here, then sees the first's request.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${runId}:${majorItemKey}`}))`;
    if (await tx.socCheckRequest.count({ where: { referenceFillRunId: runId, majorItemKey, kind: REFERENCE_FILL_REQUEST, state: { in: [...SOC_CHECK_REQUEST_OPEN_STATES] } } })) return false;
    const request = await tx.socCheckRequest.create({
      data: { jobId, kind: REFERENCE_FILL_REQUEST, referenceFillRunId: runId, majorItemKey, rowNumbers: rows.map((r) => r.position), requestedById: actor.id, waiting, priorState: "" },
    });
    await tx.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "REFERENCE_FILL_AI_REQUESTED", detail: { checkRequestId: request.id, majorItemKey, rows: rows.length, waiting } } });
    await writeAudit({
      actorId: actor.id, action: "SOC_REFERENCE_FILL_AI_REQUESTED", entityType: "PROPOSAL", entityId: proposalId,
      summary: `ให้ Claude หาอ้างอิง ${rows.length} แถวของข้อ ${rows[0].majorItemLabel ?? majorItemKey} ใน Proposal ${proposal.title}${waiting ? " (ส่งไปรอคนรับ)" : ""}`,
      metadata: { checkRequestId: request.id, runId, majorItemKey, rows: rows.length, waiting },
    }, tx);
    return true;
  });
  return created ? { ok: true, rows: rows.length } : { ok: false, error: AI_FILL_OPEN };
}

// What the runner gets for a claimed reference_fill request: the pinned rows
// (`row` = the SOC row's position, the key Claude answers with) and the
// Datasheets it may cite (`documents`, each fetched like a check's evidence).
// null when the run is gone (a new search replaced nothing, but a trashed
// Proposal cascades).
export async function referenceFillRunnerInput(request: { id: string; jobId: string; referenceFillRunId: string | null; rowNumbers: number[] }) {
  const run = request.referenceFillRunId ? await prisma.referenceFillRun.findUnique({ where: { id: request.referenceFillRunId } }) : null;
  if (!run) return null;
  const asked = new Set(request.rowNumbers);
  const rows = rowsOf(run).filter((row) => asked.has(row.position))
    .map((row) => ({ row: row.position, item: row.item, tor: row.tor, reference: row.reference, kind: row.kind, majorItem: row.majorItemLabel ?? row.majorItem ?? null }));
  const datasheets = await prisma.proposalDatasheet.findMany({ where: { proposalId: run.proposalId, removedAt: null }, orderBy: { originalName: "asc" } });
  return { rows, datasheets };
}

type Parsed = { ok: true; rows: { row: number; suggestions: { datasheetId: string; page: number; snippet: string }[] }[] } | { ok: false; errors: string[] };

// Claude's answer (`{ "rows": [{ "row", "suggestions": [{ "document_id", "page", "snippet" }] }] }`):
// every asked row exactly once and no other, per row up to 1 + MAX_ALTERNATIVES
// suggestions (none = still ไม่พบ), each in a known Datasheet, on a page the
// file has, with a snippet. `pageCounts`: Datasheet id → its page count.
export function parseReferenceFillResults(results: unknown, asked: number[], pageCounts: Map<string, number>): Parsed {
  const errors: string[] = [];
  const list = results && typeof results === "object" ? (results as { rows?: unknown }).rows : null;
  if (!Array.isArray(list)) return { ok: false, errors: ["ผลต้องเป็น { rows: [...] }"] };
  const wanted = new Set(asked);
  const seen = new Set<number>();
  const rows: Extract<Parsed, { ok: true }>["rows"] = [];
  for (const entry of list) {
    const row = (entry as { row?: unknown } | null)?.row;
    if (typeof row !== "number" || !wanted.has(row)) { errors.push(`แถว ${String(row)} ไม่ได้อยู่ในคำขอ`); continue; }
    if (seen.has(row)) { errors.push(`แถว ${row} ซ้ำ`); continue; }
    seen.add(row);
    const raw = (entry as { suggestions?: unknown }).suggestions;
    if (!Array.isArray(raw) || raw.length > 1 + MAX_ALTERNATIVES) { errors.push(`แถว ${row}: suggestions ต้องเป็นรายการไม่เกิน ${1 + MAX_ALTERNATIVES} รายการ`); continue; }
    const suggestions: { datasheetId: string; page: number; snippet: string }[] = [];
    for (const item of raw) {
      const { document_id: id, page, snippet } = (item ?? {}) as { document_id?: unknown; page?: unknown; snippet?: unknown };
      const pages = typeof id === "string" ? pageCounts.get(id) : undefined;
      if (pages === undefined) { errors.push(`แถว ${row}: ไม่รู้จักเอกสาร ${String(id)}`); continue; }
      if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > pages) { errors.push(`แถว ${row}: หน้า ${String(page)} ไม่อยู่ในไฟล์ (มี ${pages} หน้า)`); continue; }
      if (typeof snippet !== "string" || !snippet.trim()) { errors.push(`แถว ${row}: ไม่มีข้อความที่พบ (snippet)`); continue; }
      if (suggestions.some((s) => s.datasheetId === id && s.page === page)) continue;
      suggestions.push({ datasheetId: id as string, page, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET) });
    }
    rows.push({ row, suggestions });
  }
  for (const position of asked) if (!seen.has(position)) errors.push(`แถว ${position} ไม่มีในผล`);
  return errors.length ? { ok: false, errors: errors.slice(0, MAX_ERRORS) } : { ok: true, rows };
}

// Adds a running reference_fill request's suggestions to the run's rows and
// closes the request as done. Rejected (nothing stored) when the answer
// doesn't pass parseReferenceFillResults. Rows Claude found nothing for stay ไม่พบ.
export async function importReferenceFill(
  request: { id: string; jobId: string; referenceFillRunId: string | null; rowNumbers: number[]; requestedById: string },
  results: unknown,
  run: { skillVersion: string; model: string },
): Promise<LocalCheckRunImport> {
  const input = await referenceFillRunnerInput(request);
  if (!input) return { ok: false, errors: ["ผลกรอกอ้างอิงที่ส่งคำขอไว้ถูกลบแล้ว ผลนี้ใช้ไม่ได้"] };
  const pageCounts = new Map<string, number>();
  for (const sheet of input.datasheets) {
    pageCounts.set(sheet.id, readDatasheetPages(new Uint8Array(await readFile(resolveStorageKey(sheet.storageKey)))).length);
  }
  const parsed = parseReferenceFillResults(results, input.rows.map((r) => r.row), pageCounts);
  if (!parsed.ok) return parsed;
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const closed = await tx.socCheckRequest.updateMany({ where: { id: request.id, state: "running" }, data: { state: "done", finishedAt: now, progressNote: null } });
      if (closed.count !== 1) throw new Error(STALE);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${request.referenceFillRunId!}))`;
      const stored: RunRow | null = await tx.referenceFillRun.findUnique({ where: { id: request.referenceFillRunId! } });
      if (!stored) throw new Error(STALE);
      const found = new Map(parsed.rows.filter((r) => r.suggestions.length).map((r) => [r.row, r.suggestions]));
      const next = rowsOf(stored).map((row) => {
        const suggestions = found.get(row.position);
        if (!suggestions || row.suggestions.length) return row;
        return { ...row, certain: false, suggestions: suggestions.map((s): Suggestion => ({ ...s, source: "ai" })) };
      });
      await tx.referenceFillRun.update({ where: { id: request.referenceFillRunId! }, data: { suggestions: next as unknown as Prisma.InputJsonValue } });
      await tx.socAuditEvent.create({ data: { jobId: request.jobId, actorId: request.requestedById, action: "REFERENCE_FILL_AI_IMPORTED", detail: { checkRequestId: request.id, rows: parsed.rows.length, found: found.size, ...run } } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === STALE) return { ok: false, errors: ["คำขอนี้ถูกยกเลิกหรือผลกรอกอ้างอิงถูกลบระหว่างส่งผล"] };
    throw error;
  }
  return { ok: true, runId: request.id, rowCount: parsed.rows.length };
}
