// The results of an Imported SOC Check as an Excel workbook (2026-10-08; it
// replaces the combined SOC_Check Word file of ticket 10). Built from the same
// rows as the review page (heading rows left out), in SOC order. One major
// item → one sheet; the whole job → a summary sheet, then one sheet per
// checked major item. The layout follows the SOC skill's Excel spec
// (tor-word-compliance-check SKILL.md, "ส่งมอบแบบตารางผลแยกจาก SOC"), with
// the reviewer's Final Decision and note added. The review page can also
// download just the rows a reviewer picked or filtered, in its order, as one
// sheet. Server-only.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { socReviewView, type SocReviewRow } from "@/lib/soc-review-view";
import { isSettledDecision, PENDING_FIX, SOC_FINAL_DECISION_LABELS, SOC_ROW_STATUS_LABELS, socAxisValueLabel, type SocAxisKey } from "@/lib/soc-review";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SocResultsExcel = { ok: true; bytes: Uint8Array; fileName: string } | { ok: false; error: string };

const COLUMNS: { header: string; width: number }[] = [
  { header: "แถวใน SOC", width: 9 }, { header: "ข้อ", width: 11 }, { header: "ข้อกำหนด TOR", width: 50 },
  { header: "หน้าอ้างอิง", width: 28 }, { header: "ผลอ้างอิง", width: 24 }, { header: "เลขข้อกำกับ", width: 12 },
  { header: "Highlight", width: 12 }, { header: "หลักฐานรองรับ", width: 16 }, { header: "ผล TOR (แนะนำ)", width: 14 },
  { header: "ความเชื่อมั่น", width: 11 }, { header: "ประเด็นหลัก", width: 60 }, { header: "Final Decision", width: 16 },
  { header: "หมายเหตุผู้ตรวจ", width: 40 },
];
const CONFIDENCE_LABELS: Record<string, string> = { high: "สูง", medium: "กลาง", low: "ต่ำ" };
const RED = "FFC7CE";

// The ผลอ้างอิง cell with the skill's sub-status: a matching page whose
// evidence isn't complete is not shown as a plain green "ตรง". Same texts and
// colours as the skill's append_results_to_docx.py reference_status().
const REFERENCE_STATUSES = [
  { text: "ตรง", fill: "C6EFCE" },
  { text: "ตรง – ควรตรวจซ้ำ", fill: "FFEB9C" },
  { text: "ตรง – DS ไม่ครบ ควรตรวจซ้ำ", fill: "FFEB9C" },
  { text: "ตรง – ไม่ระบุใน DS", fill: "F4B183" },
  { text: "ตรง – ถ้อยคำขัดกับ DS", fill: "F4B183" },
  { text: "ตรง – ยืนยันไม่ได้ (ดูภาพ)", fill: "F4B183" },
  { text: "ไม่ตรง", fill: RED },
  { text: "ไม่พบ", fill: RED },
  { text: "ยืนยันไม่ได้", fill: "FFEB9C" },
  { text: "ไม่เกี่ยวข้อง", fill: "D9EAD3" },
] as const;
type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];
const status = (text: ReferenceStatus["text"]) => REFERENCE_STATUSES.find((s) => s.text === text)!;

const axis = (row: SocReviewRow, key: SocAxisKey) => row.axes.find((a) => a.key === key)?.value ?? null;

export function referenceStatus(row: SocReviewRow): ReferenceStatus {
  const reference = axis(row, "reference_check") || "not_applicable";
  if (reference === "match") {
    const support = axis(row, "evidence_support");
    if (support === "not_supported") return status("ตรง – ไม่ระบุใน DS");
    if (support === "wording_conflict") return status("ตรง – ถ้อยคำขัดกับ DS");
    if (support === "unverifiable") return status("ตรง – ยืนยันไม่ได้ (ดูภาพ)");
    if (support === "partially_supported") return status("ตรง – DS ไม่ครบ ควรตรวจซ้ำ");
    if (support === "fully_supported" && row.confidence !== "high") return status("ตรง – ควรตรวจซ้ำ");
    return status("ตรง");
  }
  if (reference === "mismatch") return status("ไม่ตรง");
  if (reference === "not_found") return status("ไม่พบ");
  if (reference === "unverifiable") return status("ยืนยันไม่ได้");
  return status("ไม่เกี่ยวข้อง");
}

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } });
const BORDER: Partial<ExcelJS.Borders> = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => { cell.fill = fill("D9E1F2"); cell.border = BORDER; cell.alignment = { vertical: "middle", wrapText: true }; });
}

// Excel sheet names: at most 31 characters, none of []:*?/\ and unique.
function sheetName(label: string, used: Set<string>): string {
  const base = `ข้อ ${label}`.replace(/[[\]:*?/\\]/g, "_").slice(0, 31);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 31 - `(${n})`.length)}(${n})`;
  used.add(name);
  return name;
}

// The sheet of picked rows leads with each row's major item and status.
const PICKED_COLUMNS: { header: string; width: number }[] = [{ header: "ข้อใหญ่", width: 9 }, { header: "สถานะ", width: 10 }];

function addItemSheet(book: ExcelJS.Workbook, name: string, rows: SocReviewRow[], majorItemLabels?: Map<string, string>) {
  const lead = majorItemLabels ? PICKED_COLUMNS : [];
  const sheet = book.addWorksheet(name, { views: [{ state: "frozen", xSplit: lead.length + 2, ySplit: 1 }] });
  sheet.columns = [...lead, ...COLUMNS].map((c) => ({ header: c.header, width: c.width }));
  styleHeader(sheet.getRow(1));
  for (const row of rows) {
    const reference = referenceStatus(row);
    const leading = majorItemLabels ? [majorItemLabels.get(row.majorItemId ?? "") ?? "", SOC_ROW_STATUS_LABELS[row.status]] : [];
    const added = sheet.addRow([
      ...leading,
      row.rowNumber, row.item, row.torText, row.reference, reference.text,
      socAxisValueLabel(axis(row, "item_label_check")), socAxisValueLabel(axis(row, "highlight_check")),
      socAxisValueLabel(axis(row, "evidence_support")), socAxisValueLabel(row.systemRecommendation),
      CONFIDENCE_LABELS[row.confidence] ?? row.confidence ?? "", row.keyIssue ?? "",
      row.finalDecision ? SOC_FINAL_DECISION_LABELS[row.finalDecision] : "ยังไม่ตัดสิน", row.finalNote ?? "",
    ]);
    added.eachCell({ includeEmpty: true }, (cell) => { cell.border = BORDER; cell.alignment = { vertical: "top", wrapText: true }; });
    added.getCell(lead.length + 5).fill = fill(reference.fill);
    if (reference.fill === RED) added.getCell(lead.length + 4).fill = fill(RED);
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lead.length + COLUMNS.length } };
}

type ItemRows = { label: string; title: string | null; rows: SocReviewRow[] };

function addSummarySheet(book: ExcelJS.Workbook, jobTitle: string, checked: ItemRows[], unchecked: { label: string; title: string | null }[]) {
  const sheet = book.addWorksheet("สรุป");
  const headers = ["ข้อใหญ่", "หัวข้อ", "จำนวนแถว", ...REFERENCE_STATUSES.map((s) => s.text), "ตัดสินแล้ว (Final Decision)", SOC_FINAL_DECISION_LABELS[PENDING_FIX]];
  sheet.columns = headers.map((header, i) => ({ header, width: i === 1 ? 40 : i < 3 ? 11 : 14 }));
  styleHeader(sheet.getRow(1));
  REFERENCE_STATUSES.forEach((s, i) => { sheet.getRow(1).getCell(4 + i).fill = fill(s.fill); });
  for (const item of checked) {
    const counts = REFERENCE_STATUSES.map((s) => item.rows.filter((r) => referenceStatus(r).text === s.text).length);
    const row = sheet.addRow([`ข้อ ${item.label}`, item.title ?? "", item.rows.length, ...counts, item.rows.filter((r) => isSettledDecision(r.finalDecision)).length, item.rows.filter((r) => r.finalDecision === PENDING_FIX).length]);
    row.eachCell({ includeEmpty: true }, (cell) => { cell.border = BORDER; });
  }
  const first = 2;
  const last = sheet.rowCount;
  const total = sheet.addRow(["รวม", "", ...headers.slice(2).map((_, i) => {
    const col = sheet.getColumn(3 + i).letter;
    const result = checked.reduce((sum, _item, n) => sum + Number(sheet.getRow(first + n).getCell(3 + i).value), 0);
    return { formula: `SUM(${col}${first}:${col}${last})`, result };
  })]);
  total.font = { bold: true };
  total.eachCell({ includeEmpty: true }, (cell) => { cell.border = BORDER; });

  sheet.addRow([]);
  const notes = [
    `งาน: ${jobTitle}`,
    "นับตามสถานะย่อยของช่อง \"ผลอ้างอิง\" (ตามกติกา skill) ไม่รวมแถวหัวข้อ",
    "ผล TOR ในชีตรายข้อเป็นคำแนะนำของระบบ ผลที่ใช้คือคอลัมน์ Final Decision ของผู้ตรวจ",
    unchecked.length ? `ยังไม่ได้ตรวจ ${unchecked.length} ข้อใหญ่: ${unchecked.map((u) => `ข้อ ${u.label}${u.title ? ` ${u.title}` : ""}`).join(", ")}` : "ตรวจครบทุกข้อใหญ่แล้ว",
  ];
  for (const note of notes) sheet.addRow([note]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export const MAX_PICKED_ROWS = 5000;

// The rows the reviewer picked on the review page (by result id, in the
// page's order) as one sheet, with the download audited. Ids of another job
// or of rows replaced since are skipped.
export async function downloadPickedSocResultsExcel(actor: { id: string }, jobId: string, resultIds: string[]): Promise<SocResultsExcel> {
  const job = await prisma.socJob.findUnique({ where: { id: jobId }, include: { majorItems: { select: { id: true, label: true } } } });
  if (!job || job.deletedAt) throw new Error("NOT_FOUND");
  if (job.kind !== "IMPORTED") return { ok: false, error: "ดาวน์โหลดผลตรวจ Excel ได้เฉพาะงานตรวจแบบนำเข้าผล" };
  if (resultIds.length > MAX_PICKED_ROWS) return { ok: false, error: `เลือกได้ไม่เกิน ${MAX_PICKED_ROWS.toLocaleString("en-US")} แถว` };
  const { rows } = await socReviewView(jobId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const picked = [...new Set(resultIds)].map((id) => byId.get(id)).filter((r): r is SocReviewRow => r !== undefined);
  if (!picked.length) return { ok: false, error: "ไม่มีแถวที่เลือก หรือแถวที่เลือกถูกตรวจซ้ำไปแล้ว กรุณาโหลดหน้าใหม่" };

  const book = new ExcelJS.Workbook();
  book.creator = "ICN Apps";
  addItemSheet(book, "รายการที่เลือก", picked, new Map(job.majorItems.map((m) => [m.id, m.label])));
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());

  const detail = { picked: true, rowCount: picked.length, items: picked.map((r) => r.item) };
  await prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "SOC_RESULTS_DOWNLOADED", detail } });
  await writeAudit({
    actorId: actor.id, action: "SOC_RESULTS_DOWNLOADED", entityType: "SOC_JOB", entityId: jobId,
    summary: `ดาวน์โหลดผลตรวจ Excel ${picked.length} แถวที่เลือกของงาน ${job.title}`, metadata: { picked: true, rowCount: picked.length },
  });
  return { ok: true, bytes, fileName: `${fileBase(job.title)}-เลือก ${picked.length} แถว.xlsx` };
}

const safeName = (text: string) => text.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 80);
const fileBase = (title: string) => `SOC_Check-${bangkokDate(new Date())}-${safeName(title) || "SOC"}`;

const bangkokDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);

// The workbook for the job (majorItemId null) or for one of its major items,
// with the download audited. The caller has already authorised the actor for
// the job. Throws NOT_FOUND for a missing job or a major item of another job.
export async function downloadSocResultsExcel(actor: { id: string }, jobId: string, majorItemId: string | null): Promise<SocResultsExcel> {
  const job = await prisma.socJob.findUnique({ where: { id: jobId }, include: { majorItems: { orderBy: { position: "asc" } } } });
  if (!job || job.deletedAt) throw new Error("NOT_FOUND");
  if (job.kind !== "IMPORTED") return { ok: false, error: "ดาวน์โหลดผลตรวจ Excel ได้เฉพาะงานตรวจแบบนำเข้าผล" };
  const only = majorItemId ? job.majorItems.find((m) => m.id === majorItemId) : null;
  if (majorItemId && !only) throw new Error("NOT_FOUND");

  const { rows } = await socReviewView(jobId);
  const items = (only ? [only] : job.majorItems).map((m) => ({
    label: m.label, title: m.title,
    rows: rows.filter((r) => r.majorItemId === m.id).sort((a, b) => a.rowNumber - b.rowNumber),
  }));
  const checked = items.filter((i) => i.rows.length);
  const unchecked = items.filter((i) => !i.rows.length);
  if (!checked.length) return { ok: false, error: only ? `ข้อ ${only.label} ยังไม่มีผลตรวจ` : "ยังไม่มีข้อใหญ่ที่ตรวจแล้ว ตรวจอย่างน้อยหนึ่งข้อใหญ่ก่อนดาวน์โหลด" };

  const book = new ExcelJS.Workbook();
  book.creator = "ICN Apps";
  if (!only) addSummarySheet(book, job.title, checked, unchecked);
  const used = new Set<string>(["สรุป"]);
  for (const item of checked) addItemSheet(book, sheetName(item.label, used), item.rows);
  const bytes = new Uint8Array(await book.xlsx.writeBuffer());

  const rowCount = checked.reduce((sum, i) => sum + i.rows.length, 0);
  const detail = { majorItem: only?.label ?? null, checked: checked.map((c) => c.label), unchecked: unchecked.map((u) => u.label), rowCount };
  await prisma.socAuditEvent.create({ data: { jobId, actorId: actor.id, action: "SOC_RESULTS_DOWNLOADED", detail } });
  await writeAudit({
    actorId: actor.id, action: "SOC_RESULTS_DOWNLOADED", entityType: "SOC_JOB", entityId: jobId,
    summary: only
      ? `ดาวน์โหลดผลตรวจ Excel ข้อ ${only.label} ของงาน ${job.title}`
      : `ดาวน์โหลดผลตรวจ Excel (ตรวจแล้ว ${checked.length}/${job.majorItems.length} ข้อใหญ่) ของงาน ${job.title}`,
    metadata: detail,
  });
  const name = [fileBase(job.title), only ? `ข้อ ${safeName(only.label)}` : null].filter(Boolean).join("-");
  return { ok: true, bytes, fileName: `${name}.xlsx` };
}
