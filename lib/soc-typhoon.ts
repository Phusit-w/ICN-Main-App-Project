import type { CellReader } from "@/lib/soc-pdf-soc";

// The Typhoon OCR API as the scanned-PDF cell reader (ADR 0010): one cell image
// per call, at most `callsPerMinute` calls in any 60 seconds for the whole
// process (the limit is per key and the key is shared), rate limits and
// outages retried. Typhoon documents 20 per minute but measured 2026-10-16 it
// accepted about 32, so the default is 30 and TYPHOON_CALLS_PER_MINUTE sets it.

const ENDPOINT = "https://api.opentyphoon.ai/v1/chat/completions";
const MODEL = "typhoon-ocr";
export const DEFAULT_CALLS_PER_MINUTE = 30;
const MAX_CALLS_PER_MINUTE = 120; // above the documented 2 calls per second makes no sense
const WINDOW_MS = 60_000;
const ATTEMPTS = 6;
const RETRY_DELAY_MS = 5_000; // grows with each attempt unless the answer says Retry-After
const REQUEST_TIMEOUT_MS = 120_000;

// Typhoon's own v1.5 prompt (typhoon-ocr 0.4.1).
const PROMPT = `Extract all text from the image.


Instructions:
- Only return the clean Markdown.
- Do not include any explanation or extra text.
- You must include all information on the page.


Formatting Rules:
- Tables: Render tables using <table>...</table> in clean HTML format.
- Equations: Render equations using LaTeX syntax with inline ($...$) and block ($$...$$).
- Images/Charts/Diagrams: Wrap any clearly defined visual areas (e.g. charts, diagrams, pictures) in:


<figure>
Describe the image's main elements (people, objects, text), note any contextual clues (place, event, culture), mention visible text and its meaning, provide deeper analysis when relevant (especially for financial charts, graphs, or documents), comment on style or architecture if relevant, then give a concise overall summary. Describe in Thai.
</figure>


- Page Numbers: Wrap page numbers in <page_number>...</page_number> (e.g., <page_number>14</page_number>).
- Checkboxes: Use ☐ for unchecked and ☑ for checked boxes.
    `;

export const OCR_NOT_SET_UP = "ยังไม่ได้ตั้งค่าบริการ OCR (TYPHOON_API_KEY) กรุณาแจ้งผู้ดูแลระบบ";

export class OcrNotSetUpError extends Error {
  constructor() {
    super(OCR_NOT_SET_UP);
    this.name = "OcrNotSetUpError";
  }
}

// A call that cannot succeed (a refused key, a bad request) or that kept failing.
export class TyphoonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TyphoonError";
  }
}

// The pace from the setting: a whole number from 1 to 120, else the default.
export function parseCallsPerMinute(value: string | undefined): number {
  const n = Number(value?.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_CALLS_PER_MINUTE ? n : DEFAULT_CALLS_PER_MINUTE;
}

type Options = {
  apiKey?: string;
  callsPerMinute?: number;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createTyphoonReader({ apiKey, callsPerMinute = DEFAULT_CALLS_PER_MINUTE, fetch: send = fetch, now = Date.now, sleep = (ms) => new Promise((done) => setTimeout(done, ms)) }: Options): CellReader {
  const sent: number[] = []; // when the calls in the last window went out

  // Waits until a call fits in the window, then takes its place. Concurrent
  // callers wake and check again, so the window is never overfull.
  async function takeTurn() {
    for (;;) {
      const t = now();
      while (sent.length && sent[0] <= t - WINDOW_MS) sent.shift();
      if (sent.length < callsPerMinute) {
        sent.push(t);
        return;
      }
      await sleep(sent[0] + WINDOW_MS - t);
    }
  }

  return async (image) => {
    if (!apiKey) throw new OcrNotSetUpError();
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.1,
      top_p: 0.6,
      repetition_penalty: 1.1,
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(image).toString("base64")}` } },
      ] }],
    });
    let failure = "";
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      await takeTurn();
      let wait = RETRY_DELAY_MS * attempt;
      try {
        const answer = await send(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (answer.ok) {
          const content = ((await answer.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
          if (typeof content === "string") return cleanCell(content);
          failure = "Typhoon OCR ตอบกลับในรูปแบบที่ไม่คาดหมาย";
        } else if (answer.status === 429 || answer.status === 408 || answer.status >= 500) {
          failure = `Typhoon OCR ตอบ HTTP ${answer.status}`;
          const after = Number(answer.headers.get("retry-after"));
          if (after > 0) wait = after * 1000;
        } else {
          throw new TyphoonError(`Typhoon OCR ปฏิเสธคำขอ (HTTP ${answer.status})`);
        }
      } catch (error) {
        if (error instanceof TyphoonError) throw error;
        failure = "เชื่อมต่อ Typhoon OCR ไม่ได้";
      }
      if (attempt < ATTEMPTS) await sleep(wait);
    }
    throw new TyphoonError(`${failure} (ลองแล้ว ${ATTEMPTS} ครั้ง)`);
  };
}

// The reader used by the server: the key and the pace are read from the
// environment on each call, and every caller shares one rate window.
let shared: { key: string; pace: number; read: CellReader } | undefined;
export const typhoonCellReader: CellReader = (image, at) => {
  const key = process.env.TYPHOON_API_KEY?.trim() ?? "";
  const pace = parseCallsPerMinute(process.env.TYPHOON_CALLS_PER_MINUTE);
  if (!shared || shared.key !== key || shared.pace !== pace) shared = { key, pace, read: createTyphoonReader({ apiKey: key, callsPerMinute: pace }) };
  return shared.read(image, at);
};

export const typhoonConfigured = () => Boolean(process.env.TYPHOON_API_KEY?.trim());

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

// What Typhoon sent back, as plain cell text: no figure descriptions, no lone
// "---", a table as "a | b" lines. null when the cell held only a figure.
export function cleanCell(answer: string): string | null {
  const text = answer
    .replace(/<figure>[\s\S]*?<\/figure>/gi, "")
    .replace(/<page_number>[\s\S]*?<\/page_number>/gi, "")
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, " | ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^-{3,}$/.test(line))
    .join("\n");
  if (!text && /<figure>/i.test(answer)) return null;
  return text;
}
