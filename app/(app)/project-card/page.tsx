import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireActor } from "@/lib/authorization";
import Field from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import { SearchIcon } from "@/components/icons";
import ProjectCardList from "@/components/ProjectCardList";
import { CommaNumberField } from "@/components/CommaNumberInput";

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
  // The budget filter is typed in millions of baht (ล้านบาท) so users enter
  // "10" rather than "10000000"; the DB still stores full baht.
  const budgetMin = parseFloatParam(budgetMinParam);
  const budgetMax = parseFloatParam(budgetMaxParam);
  const toBaht = (millions: number) => Math.round(millions * 1_000_000);

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
  if (budgetMin !== undefined) filters.push({ budgetAmount: { gte: toBaht(budgetMin) } });
  if (budgetMax !== undefined) filters.push({ budgetAmount: { lte: toBaht(budgetMax) } });

  const [cards, availableYears] = await Promise.all([
    prisma.projectCard.findMany({
      where: filters.length ? { AND: filters } : undefined,
      // Stable order (not updatedAt) so saving an edit in the popup doesn't
      // make that row jump to the top of the list.
      orderBy: [{ year: { sort: "desc", nulls: "last" } }, { projectCode: "asc" }],
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
        <CommaNumberField
          label="งบมากกว่า (ล้านบาท)"
          name="budgetMin"
          maxDecimals={6}
          defaultValue={budgetMin !== undefined ? String(budgetMin) : ""}
          placeholder="เช่น 10"
          containerClassName="w-[180px]"
        />
        <CommaNumberField
          label="งบน้อยกว่า (ล้านบาท)"
          name="budgetMax"
          maxDecimals={6}
          defaultValue={budgetMax !== undefined ? String(budgetMax) : ""}
          placeholder="เช่น 100"
          containerClassName="w-[180px]"
        />
        <Button type="submit" variant="dark" className="h-[52px]">
          ค้นหา
        </Button>
      </form>

      <p className="text-sm text-muted">พบ {cards.length.toLocaleString("th-TH")} โครงการ</p>

      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        {cards.length ? (
          <ProjectCardList
            cards={cards.map((card) => ({
              id: card.id,
              projectCode: card.projectCode,
              client: card.client,
              projectName: card.projectName,
              descriptionTh: card.descriptionTh,
              descriptionEn: card.descriptionEn,
              contractPath: card.contractPath,
              certificatePath: card.certificatePath,
              budgetAmount: card.budgetAmount ? card.budgetAmount.toString() : null,
              budgetSource: card.budgetSource,
              vatStatus: card.vatStatus,
              budgetNote: card.budgetNote,
              budgetVerified: card.budgetVerified,
              year: card.year,
            }))}
          />
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
