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

// How ICN delivered a project (CONTEXT.md's Work Type entry) — never what
// it was about, which is the Category. A card has one or more. Same rules
// as CATEGORIES: the single source for validation, the popup and search;
// never rename a `value` once cards carry it.
export const WORK_TYPES = [
  { value: "supply", en: "Supply", th: "จัดหาอุปกรณ์" },
  { value: "installation", en: "Installation", th: "ติดตั้ง" },
  { value: "ma", en: "MA (Maintenance)", th: "บำรุงรักษา (MA)" },
  { value: "managed-services", en: "Managed Services", th: "บริการบริหารจัดการระบบ" },
  { value: "rental", en: "Rental", th: "เช่าใช้" },
  { value: "system-development", en: "System Development", th: "พัฒนาระบบ" },
] as const;

export type WorkTypeValue = (typeof WORK_TYPES)[number]["value"];

const WORK_TYPE_VALUES: ReadonlySet<string> = new Set(WORK_TYPES.map((w) => w.value));

export function isWorkType(value: unknown): value is WorkTypeValue {
  return typeof value === "string" && WORK_TYPE_VALUES.has(value);
}

export function workTypeLabel(value: string): string {
  return WORK_TYPES.find((w) => w.value === value)?.en ?? value;
}

// Free-text search over Work Types ("MA", "บำรุงรักษา", "rental", "เช่า").
// Stricter than matchCategories for Latin queries: a 1–2 letter query must
// be a whole word, because "MA" is itself a Work Type and word-prefix
// matching would also list every Managed Services card. From 3 letters on,
// a word prefix is enough ("rent", "install", "maint"). Thai matches
// anywhere in the Thai label, as for Categories.
export function matchWorkTypes(query: string): WorkTypeValue[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (/[฀-๿]/.test(q)) {
    return WORK_TYPES.filter((w) => w.th.includes(q)).map((w) => w.value);
  }
  return WORK_TYPES.filter((w) => {
    const words = w.en.toLowerCase().split(/[^a-z0-9]+/);
    return words.some((word) => word === q || (q.length >= 3 && word.startsWith(q)));
  }).map((w) => w.value);
}

// Which material a Description was written from (CONTEXT.md's Description
// Source entry), in order of preference, plus `manual` once a person edits
// it in the popup. Only the web ever sets `manual`; a push may send the
// other four. `name` is a guess from the project name alone, so the popup
// marks it as such rather than presenting it like one read from documents.
export const DESCRIPTION_SOURCES = [
  { value: "tor", th: "จาก TOR (ขอบเขตของงาน)" },
  { value: "proposal", th: "จาก Proposal ที่ ICN เสนอ (ไม่มี TOR)" },
  { value: "contract", th: "จากสัญญา (ไม่มี TOR/Proposal)" },
  { value: "name", th: "เขียนจากชื่อโครงการเท่านั้น — ยังไม่ได้อ่านเอกสาร" },
  { value: "manual", th: "แก้ไขโดยคน" },
] as const;

export type DescriptionSourceValue = (typeof DESCRIPTION_SOURCES)[number]["value"];
export type PushedDescriptionSource = Exclude<DescriptionSourceValue, "manual">;

const PUSHED_DESCRIPTION_SOURCES: ReadonlySet<string> = new Set(
  DESCRIPTION_SOURCES.map((s) => s.value).filter((v) => v !== "manual"),
);

export function isPushedDescriptionSource(value: unknown): value is PushedDescriptionSource {
  return typeof value === "string" && PUSHED_DESCRIPTION_SOURCES.has(value);
}

export function descriptionSourceLabel(value: string): string {
  return DESCRIPTION_SOURCES.find((s) => s.value === value)?.th ?? value;
}
