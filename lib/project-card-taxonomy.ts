// The company lists a Project Card is classified from (CONTEXT.md's
// Category / Tag / Work Type entries) live in the ProjectCardTerm table and
// are kept by admins in Admin Center — see lib/project-card-terms.ts for
// loading them. This module holds the pure, client-safe helpers that every
// reader (ingest validation, the popup, the search filter, free-text
// matching) applies to a loaded list, so they can never disagree.

export type Term = { value: string; en: string; th: string };
export const TERM_KINDS = ["category", "workType"] as const;
export type TermKind = (typeof TERM_KINDS)[number];
export type Taxonomy = { categories: Term[]; workTypes: Term[] };

export function isTermKind(value: unknown): value is TermKind {
  return typeof value === "string" && (TERM_KINDS as readonly string[]).includes(value);
}

export function isTerm(list: readonly Term[], value: unknown): value is string {
  return typeof value === "string" && list.some((t) => t.value === value);
}

export function termLabel(list: readonly Term[], value: string): string {
  return list.find((t) => t.value === value)?.en ?? value;
}

const THAI = /[฀-๿]/;

// Free-text search over Category/Tags ("fiber", "ใยแก้ว" and "Fiber Optic"
// all reach `fiber-optic`). A Latin query must match the start of a word in
// the English label — plain substring matching made short, common queries
// misfire ("MA" hit "sMArt", "IT" hit "cITy"). Thai is written without
// spaces between words, so a Thai query matches anywhere in the Thai label.
export function matchCategories(list: readonly Term[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (THAI.test(q)) return list.filter((c) => c.th.includes(q)).map((c) => c.value);
  return list
    .filter((c) => {
      const label = c.en.toLowerCase();
      return label.startsWith(q) || label.split(/[^a-z0-9]+/).some((word) => word.startsWith(q));
    })
    .map((c) => c.value);
}

// Free-text search over Work Types ("MA", "บำรุงรักษา", "rental", "เช่า").
// Stricter than matchCategories for Latin queries: a 1–2 letter query must
// be a whole word, because "MA" is itself a Work Type and word-prefix
// matching would also list every Managed Services card. From 3 letters on,
// a word prefix is enough ("rent", "install", "maint"). Thai matches
// anywhere in the Thai label, as for Categories.
export function matchWorkTypes(list: readonly Term[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (THAI.test(q)) return list.filter((w) => w.th.includes(q)).map((w) => w.value);
  return list
    .filter((w) => {
      const words = w.en.toLowerCase().split(/[^a-z0-9]+/);
      return words.some((word) => word === q || (q.length >= 3 && word.startsWith(q)));
    })
    .map((w) => w.value);
}

// The stored `value` for a new list entry, from its English label
// ("Solar & EV" -> "solar-ev"). Empty when the label has no Latin letters
// or digits, which the admin form rejects.
export function termValueFrom(en: string): string {
  return en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Which material a Description was written from (CONTEXT.md's Description
// Source entry), in order of preference, plus `manual` once a person edits
// it in the popup. Only the web ever sets `manual`; a push may send the
// other four. `name` is a guess from the project name alone, so the popup
// marks it as such rather than presenting it like one read from documents.
// Unlike the lists above this one is part of the code's rules, not data an
// admin edits.
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
