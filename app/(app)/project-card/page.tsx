import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requirePageAccess } from "@/lib/authorization";
import { hasAccess } from "@/lib/access";
import Field from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import { SearchIcon } from "@/components/icons";
import ProjectCardList from "@/components/ProjectCardList";
import SocGuidedTour from "@/components/SocGuidedTour";
import { PROJECT_CARD_TOUR } from "@/lib/project-card-tours";
import { CommaNumberField } from "@/components/CommaNumberInput";
import Link from "next/link";
import { matchCategories, matchWorkTypes, type Term } from "@/lib/project-card-taxonomy";
import { loadTaxonomy } from "@/lib/project-card-terms";
import {
  CERTIFICATE_AGE_OPTIONS,
  certificateDateValue,
  certificateDatedSince,
} from "@/lib/project-card-certificate-date";

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

// The Category and Work Type boxes are typed or picked from a datalist, so
// each may arrive as a stored value ("fiber-optic"), an English or Thai label
// ("Fiber Optic", "เคเบิลใยแก้วนำแสง"), or part of a label ("fiber", "ระบบ"),
// which filters by every entry it fits. Text that fits none matches no cards.
function resolveTerms(terms: readonly Term[], text: string): Term[] {
  const needle = text.toLowerCase();
  if (!needle) return [];
  const exact = terms.find(
    (c) => c.value === needle || c.en.toLowerCase() === needle || c.th.toLowerCase() === needle,
  );
  if (exact) return [exact];
  return terms.filter((c) => c.en.toLowerCase().includes(needle) || c.th.includes(needle));
}

// Datalist options for the client filter. "PEA (BBTEC)" is split so the card
// counts toward both PEA and BBTEC, matching how the filter above finds it.
function clientOptions(rows: { client: string; _count: number }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const { client, _count } of rows) {
    const match = /^(.+?) \((.+)\)$/.exec(client);
    for (const name of match ? [match[1], match[2]] : [client]) {
      counts.set(name, (counts.get(name) ?? 0) + _count);
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

export default async function ProjectCardPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    client?: string;
    category?: string;
    workType?: string;
    yearFrom?: string;
    yearTo?: string;
    budgetMin?: string;
    budgetMax?: string;
    // Ticked "เอกสารที่มี" boxes: contract and/or certificate.
    doc?: string | string[];
    certWithin?: string;
  }>;
}) {
  const actor = await requirePageAccess("project-card");
  const {
    q,
    client: clientParam,
    category: categoryParam,
    workType: workTypeParam,
    yearFrom: yearFromParam,
    yearTo: yearToParam,
    budgetMin: budgetMinParam,
    budgetMax: budgetMaxParam,
    doc: docParam,
    certWithin: certWithinParam,
  } = await searchParams;
  const taxonomy = await loadTaxonomy();
  const query = q?.trim() ?? "";
  const client = clientParam?.trim() ?? "";
  const categoryText = categoryParam?.trim() ?? "";
  const categoryTerms = resolveTerms(taxonomy.categories, categoryText);
  // One Category shows its English label in the box; otherwise keep what was typed.
  const categoryDisplay = categoryTerms.length === 1 ? categoryTerms[0].en : categoryText;
  const workTypeText = workTypeParam?.trim() ?? "";
  const workTypeTerms = resolveTerms(taxonomy.workTypes, workTypeText);
  const workTypeDisplay = workTypeTerms.length === 1 ? workTypeTerms[0].en : workTypeText;
  // Year range, inclusive on both ends; either side may be left blank.
  const yearFrom = parseIntParam(yearFromParam);
  const yearTo = parseIntParam(yearToParam);
  // The budget filter is typed in millions of baht (ล้านบาท) so users enter
  // "10" rather than "10000000"; the DB still stores full baht.
  const budgetMin = parseFloatParam(budgetMinParam);
  const budgetMax = parseFloatParam(budgetMaxParam);
  const toBaht = (millions: number) => Math.round(millions * 1_000_000);
  // "เอกสารที่มี": every ticked document must be on the card. Read from the
  // card's own Folder Paths — a path means the project has that document.
  const docs = new Set([docParam ?? []].flat());
  const wantsContract = docs.has("contract");
  const wantsCertificate = docs.has("certificate");
  // "หนังสือรับรองออกภายใน N ปี": only the listed choices; anything else is ignored.
  const certWithin = CERTIFICATE_AGE_OPTIONS.find((years) => String(years) === certWithinParam);

  const filters: Prisma.ProjectCardWhereInput[] = [];
  const matchedCategories = matchCategories(taxonomy.categories, query);
  const matchedWorkTypes = matchWorkTypes(taxonomy.workTypes, query);
  if (query) {
    filters.push({
      OR: [
        { projectCode: { contains: query, mode: "insensitive" } },
        { client: { contains: query, mode: "insensitive" } },
        { projectName: { contains: query, mode: "insensitive" } },
        { descriptionTh: { contains: query, mode: "insensitive" } },
        { descriptionEn: { contains: query, mode: "insensitive" } },
        // A query naming a technology area ("fiber", "ใยแก้ว") also finds
        // cards with that Category or Tag — see lib/project-card-taxonomy.ts.
        ...(matchedCategories.length
          ? [{ category: { in: matchedCategories } }, { tags: { hasSome: matchedCategories } }]
          : []),
        // Likewise a Work Type ("MA", "เช่า") finds every card delivered that way.
        ...(matchedWorkTypes.length ? [{ workTypes: { hasSome: matchedWorkTypes } }] : []),
      ],
    });
  }
  // Client is typed or picked from the datalist. Exact match, case-insensitive
  // ("pea" finds PEA): a partial match would let "AT" pull in CAT, EGAT, ATD.
  // A subcontracted card stores "OWNER (CONTRACTOR)", e.g. "PEA (BBTEC)", so
  // either name finds it.
  if (client) {
    filters.push({
      OR: [
        { client: { equals: client, mode: "insensitive" } },
        { client: { startsWith: `${client} (`, mode: "insensitive" } },
        { client: { endsWith: `(${client})`, mode: "insensitive" } },
      ],
    });
  }
  // A Category filter finds cards with it as the main Category or as a
  // secondary one (a Tag); main-Category matches are listed first below.
  const categoryValues = categoryTerms.map((c) => c.value);
  if (categoryText) {
    filters.push({ OR: [{ category: { in: categoryValues } }, { tags: { hasSome: categoryValues } }] });
  }
  // A card lists one or more Work Types; it matches if any is among those picked.
  if (workTypeText) filters.push({ workTypes: { hasSome: workTypeTerms.map((w) => w.value) } });
  if (yearFrom !== undefined) filters.push({ year: { gte: yearFrom } });
  if (yearTo !== undefined) filters.push({ year: { lte: yearTo } });
  if (budgetMin !== undefined) filters.push({ budgetAmount: { gte: toBaht(budgetMin) } });
  if (budgetMax !== undefined) filters.push({ budgetAmount: { lte: toBaht(budgetMax) } });
  if (wantsContract) filters.push({ contractPath: { not: null } });
  if (wantsCertificate) filters.push({ certificatePath: { not: null } });
  // A card with no Certificate Date can't be shown to be recent enough, so it drops out.
  if (certWithin !== undefined) filters.push({ certificateDate: { gte: certificateDatedSince(certWithin) } });

  // The filters in use, each as a chip whose × drops just that filter and
  // keeps the rest (the search box itself isn't a chip: it stays in view).
  const currentParams = new URLSearchParams();
  for (const [key, value] of Object.entries({
    q: query, client, category: categoryText, workType: workTypeText,
    yearFrom: yearFromParam, yearTo: yearToParam, budgetMin: budgetMinParam, budgetMax: budgetMaxParam,
    certWithin: certWithin !== undefined ? String(certWithin) : undefined,
  })) {
    if (value) currentParams.set(key, value);
  }
  for (const d of docs) currentParams.append("doc", d);
  const without = (key: string, value?: string) => {
    const next = new URLSearchParams(currentParams);
    next.delete(key, value);
    const qs = next.toString();
    return qs ? `/project-card?${qs}` : "/project-card";
  };
  const withoutRange = (from: string, to: string) => {
    const next = new URLSearchParams(currentParams);
    next.delete(from);
    next.delete(to);
    const qs = next.toString();
    return qs ? `/project-card?${qs}` : "/project-card";
  };
  const range = (from: number | undefined, to: number | undefined, unit: string, fromWord: string, toWord: string) =>
    from !== undefined && to !== undefined ? `${unit} ${from}–${to}` : from !== undefined ? `${fromWord} ${from}` : `${toWord} ${to}`;
  const chips: { label: string; href: string }[] = [
    ...(client ? [{ label: `ลูกค้า: ${client}`, href: without("client") }] : []),
    ...(categoryText ? [{ label: `หมวดหมู่: ${categoryDisplay}`, href: without("category") }] : []),
    ...(workTypeText ? [{ label: `ลักษณะงาน: ${workTypeDisplay}`, href: without("workType") }] : []),
    ...(yearFrom !== undefined || yearTo !== undefined
      ? [{ label: range(yearFrom, yearTo, "ปี", "ตั้งแต่ปี", "ถึงปี"), href: withoutRange("yearFrom", "yearTo") }]
      : []),
    ...(budgetMin !== undefined || budgetMax !== undefined
      ? [{ label: `${range(budgetMin, budgetMax, "งบ", "งบมากกว่า", "งบน้อยกว่า")} ล้านบาท`, href: withoutRange("budgetMin", "budgetMax") }]
      : []),
    ...(wantsContract ? [{ label: "มีสัญญา", href: without("doc", "contract") }] : []),
    ...(wantsCertificate ? [{ label: "มีหนังสือรับรอง", href: without("doc", "certificate") }] : []),
    ...(certWithin !== undefined ? [{ label: `หนังสือรับรองออกภายใน ${certWithin} ปี`, href: without("certWithin") }] : []),
  ];

  const [matchedCards, availableYears, availableClients, categoryCounts, workTypeCounts] = await Promise.all([
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
    prisma.projectCard.groupBy({
      by: ["client"],
      _count: true,
      orderBy: { client: "asc" },
    }),
    // Counted the way the filter finds cards: main Category or secondary (Tag).
    Promise.all(
      taxonomy.categories.map((c) =>
        prisma.projectCard.count({ where: { OR: [{ category: c.value }, { tags: { has: c.value } }] } }),
      ),
    ),
    // workTypes is an array column, which groupBy can't split — one count per
    // Work Type instead (the list holds only a handful).
    Promise.all(taxonomy.workTypes.map((w) => prisma.projectCard.count({ where: { workTypes: { has: w.value } } }))),
  ]);
  // Stable sort: cards whose main Category was filtered for come before those
  // that only have it as a secondary one, each group keeping the year order.
  const cards = categoryText
    ? [
        ...matchedCards.filter((c) => c.category !== null && categoryValues.includes(c.category)),
        ...matchedCards.filter((c) => c.category === null || !categoryValues.includes(c.category)),
      ]
    : matchedCards;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold">ค้นหาโครงการ</h1>
          <p className="mt-1 text-sm text-muted">
            ค้นหาจากลูกค้า ชื่อโครงการ หรือคำอธิบาย พร้อมกรองตามลูกค้า หมวดหมู่ ลักษณะงาน ปี งบประมาณ และเอกสาร — ข้อมูลจากสัญญาและหนังสือรับรองผลงานในโฟลเดอร์{" "}
            <code className="text-xs">_BID</code>
          </p>
        </div>
        <SocGuidedTour tourId="project-card" steps={PROJECT_CARD_TOUR} />
      </div>

      {/* The boxes only read defaultValue when first made, and ล้างทั้งหมด / a chip's ×
          change the URL without a page load. Keyed on the filters in use, the
          form is made afresh whenever they change, so a dropped filter's text
          doesn't linger in its box (and come back on the next ค้นหา). */}
      <form key={currentParams.toString()} method="get" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div data-tour="search" className="min-w-[240px] flex-1">
            <Field
              label="ค้นหา"
              name="q"
              defaultValue={query}
              leftIcon={<SearchIcon size={18} />}
              placeholder="เช่น Solarcell, RFID, MEA"
            />
          </div>
          <Button type="submit" variant="dark" className="h-[52px]" data-tour="search-button">
            ค้นหา
          </Button>
        </div>
        {/* Every filter but the search box, folded so the page opens on one row.
            A plain <details>: no script, and its fields still submit with the form. */}
        <details className="group rounded-card bg-surface shadow-card">
          <summary data-tour="filters" className="ui-btn flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium text-label hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="transition-transform group-open:rotate-90">▸</span>
            ตัวกรอง
            {chips.length ? (
              <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-surface">{chips.length}</span>
            ) : null}
            <span className="text-xs font-normal text-muted">ลูกค้า หมวดหมู่ ลักษณะงาน ปี งบประมาณ เอกสาร</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-[150px]">
                <label className="mb-1.5 block text-[13px] font-medium text-label">ลูกค้า</label>
                <input
                  name="client"
                  list="project-card-clients"
                  defaultValue={client}
                  placeholder="ทุกลูกค้า"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-clients">
                  {clientOptions(availableClients).map(([c, count]) => (
                    <option key={c} value={c} label={`${count.toLocaleString("th-TH")} โครงการ`} />
                  ))}
                </datalist>
              </div>
              <div className="w-[280px]">
                <label htmlFor="project-card-category" className="mb-1.5 block text-[13px] font-medium text-label">
                  หมวดหมู่
                </label>
                <input
                  id="project-card-category"
                  name="category"
                  list="project-card-categories"
                  defaultValue={categoryDisplay}
                  placeholder="ทุกหมวด — พิมพ์หรือเลือก"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-categories">
                  {taxonomy.categories.map((c, i) => (
                    <option
                      key={c.value}
                      value={c.en}
                      label={`${c.th} · ${categoryCounts[i].toLocaleString("th-TH")} โครงการ`}
                    />
                  ))}
                </datalist>
              </div>
              <div className="w-[240px]">
                <label htmlFor="project-card-work-type" className="mb-1.5 block text-[13px] font-medium text-label">
                  ลักษณะงาน
                </label>
                <input
                  id="project-card-work-type"
                  name="workType"
                  list="project-card-work-types"
                  defaultValue={workTypeDisplay}
                  placeholder="ทุกลักษณะงาน — พิมพ์หรือเลือก"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-work-types">
                  {taxonomy.workTypes.map((w, i) => (
                    <option
                      key={w.value}
                      value={w.en}
                      label={`${w.th} · ${workTypeCounts[i].toLocaleString("th-TH")} โครงการ`}
                    />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-[120px]">
                <label htmlFor="project-card-year-from" className="mb-1.5 block text-[13px] font-medium text-label">
                  ตั้งแต่ปี
                </label>
                <input
                  id="project-card-year-from"
                  name="yearFrom"
                  list="project-card-years"
                  inputMode="numeric"
                  defaultValue={yearFrom !== undefined ? String(yearFrom) : ""}
                  placeholder="เช่น 2020"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
              </div>
              <div className="w-[120px]">
                <label htmlFor="project-card-year-to" className="mb-1.5 block text-[13px] font-medium text-label">
                  ถึงปี
                </label>
                <input
                  id="project-card-year-to"
                  name="yearTo"
                  list="project-card-years"
                  inputMode="numeric"
                  defaultValue={yearTo !== undefined ? String(yearTo) : ""}
                  placeholder="เช่น 2024"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-years">
                  {availableYears.map(({ year: y }) => (
                    <option key={y} value={y ?? ""} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-wrap items-end gap-4">
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
              </div>
            </div>
              <div className="flex flex-wrap items-end gap-4">
                <fieldset>
                  <legend className="mb-1.5 block text-[13px] font-medium text-label">เอกสารที่มี</legend>
                  <div className="flex h-[52px] items-center gap-4 text-sm text-ink">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="doc" value="contract" defaultChecked={wantsContract} className="size-4" />
                      สัญญา
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="doc" value="certificate" defaultChecked={wantsCertificate} className="size-4" />
                      หนังสือรับรอง
                    </label>
                  </div>
                </fieldset>
                <div className="w-[200px]">
                  <label htmlFor="project-card-cert-within" className="mb-1.5 block text-[13px] font-medium text-label">
                    หนังสือรับรองออกภายใน
                  </label>
                  <select
                    id="project-card-cert-within"
                    name="certWithin"
                    defaultValue={certWithin !== undefined ? String(certWithin) : ""}
                    className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                  >
                    <option value="">ไม่กำหนด</option>
                    {CERTIFICATE_AGE_OPTIONS.map((years) => (
                      <option key={years} value={years}>
                        {years} ปี
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            <div className="flex gap-2">
              <Button type="submit" variant="dark" size="sm">
                ใช้ตัวกรอง
              </Button>
            </div>
          </div>
        </details>
      </form>

      {chips.length ? (
        <div data-tour="active-filters" className="-mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">ใช้อยู่:</span>
          {chips.map((chip) => (
            <span key={chip.label} className="inline-flex items-center gap-1 rounded-full bg-chip py-1 pl-3 pr-1 text-label">
              {chip.label}
              <Link
                href={chip.href}
                aria-label={`ลบตัวกรอง ${chip.label}`}
                className="ui-btn inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
              >
                ×
              </Link>
            </span>
          ))}
          {/* A plain link back to the unfiltered page: clears every filter and the search at once. */}
          <Link href="/project-card" className="ui-btn text-muted underline-offset-2 hover:text-ink hover:underline">
            ล้างทั้งหมด
          </Link>
        </div>
      ) : null}

      <p className="text-sm text-muted">พบ {cards.length.toLocaleString("th-TH")} โครงการ</p>

      <div data-tour="results" className="overflow-hidden rounded-card bg-surface shadow-card">
        {cards.length ? (
          <ProjectCardList
            taxonomy={taxonomy}
            canEdit={hasAccess(actor, "project-card-edit")}
            cards={cards.map((card) => ({
              id: card.id,
              projectCode: card.projectCode,
              client: card.client,
              projectName: card.projectName,
              descriptionTh: card.descriptionTh,
              descriptionEn: card.descriptionEn,
              descriptionSource: card.descriptionSource,
              contractPath: card.contractPath,
              certificatePath: card.certificatePath,
              projectFolderPath: card.projectFolderPath,
              budgetAmount: card.budgetAmount ? card.budgetAmount.toString() : null,
              budgetSource: card.budgetSource,
              vatStatus: card.vatStatus,
              budgetNote: card.budgetNote,
              budgetVerified: card.budgetVerified,
              year: card.year,
              certificateDate: certificateDateValue(card.certificateDate),
              category: card.category,
              tags: card.tags,
              workTypes: card.workTypes,
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
