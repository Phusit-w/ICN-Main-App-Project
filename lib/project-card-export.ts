// ค้นหาโครงการ's ส่งออก Excel: the cards on screen (the URL's search and
// filters, in the sort the user picked) as one .xlsx — sheet โครงการ holds
// only the table, sheet เงื่อนไข says who exported, when, with which filters.
// Anyone with Project Card access may export (view-only too: they see every
// field on screen anyway); every export is written to the Activity log.
// Server-only.
import ExcelJS from "exceljs";
import { writeAudit } from "@/lib/authorization";
import { loadTaxonomy } from "@/lib/project-card-terms";
import { termLabel, type Taxonomy } from "@/lib/project-card-taxonomy";
import { findProjectCards, parseProjectCardSearch, searchParamsFrom } from "@/lib/project-card-search";
import { parseSort, sortCards, sortDescription } from "@/lib/project-card-sort";
import { parseCertificateDate } from "@/lib/project-card-certificate-date";
import type { ProjectCardRow } from "@/components/ProjectCardList";
import { FONT, bangkokDate, styleBody, styleHeader } from "@/lib/soc-results-excel";


const VAT_LABEL: Record<string, string> = {
  included: "รวม VAT",
  excluded: "ไม่รวม VAT",
  unspecified: "VAT ไม่ระบุ",
};

// Excel's Thai locale (41E) with the Buddhist-era year (bbbb): "12 มี.ค. 2567",
// as on screen, while the cell stays a real date that sorts and filters.
const THAI_DATE = "[$-41E]d mmm bbbb";

type Column = { header: string; width: number; value: (card: ProjectCardRow) => ExcelJS.CellValue; numFmt?: string };

function columns(taxonomy: Taxonomy): Column[] {
  const category = (value: string) => termLabel(taxonomy.categories, value);
  const workType = (value: string) => termLabel(taxonomy.workTypes, value);
  return [
    { header: "รหัสโครงการ", width: 12, value: (c) => c.projectCode },
    { header: "ลูกค้า", width: 14, value: (c) => c.client },
    { header: "ชื่อโครงการ", width: 50, value: (c) => c.projectName },
    { header: "ปี", width: 7, value: (c) => c.year },
    { header: "งบประมาณ (บาท)", width: 18, value: (c) => (c.budgetAmount === null ? null : Number(c.budgetAmount)), numFmt: "#,##0.00" },
    { header: "VAT", width: 12, value: (c) => (c.vatStatus ? VAT_LABEL[c.vatStatus] ?? c.vatStatus : null) },
    // Only a card with a figure has something to confirm.
    { header: "สถานะงบ", width: 13, value: (c) => (c.budgetAmount === null ? null : c.budgetVerified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน") },
    { header: "หมวดหลัก", width: 20, value: (c) => (c.category ? category(c.category) : null) },
    { header: "หมวดหมู่รอง", width: 24, value: (c) => c.tags.map(category).join(", ") || null },
    { header: "ลักษณะงาน", width: 20, value: (c) => c.workTypes.map(workType).join(", ") || null },
    { header: "รายละเอียด (ไทย)", width: 60, value: (c) => c.descriptionTh || null },
    { header: "รายละเอียด (อังกฤษ)", width: 60, value: (c) => c.descriptionEn || null },
    { header: "หมายเหตุ", width: 40, value: (c) => c.budgetNote || null },
    { header: "วันที่ลงหนังสือรับรอง", width: 16, value: (c) => (c.certificateDate ? parseCertificateDate(c.certificateDate) : null), numFmt: THAI_DATE },
    { header: "โฟลเดอร์โครงการ", width: 50, value: (c) => c.projectFolderPath },
    { header: "ไฟล์สัญญา", width: 50, value: (c) => c.contractPath },
    { header: "ไฟล์หนังสือรับรอง", width: 50, value: (c) => c.certificatePath },
  ];
}

// The export of the search named by `params` (the page's own query string
// plus `sort`), audited as `actor`.
export async function exportProjectCards(actor: { id: string; displayName: string }, params: URLSearchParams) {
  const taxonomy = await loadTaxonomy();
  const search = parseProjectCardSearch(searchParamsFrom(params), taxonomy);
  const sort = parseSort(params.get("sort"));
  // The same rows, sorted the same way, as the list on screen.
  const cards = sortCards(await findProjectCards(search), sort);

  const book = new ExcelJS.Workbook();
  book.creator = "ICN Apps";
  const cols = columns(taxonomy);
  const sheet = book.addWorksheet("โครงการ", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = cols.map((c) => ({ width: c.width }));
  styleHeader(sheet.addRow(cols.map((c) => c.header)));
  for (const card of cards) {
    const row = sheet.addRow(cols.map((c) => c.value(card)));
    styleBody(row);
    cols.forEach((c, i) => {
      if (c.numFmt) row.getCell(i + 1).numFmt = c.numFmt;
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  const now = new Date();
  const filters = [...(search.query ? [`คำค้นหา: ${search.query}`] : []), ...search.chips.map((chip) => chip.label)];
  const terms = book.addWorksheet("เงื่อนไข");
  terms.columns = [{ width: 18 }, { width: 60 }];
  const lines: [string, string][] = [
    ["ส่งออกโดย", actor.displayName],
    ["เวลา", new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(now)],
    ["จำนวน", `${cards.length.toLocaleString("th-TH")} โครงการ`],
    ["เรียงตาม", sortDescription(sort)],
    ...(filters.length ? filters.map((f, i): [string, string] => [i === 0 ? "ตัวกรอง" : "", f]) : [["ตัวกรอง", "ไม่มี (ทุกโครงการ)"] as [string, string]]),
  ];
  for (const [label, value] of lines) {
    const row = terms.addRow([label, value]);
    row.getCell(1).font = { ...FONT, bold: true };
    row.getCell(2).font = FONT;
  }

  const bytes = new Uint8Array(await book.xlsx.writeBuffer());
  await writeAudit({
    actorId: actor.id, action: "PROJECT_CARDS_EXPORTED", entityType: "PROJECT_CARD",
    summary: `ส่งออก Excel ค้นหาโครงการ ${cards.length} โครงการ${filters.length ? ` (${filters.join(", ")})` : " (ทั้งหมด)"}`,
    metadata: { count: cards.length, filters, sort: sortDescription(sort) },
  });
  return { bytes, fileName: `project-cards-${bangkokDate(now)}.xlsx` };
}
