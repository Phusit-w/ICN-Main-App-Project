// The sort a user picks on ค้นหาโครงการ's result list (a column header, or
// เรียงตาม on a narrow screen). Applied in the browser to the rows the page
// already filtered, and by the Excel export to the same rows, so a download
// comes out in the order on screen. No server-only imports.

export type ProjectCardSortKey = "name" | "client" | "year" | "certificate" | "budget";
export type ProjectCardSort = { key: ProjectCardSortKey; dir: "asc" | "desc" } | null;

// The fields a sort reads. certificateDate is "YYYY-MM-DD" (sorts as text);
// budgetAmount is the Decimal as text.
type Sortable = {
  projectName: string;
  client: string;
  year: number | null;
  certificateDate: string | null;
  budgetAmount: string | null;
};

export const SORT_LABEL: Record<ProjectCardSortKey, string> = {
  name: "โครงการ",
  client: "ลูกค้า",
  year: "ปี",
  certificate: "หนังสือรับรอง",
  budget: "งบประมาณ (บาท)",
};

function sortValue(card: Sortable, key: ProjectCardSortKey): string | number | null {
  switch (key) {
    case "name":
      return card.projectName;
    case "client":
      return card.client;
    case "year":
      return card.year;
    case "certificate":
      return card.certificateDate;
    case "budget":
      return card.budgetAmount === null ? null : Number(card.budgetAmount);
  }
}

// Cards with no value (no year, no budget) stay at the bottom in either
// direction; ties keep the page's own order (main-Category matches first).
export function sortCards<T extends Sortable>(cards: T[], sort: ProjectCardSort): T[] {
  if (!sort) return cards;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    const diff = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "th");
    return diff * sign;
  });
}

// "year:desc" (as the export link and เรียงตาม write it) → the sort; anything
// else → the page's own order.
export function parseSort(text: string | null | undefined): ProjectCardSort {
  const [key, dir] = (text ?? "").split(":");
  if (!Object.hasOwn(SORT_LABEL, key) ||(dir !== "asc" && dir !== "desc")) return null;
  return { key: key as ProjectCardSortKey, dir };
}

export const sortParam = (sort: ProjectCardSort) => (sort ? `${sort.key}:${sort.dir}` : "");

// Each sort in words, as เรียงตาม lists them and the export's เงื่อนไข sheet names them.
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "year:desc", label: "ปี มาก → น้อย" },
  { value: "year:asc", label: "ปี น้อย → มาก" },
  { value: "certificate:desc", label: "หนังสือรับรอง ใหม่ → เก่า" },
  { value: "certificate:asc", label: "หนังสือรับรอง เก่า → ใหม่" },
  { value: "budget:desc", label: "งบ มาก → น้อย" },
  { value: "budget:asc", label: "งบ น้อย → มาก" },
  { value: "name:asc", label: "ชื่อโครงการ ก → ฮ" },
  { value: "name:desc", label: "ชื่อโครงการ ฮ → ก" },
  { value: "client:asc", label: "ลูกค้า ก → ฮ" },
  { value: "client:desc", label: "ลูกค้า ฮ → ก" },
];

export function sortDescription(sort: ProjectCardSort): string {
  if (!sort) return "ลำดับเดิมของหน้าค้นหา (ปีใหม่ → เก่า แล้วตามรหัสโครงการ)";
  return SORT_OPTIONS.find((o) => o.value === sortParam(sort))!.label;
}
