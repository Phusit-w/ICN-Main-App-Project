// The Question Translator (app/(app)/project-card/CONTEXT.md's Question
// Search entry; spec .scratch/question-search/spec.md): a question in
// everyday Thai or English → ค้นหาโครงการ's ordinary URL filters. What the
// prototype (branch prototype/question-search) learned lives here:
// - the model never picks a Category, Work Type or Client — code does, from
//   labels, synonyms and client names written in the question (round 1,
//   model-picked: 33%);
// - every number the model reads must be backed by words in the question
//   (round 3: 59% → 93%);
// - the arithmetic (years ago, พ.ศ., certificate age) is done here.
// Server-only.
import { askModel, type ModelAnswer } from "@/lib/question-search-model";
import { cutName, namedIn, termNamedIn, termNames, type Taxonomy } from "@/lib/project-card-taxonomy";
import { CERTIFICATE_AGE_OPTIONS } from "@/lib/project-card-certificate-date";

export type QuestionAnswer = {
  // The search page's own params (q, client, category, workType, yearFrom,
  // yearTo, budgetMin, budgetMax in millions, certWithin).
  filters: Record<string, string>;
  // The question also asked for a ranking, total or count.
  unsupported: boolean;
  // The model failed: the whole question became the keyword.
  fellBack: boolean;
  reason?: string;
  // False when code alone answered (the model had nothing to add).
  askedModel: boolean;
};

// What the page tells the person besides the chips: the question asked for
// a ranking/total/count, or wasn't understood.
export type QuestionNote = "unsupported" | "fallback";

export const questionNote = (answer: QuestionAnswer): QuestionNote | null =>
  answer.fellBack ? "fallback" : answer.unsupported ? "unsupported" : null;

// Words that never become the keyword: they'd only narrow the search wrongly.
const GENERIC = ["งาน", "โครงการ", "ระบบ", "ผลงาน", "อุปกรณ์", "project", "projects"];

// The words that let a model value through, per kind of filter.
const YEAR_WORDS = ["ปี", "year"];
const BUDGET_WORDS = ["ล้าน", "บาท", "billion", "million", "baht", "งบ", "มูลค่า"];
const CERTIFICATE_WORDS = ["รับรอง", "certificate"];
const RANKING_WORDS = [
  "อันดับ", "สูงสุด", "ใหญ่สุด", "ใหญ่ที่สุด", "ต่ำสุด", "มากที่สุด", "น้อยที่สุด", "แพงที่สุด", "รวม", "กี่", "เท่าไร",
  "top", "highest", "lowest", "largest", "biggest", "total", "sum", "how many",
];

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

const says = (text: string, words: string[]) => words.some((w) => text.toLowerCase().includes(w));

// Years over 2400 are พ.ศ.
const toCE = (year: number) => (year > 2400 ? year - 543 : year);

// A positive number the model wrote, or undefined for anything else.
const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
// A whole number of years back, within reason.
const yearsBack = (value: unknown) => (Number.isInteger(value) && (value as number) > 0 && (value as number) <= 50 ? (value as number) : undefined);

// The model's answer, keeping only what the question has words for.
// `digits` is the question with Thai digits written as 0–9.
function ground(digits: string, raw: ModelAnswer): ModelAnswer {
  const numbers = new Set(digits.match(/\d+/g) ?? []);
  const grounded: ModelAnswer = {};
  if (says(digits, YEAR_WORDS)) {
    grounded.ago = yearsBack(raw.ago);
    grounded.within = yearsBack(raw.within);
    // A year must be a whole number the question actually wrote ("65" in
    // "2565" isn't), and a year of a contract (ค.ศ. 2000–2100, or พ.ศ.).
    for (const key of ["yf", "yt"] as const) {
      const year = raw[key];
      if (Number.isInteger(year) && numbers.has(String(year)) && toCE(year as number) >= 2000 && toCE(year as number) <= 2100) grounded[key] = year;
    }
  }
  if (says(digits, BUDGET_WORDS)) {
    grounded.bmin = positive(raw.bmin);
    grounded.bmax = positive(raw.bmax);
  }
  if (says(digits, CERTIFICATE_WORDS)) {
    grounded.cert = yearsBack(raw.cert);
    // "หนังสือรับรองภายใน N ปี" is about the certificate, not the contract Year.
    delete grounded.within;
  }
  if (says(digits, RANKING_WORDS)) grounded.sort = raw.sort === true;
  if (typeof raw.k === "string") grounded.k = raw.k;
  return grounded;
}

// A client of the names list (ProjectCardClient): its code as written on
// cards, plus Thai names and abbreviations.
export type Client = { code: string; names: string[] };

// Its code and names, and each abbreviation also without its dot: people
// type "กสทช" as often as "กสทช.", and the dotless one must still beat CAT's
// "กสท" inside it.
const clientNames = (c: Client) =>
  [c.code, ...c.names].flatMap((name) => (name.length > 2 && name.endsWith(".") ? [name, name.slice(0, -1)] : [name]));

// The client a question names by code or name. When several do, the longest
// name wins: "กสทช." is NBTC, not the "กสท" (CAT) written inside it.
function clientNamedIn(clients: readonly Client[], text: string): string | undefined {
  let best: { code: string; length: number } | undefined;
  for (const client of clients) {
    for (const name of clientNames(client)) {
      if (namedIn(text, name) && name.length > (best?.length ?? 0)) best = { code: client.code, length: name.length };
    }
  }
  return best?.code;
}

// Every name of a Category, Work Type or client.
const filterNames = (taxonomy: Taxonomy, clients: readonly Client[]) => [
  ...[...taxonomy.categories, ...taxonomy.workTypes].flatMap(termNames),
  ...clients.flatMap(clientNames),
];

// `text` with each of `words` cut out, longest first, so a name is cut whole
// before a shorter one inside it.
const cutAll = (text: string, words: string[], mark: string) =>
  [...words].sort((a, b) => b.length - a.length).reduce((rest, word) => cutName(rest, word, mark), text);

// Little words around the filters in a question, never what it asks about.
const GLUE = ["ของ", "ที่", "กับ", "และ", "ใน", "มี", "ไหม", "บ้าง", "อะไร", "หา", "ขอ", "ดู", "for", "of", "the", "with", "and", "in", "any"];

// Whether the question says more than filter names, generic and little
// words. Unlike keyword(), Thai written on to a name stays ("กล้องวงจรปิด"
// of "งานกล้องวงจรปิดของ PEA"): the model may find a keyword in it.
const saysMore = (question: string, taxonomy: Taxonomy, clients: readonly Client[]) =>
  /[\p{L}\p{N}]/u.test(cutAll(question, [...filterNames(taxonomy, clients), ...GENERIC, ...GLUE], " "));

const THAI_RUN = /[฀-๿]+/g;
// Left where a name was cut out of the keyword; no one types it.
const CUT = "\u0001";

// The first word of the model's keyword that isn't generic and doesn't repeat
// a filter. The page searches the keyword as one phrase, so "router Cisco"
// would find nothing. Names of Categories, Work Types and clients are cut out
// of each word ("Wi-Fiสพฐ." → "Wi-Fi"); a word that is only part of a
// Category or Work Type name ("Fiber" of "Fiber Optic") goes too. When a name
// was cut out of Thai text, the Thai rest goes with it: Thai has no spaces, so
// it's the rest of that name's phrase ("ออฟติก" of "ไฟเบอร์ออฟติก") or glue
// ("ของ" before a client name) that no card's text would match, and there is
// no telling where a real keyword in it would end.
function keyword(k: string | undefined, taxonomy: Taxonomy, clients: readonly Client[]): string | undefined {
  const termWords = [...taxonomy.categories, ...taxonomy.workTypes].flatMap(termNames);
  const isPartOfTermName = (word: string) => termWords.some((name) => namedIn(name.toLowerCase(), word.toLowerCase()));
  // Names are cut from the whole keyword (some have spaces: "CAT Telecom"),
  // leaving a mark; a word with a mark loses its Thai and splits there.
  const cut = cutAll(k ?? "", filterNames(taxonomy, clients), CUT);
  return cut
    .split(/\s+/)
    .flatMap((word) => (word.includes(CUT) ? word.replace(THAI_RUN, "").split(CUT) : [word]))
    .find((word) => /[\p{L}\p{N}]/u.test(word) && !GENERIC.includes(word.toLowerCase()) && !isPartOfTermName(word));
}

// `year` is the current year in Bangkok (ค.ศ.).
export async function translateQuestion(
  question: string,
  taxonomy: Taxonomy,
  clients: readonly Client[],
  year: number,
): Promise<QuestionAnswer> {
  const digits = question.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  // Questions with no number and nothing left over were the slow ones on
  // the server (~9–10 s), and the model has nothing to add to them.
  const askedModel =
    /\d/.test(digits) ||
    says(digits, [...YEAR_WORDS, ...BUDGET_WORDS, ...CERTIFICATE_WORDS, ...RANKING_WORDS]) ||
    saysMore(question, taxonomy, clients);
  let raw: ModelAnswer = {};
  if (askedModel) {
    try {
      const answer = await askInTime(question, year);
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new Error("not a JSON object");
      raw = answer;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { filters: { q: question }, unsupported: false, fellBack: true, reason, askedModel };
    }
  }
  const grounded = ground(digits, raw);
  const filters: Record<string, string> = {};
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined) filters[key] = String(value);
  };

  set("q", keyword(grounded.k, taxonomy, clients));
  set("client", clientNamedIn(clients, question));
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
  return { filters, unsupported: grounded.sort === true, fellBack: false, askedModel };
}

const TIMEOUT_MS = 30_000;

// The model's answer, or a throw once it has taken 30 s. The adapter is told
// to stop then (its fetch aborts); the race keeps the deadline even if it
// didn't listen, so a stuck Ollama never holds the page.
async function askInTime(question: string, year: number): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`no answer within ${TIMEOUT_MS / 1000} s`);
      controller.abort(error);
      reject(error);
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([askModel(question, year, controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
