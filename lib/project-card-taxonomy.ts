// The fixed company list of technology areas a Project Card's Category and
// Tags are chosen from (CONTEXT.md's Category / Tag entries). The single
// source for ingest validation, the popup's edit form, the search page's
// filter and free-text matching — so they can never disagree. Adding an
// area is an edit here only: values are stored as plain strings, no
// migration needed. Never rename a `value` once cards carry it.
export const CATEGORIES = [
  { value: "ip-network", en: "IP Network", th: "โครงข่าย IP" },
  { value: "transmission", en: "Transmission", th: "ระบบสื่อสัญญาณ" },
  { value: "fiber-optic", en: "Fiber Optic", th: "เคเบิลใยแก้วนำแสง" },
  { value: "microwave-radio", en: "Microwave & Radio", th: "ไมโครเวฟและวิทยุสื่อสาร" },
  { value: "teleprotection", en: "Teleprotection", th: "ระบบป้องกันสายส่ง" },
  { value: "telecom-core", en: "Telecom Core & OSS/BSS", th: "ระบบหลักโทรคมนาคม" },
  { value: "data-center-it", en: "Data Center & IT", th: "ศูนย์ข้อมูลและไอที" },
  { value: "software", en: "Software", th: "ซอฟต์แวร์" },
  { value: "education-devices", en: "Education Devices", th: "อุปกรณ์การเรียนการสอน" },
  { value: "smart-city-security", en: "Smart City & Security", th: "เมืองอัจฉริยะและความปลอดภัย" },
  { value: "energy", en: "Energy", th: "พลังงาน" },
  { value: "medical", en: "Medical", th: "การแพทย์" },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

const CATEGORY_VALUES: ReadonlySet<string> = new Set(CATEGORIES.map((c) => c.value));

export function isCategory(value: unknown): value is CategoryValue {
  return typeof value === "string" && CATEGORY_VALUES.has(value);
}

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.en ?? value;
}

// Free-text search over Category/Tags ("fiber", "ใยแก้ว" and "Fiber Optic"
// all reach `fiber-optic`). A Latin query must match the start of a word in
// the English label — plain substring matching made short, common queries
// misfire ("MA" hit "sMArt", "IT" hit "cITy"). Thai is written without
// spaces between words, so a Thai query matches anywhere in the Thai label.
export function matchCategories(query: string): CategoryValue[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (/[฀-๿]/.test(q)) {
    return CATEGORIES.filter((c) => c.th.includes(q)).map((c) => c.value);
  }
  return CATEGORIES.filter((c) => {
    const label = c.en.toLowerCase();
    return label.startsWith(q) || label.split(/[^a-z0-9]+/).some((word) => word.startsWith(q));
  }).map((c) => c.value);
}
