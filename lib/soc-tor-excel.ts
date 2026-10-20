// The TOR Match of a job as an Excel workbook (tor-match ticket 05, decision
// 21): one sheet, the count per outcome on top, then every line except ตรง in
// stored order (SOC rows, then the TOR text no row covers). Same look as the
// results Excel (lib/soc-results-excel.ts). Server-only.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { bangkokDate, fill, FONT, safeName, styleBody, styleHeader, type SocExcelFile } from "@/lib/soc-results-excel";
import { TOR_MATCH_OUTCOMES, type TorMatchOutcome } from "@/lib/soc-tor-match";
import type { TorMatchCounts } from "@/lib/soc-tor";

// The outcome cell's colour, as the results Excel's ผลอ้างอิง.
const OUTCOME_FILLS: Record<TorMatchOutcome, string> = {
  "ตรง": "C6EFCE", "ต่างแค่รูปแบบ": "D9EAD3", "ความหมายต่าง": "FFC7CE", "ไม่พบใน SOC": "FFC7CE", "ไม่พบใน TOR": "FFC7CE", "ยืนยันไม่ได้": "FFEB9C",
};

type Line = { socRow: number | null; outcome: string; claudeOutcome: string | null; claudeReason: string | null; socText: string | null; torText: string | null; torPage: number | null };
const COLUMNS: { header: string; width: number; value: (line: Line) => string | number }[] = [
  { header: "แถวใน SOC", width: 10, value: (l) => l.socRow ?? "" },
  { header: "ผลเทียบ", width: 16, value: (l) => l.outcome },
  { header: "ผล Claude", width: 16, value: (l) => l.claudeOutcome ?? "" },
  { header: "เหตุผล Claude", width: 40, value: (l) => l.claudeReason ?? "" },
  { header: "ข้อความใน SOC", width: 60, value: (l) => l.socText ?? "" },
  { header: "ข้อความใน TOR ต้นฉบับ", width: 60, value: (l) => l.torText ?? "" },
  { header: "หน้า TOR", width: 9, value: (l) => l.torPage ?? "" },
];

// The job's TOR Match workbook, with the download audited. The caller has
// already authorised the actor for the job. Throws NOT_FOUND for a missing job.
export async function downloadTorMatchExcel(actor: { id: string }, jobId: string): Promise<SocExcelFile> {
  const job = await prisma.socJob.findUnique({ where: { id: jobId }, select: { title: true, deletedAt: true } });
  if (!job || job.deletedAt) throw new Error("NOT_FOUND");
  const match = await prisma.socTorMatch.findUnique({
    where: { jobId },
    include: { document: { select: { originalName: true } }, lines: { where: { outcome: { not: "ตรง" } }, orderBy: { position: "asc" } } },
  });
  if (!match) return { ok: false, error: "ยังไม่ได้แนบ TOR ต้นฉบับ" };
  if (match.state !== "ready" || !match.counts) return { ok: false, error: "ยังไม่มีผลเทียบ TOR ต้นฉบับ รอให้อ่าน TOR เสร็จก่อน" };
  const counts = match.counts as TorMatchCounts;
  const warnings = Array.isArray(match.warnings) ? match.warnings.filter((w): w is string => typeof w === "string") : [];

  const book = new ExcelJS.Workbook();
  book.creator = "ICN Apps";
  const sheet = book.addWorksheet("TOR Match");
  sheet.columns = COLUMNS.map((c) => ({ width: c.width }));

  for (const note of [`งาน: ${job.title}`, `TOR ต้นฉบับ: ${match.document.originalName}`]) sheet.addRow([note]).getCell(1).font = FONT;
  sheet.addRow([]);
  styleHeader(sheet.addRow(["ผลเทียบ", "จำนวน"]));
  for (const outcome of TOR_MATCH_OUTCOMES) {
    const row = sheet.addRow([outcome, counts[outcome] ?? 0]);
    styleBody(row);
    row.getCell(1).fill = fill(OUTCOME_FILLS[outcome]);
  }
  for (const warning of warnings) sheet.addRow([`คำเตือน: ${warning}`]).getCell(1).font = { ...FONT, color: { argb: "FFC00000" } };
  sheet.addRow(["TOR Match เป็นรายงานเท่านั้น ไม่เปลี่ยนผลตรวจ Datasheet · ไม่แสดงแถวที่ตรง"]).getCell(1).font = FONT;
  sheet.addRow([]);

  const head = sheet.addRow(COLUMNS.map((c) => c.header));
  styleHeader(head);
  // The line header stays in view while scrolling.
  sheet.views = [{ state: "frozen", ySplit: head.number }];
  for (const line of match.lines) {
    const row = sheet.addRow(COLUMNS.map((c) => c.value(line)));
    styleBody(row);
    row.getCell(2).fill = fill(OUTCOME_FILLS[line.outcome as TorMatchOutcome] ?? "FFFFFF");
    const judged = line.claudeOutcome as TorMatchOutcome | null;
    if (judged && OUTCOME_FILLS[judged]) row.getCell(3).fill = fill(OUTCOME_FILLS[judged]);
  }
  sheet.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: COLUMNS.length } };
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());

  const detail = { documentId: match.documentId, lineCount: match.lines.length };
  await prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "TOR_MATCH_DOWNLOADED", detail } });
  await writeAudit({ actorId: actor.id, action: "SOC_TOR_MATCH_DOWNLOADED", entityType: "SOC_JOB", entityId: jobId, summary: `ดาวน์โหลดผลเทียบ TOR ต้นฉบับ (Excel) ของงาน ${job.title}`, metadata: detail });
  return { ok: true, bytes, fileName: `TOR_Match-${bangkokDate(new Date())}-${safeName(job.title) || "SOC"}.xlsx` };
}
