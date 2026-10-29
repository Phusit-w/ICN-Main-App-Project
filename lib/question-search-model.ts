// Question Search's model adapter (app/(app)/project-card/CONTEXT.md's
// Question Search entry): sends one question to the local Ollama on the prod
// server and returns its short-key answer. The only code that knows about
// Ollama, and the mock point in tests. The model only reads numbers, time and
// one keyword out of the question; lib/question-search.ts decides what any of
// it means. Server-only. Settings and prompt from the prototype on branch
// prototype/question-search (scripts/prototype-question-search/README.md).

// The model's answer: only the fields the question mentions.
export type ModelAnswer = {
  k?: string; // ONE product/brand/system name
  ago?: number; // "เมื่อ N ปีที่แล้ว" → one year
  within?: number; // "ย้อนหลัง/ภายใน N ปี" → N years up to now
  yf?: number; // years as written (พ.ศ. or ค.ศ.)
  yt?: number;
  bmin?: number; // millions of baht
  bmax?: number;
  cert?: number; // certificate issued within N years
  sort?: boolean; // ranking / top N / total / count
};

const SCHEMA = {
  type: "object",
  properties: {
    k: { type: "string" },
    ago: { type: "integer" },
    within: { type: "integer" },
    yf: { type: "integer" },
    yt: { type: "integer" },
    bmin: { type: "number" },
    bmax: { type: "number" },
    cert: { type: "integer" },
    sort: { type: "boolean" },
  },
  additionalProperties: false,
};

const TIMEOUT_MS = 30_000;

// The model, or null when Question Search isn't set up on this server
// (QUESTION_SEARCH_OLLAMA_URL unset) — the mode is then hidden.
export function questionSearchModel(): string | null {
  if (!process.env.QUESTION_SEARCH_OLLAMA_URL) return null;
  return process.env.QUESTION_SEARCH_MODEL || "qwen3:4b";
}

// Fixed text first and the question last, so Ollama reuses its cached prompt
// prefix (prototype round 3: ~20 s → ~1 s to read the prompt). Short keys and
// "only the fields the question mentions" keep the answer to ~35 tokens.
function instructions(year: number) {
  return `You turn a question about ICN's past projects into search filters.
Reply with compact JSON on ONE line. Include ONLY the fields the question mentions — never write 0, false or "".
Today's year is ${year} (ค.ศ.). พ.ศ. = ค.ศ. + 543.

Fields:
- k: ONE short product, brand or system name the question asks about, such as "CCTV", "OLT", "คอมพิวเตอร์", "billing". Leave out generic words (งาน, โครงการ, ระบบ, ผลงาน), organizations, and types of work (ติดตั้ง, MA, เช่า, จัดหา).
- ago: N for "เมื่อ N ปีที่แล้ว", "N ปีก่อน"; "ปีที่แล้ว" = 1. One single year.
- within: N for "ย้อนหลัง N ปี", "ภายใน N ปี", "in the last N years" — a range up to now. Not about certificates.
- yf / yt: from / to years written as numbers, copied exactly as written (พ.ศ. or ค.ศ.). One year → both the same.
- bmin / bmax: budget in millions of baht. "350 ล้าน" = 350, "พันล้าน" / "1 billion" = 1000. เกิน / มากกว่า / ขึ้นไป / over → bmin; ไม่เกิน / น้อยกว่า / under → bmax.
- cert: N only when the question is about the work certificate (หนังสือรับรอง) being issued within N years.
- sort: true when the question asks for a ranking, top N, highest/lowest/biggest, a sum, a total or a count.

Examples:
"งานติดตั้งของ กฟผ. ปี 2565" → {"yf":2565,"yt":2565}
"fiber optic ย้อนหลัง 2 ปี งบเกิน 10 ล้าน" → {"within":2,"bmin":10}
"งานที่มากกว่าพันล้าน เมื่อ 3 ปีก่อน" → {"bmin":1000,"ago":3}
"มีงาน router ที่หนังสือรับรองออกภายใน 1 ปีไหม" → {"k":"router","cert":1}
"โครงการไหนของ ทีโอที แพงที่สุด" → {"sort":true}
"งาน MA ของ PEA" → {}`;
}

// Throws when Ollama is unreachable, slower than 30 s, or answers something
// that isn't a JSON object.
export async function askModel(question: string, year: number): Promise<ModelAnswer> {
  const url = process.env.QUESTION_SEARCH_OLLAMA_URL;
  const model = questionSearchModel();
  if (!url || !model) throw new Error("Question Search is not configured");
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      stream: false,
      // qwen3's reasoning mode would cost minutes on the server's CPU.
      think: false,
      // Kept loaded: a reload costs 6–30 s per question.
      keep_alive: -1,
      format: SCHEMA,
      // 6 of the server's 8 cores, so the other apps stay responsive.
      options: { temperature: 0, num_ctx: 4096, num_thread: 6 },
      messages: [
        { role: "system", content: instructions(year) },
        { role: "user", content: question },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const body = (await response.json()) as { message?: { content?: string } };
  const parsed: unknown = JSON.parse(body.message?.content ?? "");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not a JSON object");
  return parsed as ModelAnswer;
}
