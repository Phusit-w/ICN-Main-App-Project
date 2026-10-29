// The Question Translator (app/(app)/project-card/CONTEXT.md's Question
// Search entry; spec .scratch/question-search/spec.md): a question in
// everyday Thai or English → ค้นหาโครงการ's ordinary URL filters. What the
// prototype (branch prototype/question-search) learned lives here:
// - the model never picks a Category or Work Type — code does, from labels
//   and synonyms written in the question (round 1, model-picked: 33%);
// - every number the model reads must be backed by words in the question
//   (round 3: 59% → 93%);
// - the arithmetic (years ago, พ.ศ., certificate age) is done here.
// Server-only.
import { askModel, type ModelAnswer } from "@/lib/question-search-model";
import { namedIn, termNamedIn, termNames, type Taxonomy } from "@/lib/project-card-taxonomy";
import { CERTIFICATE_AGE_OPTIONS } from "@/lib/project-card-certificate-date";

export type QuestionAnswer = {
  // The search page's own params (q, category, workType, yearFrom, yearTo,
  // budgetMin, budgetMax in millions, certWithin).
  filters: Record<string, string>;
  // The question also asked for a ranking, total or count.
  unsupported: boolean;
  // The model failed: the whole question became the keyword.
  fellBack: boolean;
  reason?: string;
};

// Words that never become the keyword: they'd only narrow the search wrongly.
const GENERIC = ["งาน", "โครงการ", "ระบบ", "ผลงาน", "อุปกรณ์", "project", "projects"];

// The words that let a model value through, per kind of filter.
const YEAR_WORDS = ["ปี", "year"];
const BUDGET_WORDS = ["ล้าน", "บาท", "billion", "million", "baht", "งบ", "มูลค่า"];
const CERTIFICATE_WORDS = ["รับรอง", "certificate"];
const RANKING_WORDS = [
  "อันดับ", "สูงสุด", "ใหญ่สุด", "ใหญ่ที่สุด", "ต่ำสุด", "มากที่สุด", "น้อยที่สุด", "แพงที่สุด", "รวม", "ทั้งหมดกี่",
  "กี่โครงการ", "กี่งาน", "เท่าไร", "top", "highest", "lowest", "total", "sum", "how many",
];

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

// Years over 2400 are พ.ศ.
const toCE = (year: number) => (year > 2400 ? year - 543 : year);

// A positive number the model wrote, or undefined for anything else.
const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
// A whole number of years back, within reason.
const yearsBack = (value: unknown) => (Number.isInteger(value) && (value as number) > 0 && (value as number) <= 50 ? (value as number) : undefined);

// The model's answer, keeping only what the question has words for.
// `digits` is the question with Thai digits written as 0–9.
function ground(digits: string, raw: ModelAnswer): ModelAnswer {
  const says = (words: string[]) => words.some((w) => digits.toLowerCase().includes(w));
  const numbers = new Set(digits.match(/\d+/g) ?? []);
  const grounded: ModelAnswer = {};
  if (says(YEAR_WORDS)) {
    grounded.ago = yearsBack(raw.ago);
    grounded.within = yearsBack(raw.within);
    // A year must be a whole number the question actually wrote ("65" in
    // "2565" isn't), and a year of a contract (ค.ศ. 2000–2100, or พ.ศ.).
    for (const key of ["yf", "yt"] as const) {
      const year = raw[key];
      if (Number.isInteger(year) && numbers.has(String(year)) && toCE(year as number) >= 2000 && toCE(year as number) <= 2100) grounded[key] = year;
    }
  }
  if (says(BUDGET_WORDS)) {
    grounded.bmin = positive(raw.bmin);
    grounded.bmax = positive(raw.bmax);
  }
  if (says(CERTIFICATE_WORDS)) {
    grounded.cert = yearsBack(raw.cert);
    // "หนังสือรับรองภายใน N ปี" is about the certificate, not the contract Year.
    delete grounded.within;
  }
  if (says(RANKING_WORDS)) grounded.sort = raw.sort === true;
  if (typeof raw.k === "string") grounded.k = raw.k;
  return grounded;
}

// The first word of the model's keyword that is neither generic nor the name
// of a Category or Work Type (those are filters already). The page searches
// the keyword as one phrase, so "router Cisco" would find nothing.
function keyword(k: string | undefined, taxonomy: Taxonomy): string | undefined {
  const names = [...taxonomy.categories, ...taxonomy.workTypes].flatMap(termNames);
  const isFilterName = (word: string) =>
    names.some((name) => namedIn(word, name) || namedIn(name.toLowerCase(), word.toLowerCase()));
  return k?.split(/\s+/).find((word) => word && !GENERIC.includes(word.toLowerCase()) && !isFilterName(word));
}

// `year` is the current year in Bangkok (ค.ศ.).
export async function translateQuestion(question: string, taxonomy: Taxonomy, year: number): Promise<QuestionAnswer> {
  let raw: ModelAnswer;
  try {
    raw = await askModel(question, year);
  } catch (error) {
    return { filters: { q: question }, unsupported: false, fellBack: true, reason: error instanceof Error ? error.message : String(error) };
  }
  const digits = question.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  const grounded = ground(digits, raw);
  const filters: Record<string, string> = {};
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined) filters[key] = String(value);
  };

  set("q", keyword(grounded.k, taxonomy));
  set("category", termNamedIn(taxonomy.categories, question));
  set("workType", termNamedIn(taxonomy.workTypes, question));
  if (grounded.ago) {
    set("yearFrom", year - grounded.ago);
    set("yearTo", year - grounded.ago);
  } else if (grounded.within) {
    set("yearFrom", year - grounded.within);
    set("yearTo", year);
  } else {
    set("yearFrom", grounded.yf && toCE(grounded.yf));
    set("yearTo", grounded.yt && toCE(grounded.yt));
  }
  set("budgetMin", grounded.bmin);
  set("budgetMax", grounded.bmax);
  // Rounded up to the page's own choices, so no result is lost; above the
  // largest one there's no honest choice, so no filter.
  const cert = grounded.cert;
  if (cert) set("certWithin", CERTIFICATE_AGE_OPTIONS.find((option) => option >= cert));
  return { filters, unsupported: grounded.sort === true, fellBack: false };
}
