// The results of an Imported SOC Check as an Excel workbook (2026-10-08; it
// replaces the combined SOC_Check Word file of ticket 10). Built from the same
// rows as the review page (heading rows left out), in SOC order. One major
// item → one sheet; the whole job → a summary sheet, then one sheet per
// checked major item. The layout follows the SOC skill's Excel spec
// (tor-word-compliance-check references/deliverables.md), with
// the reviewer's Final Decision and note added. The review page can also
// download just the rows a reviewer picked or filtered, in its order, as one
// sheet. Server-only.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { socReviewView, type SocReviewRow } from "@/lib/soc-review-view";
import { majorItemName } from "@/lib/soc-shared";
import { isSettledDecision, PENDING_FIX, SOC_FINAL_DECISION_LABELS, SOC_ROW_STATUS_LABELS, socAxisValueLabel, type SocAxisKey } from "@/lib/soc-review";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SocExcelFile = { ok: true; bytes: Uint8Array; fileName: string } | { ok: false; error: string };

const CONFIDENCE_LABELS: Record<string, string> = { high: "สูง", medium: "กลาง", low: "ต่ำ" };
// The TOR cell of an Image Row: images aren't put in the workbook.
const IMAGE_ROW_TOR = "[รูป]";

// The ผลอ้างอิง cell with the skill's sub-status: a matching page whose
// evidence isn't complete is not shown as a plain green "ตรง". Same texts and
// colours as the skill's append_results_to_docx.py reference_status(). Each
// sub-status has its ระดับผลอ้างอิง (docs/SOC-DOMAIN-GLOSSARY.md), which the
// summary sheet counts by.
const REFERENCE_LEVELS = [
  { text: "ไม่มีประเด็น", fill: "C6EFCE" },
  { text: "ควรตรวจซ้ำ", fill: "FFEB9C" },
  { text: "มีปัญหา", fill: "FFC7CE" },
] as const;
const REFERENCE_STATUSES = [
  { text: "ตรง", fill: "C6EFCE", level: "ไม่มีประเด็น" },
  { text: "ตรง – ควรตรวจซ้ำ", fill: "FFEB9C", level: "ควรตรวจซ้ำ" },
  { text: "ตรง – DS ไม่ครบ ควรตรวจซ้ำ", fill: "FFEB9C", level: "ควรตรวจซ้ำ" },
  { text: "ตรง – ไม่ระบุใน DS", fill: "F4B183", level: "มีปัญหา" },
  { text: "ตรง – ถ้อยคำขัดกับ DS", fill: "F4B183", level: "มีปัญหา" },
  { text: "ตรง – ยืนยันไม่ได้ (ดูภาพ)", fill: "F4B183", level: "มีปัญหา" },
  { text: "ไม่ตรง", fill: "FFC7CE", level: "มีปัญหา" },
  { text: "ไม่พบ", fill: "FFC7CE", level: "มีปัญหา" },
  { text: "ยืนยันไม่ได้", fill: "FFEB9C", level: "ควรตรวจซ้ำ" },
  { text: "ไม่เกี่ยวข้อง", fill: "D9EAD3", level: "ไม่มีประเด็น" },
] as const satisfies readonly { text: string; fill: string; level: (typeof REFERENCE_LEVELS)[number]["text"] }[];
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

export const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } });
// Tahoma has Thai glyphs on every Windows and Mac.
export const FONT: Partial<ExcelJS.Font> = { name: "Tahoma", size: 10 };
const GREY_LINE: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFBFBFBF" } };
const BORDER: Partial<ExcelJS.Borders> = { top: GREY_LINE, left: GREY_LINE, bottom: GREY_LINE, right: GREY_LINE };

export function styleHeader(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...FONT, bold: true }; cell.fill = fill("E7E6E6"); cell.border = BORDER;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

export function styleBody(row: ExcelJS.Row, bold = false) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...FONT, bold }; cell.border = BORDER; cell.alignment = { vertical: "top", wrapText: true };
  });
}

// Excel sheet names: at most 31 characters, none of []:*?/\ and unique.
function sheetName(label: string, used: Set<string>): string {
  const base = majorItemName(label).replace(/[[\]:*?/\\]/g, "_").slice(0, 31);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 31 - `(${n})`.length)}(${n})`;
  used.add(name);
  return name;
}

type Column = { header: string; width: number; value: (row: SocReviewRow) => string | number };

// The columns the reviewer reads, in order; ผลอ้างอิง is the only coloured cell.
// หมายเหตุผู้เสนอ is the row's Bidder Remark, read from the SOC.
const VISIBLE_COLUMNS: Column[] = [
  { header: "ข้อ", width: 11, value: (r) => r.item },
  { header: "ข้อกำหนด TOR", width: 60, value: (r) => (r.torImage ? [IMAGE_ROW_TOR, r.image?.reading].filter(Boolean).join("\n") : r.torText) },
  { header: "หมายเหตุผู้เสนอ", width: 30, value: (r) => r.bidderRemark ?? "" },
  { header: "ผลอ้างอิง", width: 24, value: (r) => referenceStatus(r).text },
  { header: "ประเด็นหลัก", width: 70, value: (r) => r.keyIssue ?? "" },
  { header: "หน้าอ้างอิง", width: 28, value: (r) => r.reference },
  { header: "Final Decision", width: 16, value: (r) => (r.finalDecision ? SOC_FINAL_DECISION_LABELS[r.finalDecision] : "ยังไม่ตัดสิน") },
  { header: "หมายเหตุผู้ตรวจ", width: 40, value: (r) => r.finalNote ?? "" },
];
const REFERENCE_COLUMN = VISIBLE_COLUMNS.findIndex((c) => c.header === "ผลอ้างอิง");
// The details behind ผลอ้างอิง, in a collapsed column group (expand with +).
const GROUPED_COLUMNS: Column[] = [
  { header: "แถวใน SOC", width: 9, value: (r) => (r.sheet ? `${r.sheet} · ${r.rowNumber}` : r.rowNumber) },
  { header: "เลขข้อกำกับ", width: 12, value: (r) => socAxisValueLabel(axis(r, "item_label_check")) },
  { header: "Highlight", width: 12, value: (r) => socAxisValueLabel(axis(r, "highlight_check")) },
  { header: "หลักฐานรองรับ", width: 16, value: (r) => socAxisValueLabel(axis(r, "evidence_support")) },
  { header: "ผล TOR (แนะนำ)", width: 14, value: (r) => socAxisValueLabel(r.systemRecommendation) },
  { header: "ความเชื่อมั่น", width: 11, value: (r) => CONFIDENCE_LABELS[r.confidence] ?? r.confidence ?? "" },
];

// The sheet of picked rows leads with each row's major item and status.
const pickedColumns = (majorItemLabels: Map<string, string>): Column[] => [
  { header: "ข้อใหญ่", width: 9, value: (r) => majorItemLabels.get(r.majorItemId ?? "") ?? "" },
  { header: "สถานะ", width: 10, value: (r) => SOC_ROW_STATUS_LABELS[r.status] },
];

function addItemSheet(book: ExcelJS.Workbook, name: string, rows: SocReviewRow[], majorItemLabels?: Map<string, string>) {
  const lead = majorItemLabels ? pickedColumns(majorItemLabels) : [];
  const columns = [...lead, ...VISIBLE_COLUMNS, ...GROUPED_COLUMNS];
  // The header row, ข้อ and ข้อกำหนด TOR stay in view while scrolling.
  const sheet = book.addWorksheet(name, { views: [{ state: "frozen", xSplit: lead.length + 2, ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width }));
  GROUPED_COLUMNS.forEach((_, i) => {
    const column = sheet.getColumn(lead.length + VISIBLE_COLUMNS.length + 1 + i);
    column.outlineLevel = 1;
    column.hidden = true;
  });
  styleHeader(sheet.getRow(1));
  for (const row of rows) {
    const added = sheet.addRow(columns.map((c) => c.value(row)));
    styleBody(added);
    added.getCell(lead.length + REFERENCE_COLUMN + 1).fill = fill(referenceStatus(row).fill);
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

type ItemRows = { label: string; title: string | null; rows: SocReviewRow[] };

// A count table: a header (cells coloured by headerFills), one row per checked
// major item, and a total row of SUM formulas.
function addCountTable(sheet: ExcelJS.Worksheet, headers: string[], body: (string | number)[][], headerFills: (string | null)[]) {
  const head = sheet.addRow(headers);
  styleHeader(head);
  headerFills.forEach((argb, i) => { if (argb) head.getCell(i + 1).fill = fill(argb); });
  const first = sheet.rowCount + 1;
  for (const row of body) styleBody(sheet.addRow(row));
  const last = sheet.rowCount;
  const total = sheet.addRow(["รวม", "", ...headers.slice(2).map((_, i) => {
    const col = sheet.getColumn(3 + i).letter;
    return { formula: `SUM(${col}${first}:${col}${last})`, result: body.reduce((sum, row) => sum + Number(row[2 + i]), 0) };
  })]);
  styleBody(total, true);
}

// Counts by ระดับผลอ้างอิง and Final Decision, then by ผลอ้างอิง sub-status.
function addSummarySheet(book: ExcelJS.Workbook, jobTitle: string, checked: ItemRows[], unchecked: { label: string; title: string | null }[]) {
  const sheet = book.addWorksheet("สรุป", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = Array.from({ length: 3 + REFERENCE_STATUSES.length }, (_, i) => ({ width: i === 1 ? 44 : i < 3 ? 11 : 14 }));
  const count = (rows: SocReviewRow[], match: (s: ReferenceStatus) => boolean) => rows.filter((r) => match(referenceStatus(r))).length;
  const lead = (item: ItemRows) => [majorItemName(item.label), item.title ?? "", item.rows.length];

  addCountTable(sheet,
    ["ข้อใหญ่", "หัวข้อ", "จำนวนแถว", ...REFERENCE_LEVELS.map((l) => l.text), "ตัดสินแล้ว", SOC_FINAL_DECISION_LABELS[PENDING_FIX]],
    checked.map((item) => [
      ...lead(item), ...REFERENCE_LEVELS.map((l) => count(item.rows, (s) => s.level === l.text)),
      item.rows.filter((r) => isSettledDecision(r.finalDecision)).length, item.rows.filter((r) => r.finalDecision === PENDING_FIX).length,
    ]),
    [null, null, null, ...REFERENCE_LEVELS.map((l) => l.fill)]);

  sheet.addRow([]);
  sheet.addRow(["จำนวนแถวตามผลอ้างอิงย่อย"]).getCell(1).font = { ...FONT, bold: true };
  addCountTable(sheet,
    ["ข้อใหญ่", "หัวข้อ", "จำนวนแถว", ...REFERENCE_STATUSES.map((s) => s.text)],
    checked.map((item) => [...lead(item), ...REFERENCE_STATUSES.map((s) => count(item.rows, (status) => status.text === s.text))]),
    [null, null, null, ...REFERENCE_STATUSES.map((s) => s.fill)]);

  sheet.addRow([]);
  const notes = [
    `งาน: ${jobTitle}`,
    "ระดับผลอ้างอิง: ไม่มีประเด็น = ตรง, ไม่เกี่ยวข้อง · ควรตรวจซ้ำ = ตรง – ควรตรวจซ้ำ, ตรง – DS ไม่ครบ ควรตรวจซ้ำ, ยืนยันไม่ได้ · มีปัญหา = ไม่ตรง, ไม่พบ, ตรง – ไม่ระบุใน DS, ตรง – ถ้อยคำขัดกับ DS, ตรง – ยืนยันไม่ได้ (ดูภาพ) ไม่รวมแถวหัวข้อ",
    "ระดับผลอ้างอิงเป็นมุมมองของระบบต่อหลักฐาน ไม่ใช่ผลตัดสิน ผลที่ใช้คือคอลัมน์ Final Decision ของผู้ตรวจ",
    unchecked.length ? `ยังไม่ได้ตรวจ ${unchecked.length} ข้อใหญ่: ${unchecked.map((u) => `${majorItemName(u.label)}${u.title ? ` ${u.title}` : ""}`).join(", ")}` : "ตรวจครบทุกข้อใหญ่แล้ว",
  ];
  for (const note of notes) sheet.addRow([note]).getCell(1).font = FONT;
}

export const MAX_PICKED_ROWS = 5000;

// The rows the reviewer picked on the review page (by result id, in the
// page's order) as one sheet, with the download audited. Ids of another job
// or of rows replaced since are skipped.
export async function downloadPickedSocResultsExcel(actor: { id: string }, jobId: string, resultIds: string[]): Promise<SocExcelFile> {
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

export const safeName = (text: string) => text.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim().slice(0, 80);
const fileBase = (title: string) => `SOC_Check-${bangkokDate(new Date())}-${safeName(title) || "SOC"}`;

export const bangkokDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);

// The workbook for the job (majorItemId null) or for one of its major items,
// with the download audited. The caller has already authorised the actor for
// the job. Throws NOT_FOUND for a missing job or a major item of another job.
export async function downloadSocResultsExcel(actor: { id: string }, jobId: string, majorItemId: string | null): Promise<SocExcelFile> {
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
  if (!checked.length) return { ok: false, error: only ? `${majorItemName(only.label)} ยังไม่มีผลตรวจ` : "ยังไม่มีข้อใหญ่ที่ตรวจแล้ว ตรวจอย่างน้อยหนึ่งข้อใหญ่ก่อนดาวน์โหลด" };

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
      ? `ดาวน์โหลดผลตรวจ Excel ${majorItemName(only.label)} ของงาน ${job.title}`
      : `ดาวน์โหลดผลตรวจ Excel (ตรวจแล้ว ${checked.length}/${job.majorItems.length} ข้อใหญ่) ของงาน ${job.title}`,
    metadata: detail,
  });
  const name = [fileBase(job.title), only ? safeName(majorItemName(only.label)) : null].filter(Boolean).join("-");
  return { ok: true, bytes, fileName: `${name}.xlsx` };
}
