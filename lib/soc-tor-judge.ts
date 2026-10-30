// The Claude step of TOR Match (spec "Claude step", decisions 13 and 23): the
// lines code could not settle (TOR_JUDGE_SENT) go to Claude on the reviewer's
// SOC Runner as one Check Request of kind "tor_judge", on the same queue as
// the per-major-item checks (lib/soc-check-requests.ts: claim, heartbeat,
// cancel and failure handling are theirs). A line on a scanned TOR or a TOR
// picture page comes with `image`: the runner renders that page and Claude
// must Read it. Claude returns per line one of TOR_JUDGE_OUTCOMES and a short
// reason; the import stores them beside the code outcome, which stays.
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { sendsToPool } from "@/lib/soc-runner";
import type { LocalCheckRunImport } from "@/lib/soc-import";
import { SOC_CHECK_REQUEST_OPEN_STATES } from "@/lib/soc-shared";
import type { TorMatchOutcome, TorPage } from "@/lib/soc-tor-match";

type Actor = { id: string };
type Job = { id: string; title: string; kind: string };

export const TOR_JUDGE_REQUEST = "tor_judge";
// The code outcomes sent to Claude, and the outcomes Claude may give back.
export const TOR_JUDGE_SENT = ["ความหมายต่าง", "ยืนยันไม่ได้"] as const satisfies readonly TorMatchOutcome[];
export const TOR_JUDGE_OUTCOMES = ["ตรง", "ต่างแค่รูปแบบ", "ความหมายต่าง", "ยืนยันไม่ได้"] as const satisfies readonly TorMatchOutcome[];
export type TorJudgeOutcome = (typeof TOR_JUDGE_OUTCOMES)[number];
const MAX_REASON = 500;
const MAX_ERRORS = 20;

// ส่งให้ Claude ตัดสิน: one request for every line the code left as
// ความหมายต่าง or ยืนยันไม่ได้, pinned by id. One open request per TOR Match;
// sending again after it is done judges the same lines again.
export async function requestTorJudge(actor: Actor, job: Job, { toPool = false } = {}): Promise<{ ok: true; lines: number } | { ok: false; error: string }> {
  if (job.kind !== "IMPORTED") return { ok: false, error: "ใช้ได้เฉพาะงานตรวจแบบนำเข้าผล" };
  const match = await prisma.socTorMatch.findUnique({
    where: { jobId: job.id },
    include: { lines: { where: { outcome: { in: [...TOR_JUDGE_SENT] } }, orderBy: { position: "asc" }, select: { id: true } } },
  });
  if (!match || match.state !== "ready") return { ok: false, error: "ส่งให้ Claude ได้เมื่อเทียบ TOR ต้นฉบับเสร็จแล้ว" };
  if (!match.lines.length) return { ok: false, error: "ไม่มีแถวที่ต้องให้ Claude ตัดสิน" };
  // ขอให้คนอื่นตรวจแทน, or no Runner of their own: it waits in รอคนรับ (ADR 0013).
  const waiting = await sendsToPool(actor.id, toPool);
  const created = await prisma.$transaction(async (tx) => {
    // Touching the TOR Match first locks it: of two clicks at once only one gets past.
    const { count } = await tx.socTorMatch.updateMany({ where: { id: match.id, updatedAt: match.updatedAt }, data: { updatedAt: new Date() } });
    if (!count || await tx.socCheckRequest.count({ where: { torMatchId: match.id, state: { in: [...SOC_CHECK_REQUEST_OPEN_STATES] } } })) return false;
    const request = await tx.socCheckRequest.create({
      data: { jobId: job.id, kind: TOR_JUDGE_REQUEST, torMatchId: match.id, torLineIds: match.lines.map((l) => l.id), requestedById: actor.id, waiting, priorState: "" },
    });
    await tx.socAuditEvent.create({ data: { jobId: job.id, actorId: actor.id, action: "TOR_JUDGE_REQUESTED", detail: { checkRequestId: request.id, lines: match.lines.length, waiting } } });
    await writeAudit({
      actorId: actor.id, action: "SOC_TOR_JUDGE_REQUESTED", entityType: "SOC_JOB", entityId: job.id,
      summary: `ส่ง ${match.lines.length} แถวของผลเทียบ TOR ต้นฉบับให้ Claude ตัดสินด้วย SOC Runner ในงาน ${job.title}`, metadata: { checkRequestId: request.id },
    }, tx);
    return true;
  });
  return created ? { ok: true, lines: match.lines.length } : { ok: false, error: "มีคำขอให้ Claude ตัดสินผลเทียบ TOR ต้นฉบับอยู่แล้ว กรุณาโหลดหน้าใหม่" };
}

// What the runner gets for a claimed tor_judge request: the TOR ต้นฉบับ and
// the pinned lines, each with `line` (its position, the key Claude answers
// with) and `image` (the runner renders TOR page `torPage` and Claude Reads it:
// a scanned TOR, or a picture page of a text TOR). null when the TOR was
// replaced since the request.
export async function torJudgeRunnerInput(torMatchId: string | null, lineIds: string[]) {
  const match = torMatchId ? await prisma.socTorMatch.findUnique({ where: { id: torMatchId }, include: { document: true } }) : null;
  if (!match) return null;
  const pages = (Array.isArray(match.pages) ? match.pages : []) as TorPage[];
  const lines = await prisma.socTorMatchLine.findMany({ where: { matchId: match.id, id: { in: lineIds } }, orderBy: { position: "asc" } });
  return {
    document: match.document,
    scanned: match.scanned,
    lines: lines.map((l) => ({
      line: l.position, outcome: l.outcome, item: l.item, socRow: l.socRow, socText: l.socText, torText: l.torText, torPage: l.torPage,
      image: l.torPage !== null && (match.scanned || pages[l.torPage - 1]?.picture === true),
    })),
  };
}

// Claude's answer (`{ "lines": [{ "line", "outcome", "reason" }] }`) for the
// lines asked (`asked`: their positions), or why it isn't one. Every asked
// line exactly once, no other line, an outcome from TOR_JUDGE_OUTCOMES and a
// reason.
export function parseTorJudgeResults(results: unknown, asked: number[]):
  | { ok: true; lines: { line: number; outcome: TorJudgeOutcome; reason: string }[] }
  | { ok: false; errors: string[] } {
  const entries = results && typeof results === "object" && !Array.isArray(results) ? (results as Record<string, unknown>).lines : undefined;
  if (!Array.isArray(entries)) return { ok: false, errors: ["ผลต้องเป็น JSON ที่มี lines เป็นรายการ"] };
  const errors: string[] = [];
  const wanted = new Set(asked);
  const seen = new Set<number>();
  const lines: { line: number; outcome: TorJudgeOutcome; reason: string }[] = [];
  entries.forEach((entry, i) => {
    const e = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const at = `รายการที่ ${i + 1}`;
    if (typeof e.line !== "number" || !Number.isInteger(e.line)) return void errors.push(`${at}: line ต้องเป็นเลขบรรทัด`);
    if (!wanted.has(e.line)) return void errors.push(`${at}: บรรทัด ${e.line} ไม่ได้อยู่ในคำขอ`);
    if (seen.has(e.line)) return void errors.push(`${at}: บรรทัด ${e.line} ซ้ำ`);
    seen.add(e.line);
    if (!(TOR_JUDGE_OUTCOMES as readonly unknown[]).includes(e.outcome)) return void errors.push(`${at}: outcome "${String(e.outcome)}" ต้องเป็น ${TOR_JUDGE_OUTCOMES.join(" / ")}`);
    const reason = typeof e.reason === "string" ? e.reason.trim() : "";
    if (!reason) return void errors.push(`${at}: ต้องมี reason`);
    lines.push({ line: e.line, outcome: e.outcome as TorJudgeOutcome, reason: reason.slice(0, MAX_REASON) });
  });
  const missing = asked.filter((line) => !seen.has(line));
  if (missing.length) errors.push(`ไม่มีผลของบรรทัด ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ` และอีก ${missing.length - 20} บรรทัด` : ""}`);
  return errors.length ? { ok: false, errors: errors.slice(0, MAX_ERRORS) } : { ok: true, lines };
}

const STALE = "STALE";

// Stores a running tor_judge request's results beside each line's code
// outcome and closes the request as done. Rejected (nothing stored) when the
// answer doesn't parse, or when the TOR was replaced since the request.
export async function importTorJudge(
  request: { id: string; jobId: string; torMatchId: string | null; torLineIds: string[]; requestedById: string },
  results: unknown,
  run: { skillVersion: string; model: string },
): Promise<LocalCheckRunImport> {
  const input = await torJudgeRunnerInput(request.torMatchId, request.torLineIds);
  if (!input || input.lines.length !== request.torLineIds.length) return { ok: false, errors: ["TOR ต้นฉบับถูกแทนที่หลังส่งคำขอ ผลนี้ใช้ไม่ได้แล้ว"] };
  const parsed = parseTorJudgeResults(results, input.lines.map((l) => l.line));
  if (!parsed.ok) return parsed;
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const closed = await tx.socCheckRequest.updateMany({ where: { id: request.id, state: "running" }, data: { state: "done", finishedAt: now, progressNote: null } });
      if (closed.count !== 1) throw new Error(STALE);
      for (const line of parsed.lines) {
        const { count } = await tx.socTorMatchLine.updateMany({ where: { matchId: request.torMatchId!, position: line.line }, data: { claudeOutcome: line.outcome, claudeReason: line.reason } });
        if (count !== 1) throw new Error(STALE);
      }
      const changed = parsed.lines.filter((line) => line.outcome !== input.lines.find((l) => l.line === line.line)?.outcome).length;
      await tx.socAuditEvent.create({ data: { jobId: request.jobId, actorId: request.requestedById, action: "TOR_JUDGE_IMPORTED", detail: { checkRequestId: request.id, lines: parsed.lines.length, changed, ...run } } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === STALE) return { ok: false, errors: ["คำขอนี้ถูกยกเลิกหรือ TOR ต้นฉบับถูกแทนที่ระหว่างส่งผล"] };
    throw error;
  }
  return { ok: true, runId: request.id, rowCount: parsed.lines.length };
}
