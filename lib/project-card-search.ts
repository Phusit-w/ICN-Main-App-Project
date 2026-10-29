// ค้นหาโครงการ's search: the URL's query and filters → the Prisma filter, the
// chips that name each filter in use, and the matching cards in the page's
// order. Shared by the page and its Excel export, so a download always holds
// exactly the cards on screen. Server-only (Prisma).
import { prisma } from "@/lib/prisma";
import type { Prisma, ProjectCard } from "@/lib/generated/prisma/client";
import type { ProjectCardRow } from "@/components/ProjectCardList";
import { matchCategories, matchWorkTypes, type Taxonomy, type Term } from "@/lib/project-card-taxonomy";
import { CERTIFICATE_AGE_OPTIONS, certificateDateValue, certificateDatedSince } from "@/lib/project-card-certificate-date";

export type ProjectCardSearchParams = {
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
};

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

// The params of a URLSearchParams (the export route's request) in the shape
// the page receives them.
export function searchParamsFrom(params: URLSearchParams): ProjectCardSearchParams {
  const one = (key: string) => params.get(key) ?? undefined;
  return {
    q: one("q"), client: one("client"), category: one("category"), workType: one("workType"),
    yearFrom: one("yearFrom"), yearTo: one("yearTo"), budgetMin: one("budgetMin"), budgetMax: one("budgetMax"),
    doc: params.getAll("doc"), certWithin: one("certWithin"),
  };
}

export function parseProjectCardSearch(params: ProjectCardSearchParams, taxonomy: Taxonomy) {
  const query = params.q?.trim() ?? "";
  const client = params.client?.trim() ?? "";
  const categoryText = params.category?.trim() ?? "";
  const categoryTerms = resolveTerms(taxonomy.categories, categoryText);
  // One Category shows its English label in the box; otherwise keep what was typed.
  const categoryDisplay = categoryTerms.length === 1 ? categoryTerms[0].en : categoryText;
  const workTypeText = params.workType?.trim() ?? "";
  const workTypeTerms = resolveTerms(taxonomy.workTypes, workTypeText);
  const workTypeDisplay = workTypeTerms.length === 1 ? workTypeTerms[0].en : workTypeText;
  // Year range, inclusive on both ends; either side may be left blank.
  const yearFrom = parseIntParam(params.yearFrom);
  const yearTo = parseIntParam(params.yearTo);
  // The budget filter is typed in millions of baht (ล้านบาท) so users enter
  // "10" rather than "10000000"; the DB still stores full baht.
  const budgetMin = parseFloatParam(params.budgetMin);
  const budgetMax = parseFloatParam(params.budgetMax);
  const toBaht = (millions: number) => Math.round(millions * 1_000_000);
  // "เอกสารที่มี": every ticked document must be on the card. Read from the
  // card's own Folder Paths — a path means the project has that document.
  const docs = new Set([params.doc ?? []].flat());
  const wantsContract = docs.has("contract");
  const wantsCertificate = docs.has("certificate");
  // "หนังสือรับรองออกภายใน N ปี": only the listed choices; anything else is ignored.
  const certWithin = CERTIFICATE_AGE_OPTIONS.find((years) => String(years) === params.certWithin);

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
  // secondary one (a Tag); main-Category matches are listed first.
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
    yearFrom: params.yearFrom, yearTo: params.yearTo, budgetMin: params.budgetMin, budgetMax: params.budgetMax,
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

  return {
    query, client, categoryText, categoryDisplay, workTypeText, workTypeDisplay,
    yearFrom, yearTo, budgetMin, budgetMax, wantsContract, wantsCertificate, certWithin,
    where: filters.length ? { AND: filters } : undefined,
    filtered: filters.length > 0,
    chips, currentParams, categoryValues,
  };
}

export type ProjectCardSearch = ReturnType<typeof parseProjectCardSearch>;

// The matching cards, as rows, in the page's own order: year (newest first), then
// Project Code — stable, so saving an edit in the popup doesn't make that row
// jump. With a Category filter, cards whose main Category was filtered for
// come before those that only have it as a secondary one, each group keeping
// the year order.
export async function findProjectCards(search: ProjectCardSearch) {
  const cards = await prisma.projectCard.findMany({
    where: search.where,
    orderBy: [{ year: { sort: "desc", nulls: "last" } }, { projectCode: "asc" }],
  });
  const rows = cards.map(projectCardRow);
  if (!search.categoryText) return rows;
  const main = (c: ProjectCardRow) => c.category !== null && search.categoryValues.includes(c.category);
  return [...rows.filter(main), ...rows.filter((c) => !main(c))];
}

// A card as the list and the export read it: Decimal and Date as text, so it
// can go to the browser and both sort it the same way (lib/project-card-sort.ts).
function projectCardRow(card: ProjectCard): ProjectCardRow {
  return {
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
  };
}
