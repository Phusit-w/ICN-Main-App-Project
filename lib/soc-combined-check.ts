// The combined SOC_Check document of an Imported SOC Check (ADR 0008, ticket
// 10): one Word file for the whole job, built on demand from the latest rows
// of every checked major item. A re-check replaces an item's rows, so the
// stored rows are always the latest run's and superseded runs never appear.
//
// The rows are appended to the original SOC by the SOC skill's own
// append_results_to_docx.py (deterministic, not AI), run through
// soc-export/combine_soc_check.py, which also notes the major items not
// checked yet. The server needs Python with python-docx (SOC_PYTHON).
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { resolveStorageKey } from "@/lib/soc";

const run = promisify(execFile);
const BUILD_TIMEOUT_MS = 120_000;

export type CombinedSocCheck =
  | { ok: true; bytes: Uint8Array; fileName: string; checked: number; unchecked: number }
  | { ok: false; error: string };

function pythonCommand(): string {
  return process.env.SOC_PYTHON || (process.platform === "win32" ? "python" : "python3");
}

function exportDir(): string {
  return path.join(process.cwd(), "soc-export");
}

const bangkokDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);

// Builds the job's combined SOC_Check and audits the download. The caller
// has already authorised the actor for the job. Throws NOT_FOUND when the job
// doesn't exist; returns an error when there is nothing to download yet.
export async function downloadCombinedSocCheck(actor: { id: string }, jobId: string): Promise<CombinedSocCheck> {
  const job = await prisma.socJob.findUnique({
    where: { id: jobId },
    include: {
      documents: { where: { type: "SOC" }, orderBy: { createdAt: "asc" }, take: 1 },
      majorItems: { orderBy: { position: "asc" } },
    },
  });
  if (!job || job.deletedAt) throw new Error("NOT_FOUND");
  if (job.kind !== "IMPORTED") return { ok: false, error: "ดาวน์โหลด SOC_Check รวมได้เฉพาะงานตรวจแบบนำเข้าผล" };
  const soc = job.documents[0];
  if (!soc) return { ok: false, error: "ไม่พบไฟล์ SOC ต้นฉบับของงานนี้" };

  const rows = await prisma.socCheckResult.findMany({
    where: { jobId, majorItemId: { not: null } },
    orderBy: { rowNumber: "asc" },
    select: { majorItemId: true, runId: true, rawResult: true },
  });
  if (!rows.length) return { ok: false, error: "ยังไม่มีข้อใหญ่ที่ตรวจแล้ว นำเข้าผลตรวจอย่างน้อยหนึ่งข้อใหญ่ก่อนดาวน์โหลด" };

  const runIds = [...new Set(rows.map((r) => r.runId).filter((id): id is string => id !== null))];
  const runs = new Map((await prisma.socCheckRun.findMany({ where: { id: { in: runIds } } })).map((r) => [r.id, r]));
  const rowsByItem = new Map<string, typeof rows>();
  for (const row of rows) rowsByItem.set(row.majorItemId!, [...(rowsByItem.get(row.majorItemId!) ?? []), row]);

  const checked = job.majorItems.filter((m) => rowsByItem.has(m.id)).map((m) => {
    const itemRows = rowsByItem.get(m.id)!;
    const itemRun = itemRows[0].runId ? runs.get(itemRows[0].runId) : undefined;
    return {
      label: m.label, title: m.title, rowCount: itemRows.length,
      checkedAt: itemRun ? bangkokDate(itemRun.createdAt) : null,
      model: itemRun?.model ?? m.model, skillVersion: itemRun?.skillVersion ?? m.skillVersion,
    };
  });
  const unchecked = job.majorItems.filter((m) => !rowsByItem.has(m.id)).map((m) => ({ label: m.label, title: m.title }));
  const dates = [...new Set(checked.map((c) => c.checkedAt).filter(Boolean))].sort();
  const results = {
    // What every imported run was validated against (lib/soc-import.ts).
    mode: "full_audit",
    options: ["evidence_support", "tor_decision"],
    title: `ผลการตรวจสอบ TOR/SOC เทียบหลักฐาน: ${job.title}`,
    audit_date: dates.length > 1 ? `${dates[0]} ถึง ${dates[dates.length - 1]}` : (dates[0] ?? "-"),
    results: rows.map((r) => r.rawResult),
  };

  const workDir = await mkdtemp(path.join(os.tmpdir(), "soc-check-"));
  let bytes: Uint8Array;
  try {
    const resultsPath = path.join(workDir, "results.json");
    const manifestPath = path.join(workDir, "manifest.json");
    const outputPath = path.join(workDir, "SOC_Check.docx");
    await writeFile(resultsPath, JSON.stringify(results), "utf8");
    await writeFile(manifestPath, JSON.stringify({ checked, unchecked }), "utf8");
    const scripts = process.env.SOC_SKILL_SCRIPTS_DIR || path.join(exportDir(), "skill");
    try {
      await run(pythonCommand(), [path.join(exportDir(), "combine_soc_check.py"), scripts, resolveStorageKey(soc.storageKey), resultsPath, manifestPath, outputPath], {
        timeout: BUILD_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      });
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr;
      console.error("combine_soc_check.py failed", stderr || error);
      throw new Error("สร้างไฟล์ SOC_Check รวมไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ");
    }
    bytes = new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  const detail = { checked: checked.map((c) => c.label), unchecked: unchecked.map((u) => u.label), rowCount: rows.length, runIds };
  await prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "SOC_CHECK_DOWNLOADED", detail } });
  await writeAudit({
    actorId: actor.id, action: "SOC_CHECK_DOWNLOADED", entityType: "SOC_JOB", entityId: jobId,
    summary: `ดาวน์โหลด SOC_Check รวม (ตรวจแล้ว ${checked.length}/${job.majorItems.length} ข้อใหญ่) ของงาน ${job.title}`,
    metadata: detail,
  });
  const safeTitle = job.title.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 80) || "SOC";
  return { ok: true, bytes, fileName: `SOC_Check-${bangkokDate(new Date())}-${safeTitle}.docx`, checked: checked.length, unchecked: unchecked.length };
}
