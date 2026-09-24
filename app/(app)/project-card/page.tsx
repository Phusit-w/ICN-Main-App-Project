import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireActor } from "@/lib/authorization";
import Field from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import { SearchIcon } from "@/components/icons";
import ProjectCardBudgetForm from "@/components/ProjectCardBudgetForm";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";

// No cap on the query, deliberately — matches this app's other main list
// (actions/records.ts's listRecords, also uncapped) rather than inventing
// this app's first pagination UI for a few hundred rows. Revisit only if
// the catalog grows enough for that to become a real cost.

// Flat access (docs/adr/0006-project-card-flat-access-control.md): any
// signed-in user, no extra role check — same as every other screen in this
// app.
// Parses a query-string number param, returning undefined for anything
// blank or non-numeric rather than throwing — a stray/garbled filter value
// should just be ignored, not 500 the page.
function parseIntParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseFloatParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function ProjectCardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; year?: string; budgetMin?: string; budgetMax?: string }>;
}) {
  await requireActor();
  const { q, year: yearParam, budgetMin: budgetMinParam, budgetMax: budgetMaxParam } = await searchParams;
  const query = q?.trim() ?? "";
  const year = parseIntParam(yearParam);
  const budgetMin = parseFloatParam(budgetMinParam);
  const budgetMax = parseFloatParam(budgetMaxParam);

  const filters: Prisma.ProjectCardWhereInput[] = [];
  if (query) {
    filters.push({
      OR: [
        { projectCode: { contains: query, mode: "insensitive" } },
        { client: { contains: query, mode: "insensitive" } },
        { projectName: { contains: query, mode: "insensitive" } },
        { descriptionTh: { contains: query, mode: "insensitive" } },
        { descriptionEn: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (year !== undefined) filters.push({ year });
  if (budgetMin !== undefined) filters.push({ budgetAmount: { gte: budgetMin } });
  if (budgetMax !== undefined) filters.push({ budgetAmount: { lte: budgetMax } });

  const [cards, availableYears] = await Promise.all([
    prisma.projectCard.findMany({
      where: filters.length ? { AND: filters } : undefined,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.projectCard.findMany({
      where: { year: { not: null } },
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[28px] font-bold">ค้นหาโครงการ</h1>
        <p className="mt-1 text-sm text-muted">
          ค้นหาจากลูกค้า ชื่อโครงการ หรือคำอธิบาย พร้อมกรองตามปีและงบประมาณ — ข้อมูลมาจากการ crawl share{" "}
          <code className="text-xs">PS</code> ด้วยมือ (ดู{" "}
          <code className="text-xs">project-card-crawler/README.md</code>)
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4">
        <Field
          label="ค้นหา"
          name="q"
          defaultValue={query}
          leftIcon={<SearchIcon size={18} />}
          placeholder="เช่น Solarcell, RFID, MEA"
          containerClassName="min-w-[240px] flex-1"
        />
        <div className="min-w-[140px]">
          <label className="mb-1.5 block text-[13px] font-medium text-label">ปี</label>
          <select
            name="year"
            defaultValue={year !== undefined ? String(year) : ""}
            className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
          >
            <option value="">ทุกปี</option>
            {availableYears.map(({ year: y }) => (
              <option key={y} value={y ?? ""}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="งบประมาณ ตั้งแต่ (บาท)"
          name="budgetMin"
          type="number"
          min={0}
          step="any"
          defaultValue={budgetMin !== undefined ? String(budgetMin) : ""}
          placeholder="0"
          containerClassName="w-[180px]"
        />
        <Field
          label="งบประมาณ ถึง (บาท)"
          name="budgetMax"
          type="number"
          min={0}
          step="any"
          defaultValue={budgetMax !== undefined ? String(budgetMax) : ""}
          placeholder="ไม่จำกัด"
          containerClassName="w-[180px]"
        />
        <Button type="submit" variant="dark" className="h-[52px]">
          ค้นหา
        </Button>
      </form>

      <p className="text-sm text-muted">พบ {cards.length.toLocaleString("th-TH")} โครงการ</p>

      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        {cards.length ? (
          <ul className="divide-y divide-line">
            {cards.map((card) => (
              <li key={card.id} className="flex flex-col gap-3 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-chip px-3 py-1 text-xs font-medium text-label">
                        {card.projectCode}
                      </span>
                      <span className="text-xs text-muted">{card.client}</span>
                      {card.year ? <span className="text-xs text-muted">ปี {card.year}</span> : null}
                    </div>
                    <div className="mt-1 font-display text-lg font-semibold text-ink">{card.projectName}</div>
                  </div>
                  <ProjectCardBudgetForm
                    id={card.id}
                    budgetAmount={card.budgetAmount ? card.budgetAmount.toString() : null}
                    budgetVerified={card.budgetVerified}
                    budgetSource={card.budgetSource}
                    vatStatus={card.vatStatus}
                    budgetNote={card.budgetNote}
                  />
                </div>

                {card.descriptionTh || card.descriptionEn ? (
                  <div className="text-sm text-label">
                    {card.descriptionTh ? <p>{card.descriptionTh}</p> : null}
                    {card.descriptionEn ? <p className="text-muted">{card.descriptionEn}</p> : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted">ยังไม่มีคำอธิบาย (รอ AI สรุป หรือกรอกเอง)</p>
                )}

                <div className="flex flex-col gap-2">
                  {card.contractPath ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">สัญญา</span>
                      <code className="flex-1 truncate rounded-input bg-chip px-3 py-2 text-xs text-muted">
                        {card.contractPath}
                      </code>
                      <CopyButton value={card.contractPath} label="คัดลอกพาธ" />
                    </div>
                  ) : null}
                  {card.certificatePath ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">หนังสือรับรอง</span>
                      <code className="flex-1 truncate rounded-input bg-chip px-3 py-2 text-xs text-muted">
                        {card.certificatePath}
                      </code>
                      <CopyButton value={card.certificatePath} label="คัดลอกพาธ" />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-12 text-center">
            <div className="font-display text-lg font-semibold">
              {filters.length ? "ไม่พบโครงการที่ค้นหา" : "ยังไม่มีข้อมูลโครงการ"}
            </div>
            <p className="mt-2 text-sm text-muted">
              {filters.length ? "ลองปรับคำค้นหรือตัวกรอง" : "รันสคริปต์ crawler เพื่อดึงข้อมูลจาก share ก่อน"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
