// Question Search (ถามด้วยประโยค) on ค้นหาโครงการ, ticket 03 of
// .scratch/question-search: an admin's question becomes the page's ordinary
// filters. Driven through the server action against the test DB with the
// session mocked and the model adapter replaced by canned short-key answers
// (inputs from the prototype's question set), so no Ollama is needed.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
// redirect() ends the action by throwing; the thrown error carries the URL.
class Redirect extends Error {
  url: string;
  constructor(url: string) {
    super("NEXT_REDIRECT");
    this.url = url;
  }
}
mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ refresh() {} }), redirect: (url: string) => { throw new Redirect(url); } },
});

// The model adapter: each test sets the answer (or the error) it gives.
// HANG never answers; the adapter is then told to stop through its signal.
const HANG = Symbol("hang");
type Answer = unknown | Error | typeof HANG;
let answer: Answer = {};
let configuredModel: string | null = "qwen3:4b";
const asked: string[] = [];
let hanging: (() => void) | null = null;
mock.module("@/lib/question-search-model", {
  namedExports: {
    questionSearchModel: () => configuredModel,
    askModel: async (question: string, _year: number, signal: AbortSignal) => {
      asked.push(question);
      if (answer instanceof Error) throw answer;
      if (answer === HANG) {
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
          hanging?.();
        });
      }
      return answer;
    },
  },
});

const { askProjectCardQuestion } = await import("@/actions/projectCardQuestion");
const { default: ProjectCardPage } = await import("@/app/(app)/project-card/page");

const NOW = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date()));

// The seeded lists (both migrations), the entries these questions name.
async function seedTerms() {
  const term = (kind: string, value: string, en: string, th: string, synonyms: string[], sortOrder: number) =>
    ({ kind, value, en, th, synonyms, sortOrder });
  await prisma.projectCardTerm.createMany({
    data: [
      term("category", "transmission", "Transmission", "ระบบสื่อสัญญาณ", ["สื่อสัญญาณ", "dwdm", "sdh"], 20),
      term("category", "fiber-optic", "Fiber Optic", "เคเบิลใยแก้วนำแสง", ["fiber", "fibre", "ไฟเบอร์", "ใยแก้ว"], 30),
      term("category", "microwave-radio", "Microwave & Radio", "ไมโครเวฟและวิทยุสื่อสาร", ["microwave", "ไมโครเวฟ", "วิทยุสื่อสาร"], 40),
      term("category", "teleprotection", "Teleprotection", "ระบบป้องกันสายส่ง", ["ป้องกันสายส่ง"], 50),
      term("category", "software", "Software", "ซอฟต์แวร์", ["ซอฟแวร์"], 80),
      term("category", "energy", "Energy", "พลังงาน", ["solar", "โซลาร์"], 110),
      term("category", "satellite-communications", "Satellite Communications", "การสื่อสารผ่านดาวเทียม", ["satellite", "ดาวเทียม"], 150),
      term("workType", "supply", "Supply", "จัดหาอุปกรณ์", ["จัดหา", "จัดซื้อ"], 10),
      term("workType", "installation", "Installation", "ติดตั้ง", ["install"], 20),
      term("workType", "ma", "MA (Maintenance)", "บำรุงรักษา (MA)", ["ma", "maintenance", "บำรุงรักษา", "ซ่อมบำรุง"], 30),
      term("workType", "managed-services", "Managed Services", "บริการบริหารจัดการระบบ", ["managed service", "บริหารจัดการระบบ"], 40),
      term("workType", "system-development", "System Development", "พัฒนาระบบ", [], 60),
    ],
  });
  // Part of the client names list's seed (its migration).
  await prisma.projectCardClient.createMany({
    data: [
      { code: "NT", names: ["บริษัท โทรคมนาคมแห่งชาติ", "โทรคมนาคมแห่งชาติ", "เอ็นที"] },
      { code: "CAT", names: ["กสท โทรคมนาคม", "กสท", "แคท", "CAT Telecom"] },
      { code: "PEA", names: ["การไฟฟ้าส่วนภูมิภาค", "กฟภ."] },
      { code: "MEA", names: ["การไฟฟ้านครหลวง", "กฟน."] },
      { code: "OBEC", names: ["สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน", "สพฐ."] },
      { code: "NBTC", names: ["สำนักงาน กสทช.", "กสทช."] },
      { code: "TRUE", names: ["ทรู", "ทรูมูฟ", "True"] },
    ],
  });
}

async function signIn(role: "ADMIN" | "USER" = "ADMIN") {
  signedIn = await prisma.user.create({
    data: { username: role.toLowerCase(), passwordHash: "x", displayName: "ผู้ถาม", role, appAccess: ["project-card-edit"] },
  });
}

// Asks as the signed-in user; returns the search URL's params it redirected to.
async function ask(question: string, modelAnswer: Answer = {}) {
  answer = modelAnswer;
  const form = new FormData();
  form.set("question", question);
  try {
    await askProjectCardQuestion(form);
  } catch (error) {
    if (!(error instanceof Redirect)) throw error;
    const url = new URL(error.url, "http://localhost");
    assert.equal(url.pathname, "/project-card");
    return Object.fromEntries(url.searchParams);
  }
  assert.fail("the action did not redirect");
}

test("an admin's question becomes the ordinary search: Work Type by code, numbers by the model", { skip }, async () => {
  await signIn();
  await seedTerms();
  const question = "หาว่ามีงานติดตั้งระบบคอม ที่มีมูลค่างบประมาณมากกว่า350ล้าน เมื่อ5ปีที่แล้ว";
  assert.deepEqual(await ask(question, { k: "คอมพิวเตอร์", bmin: 350, ago: 5 }), {
    ask: question, q: "คอมพิวเตอร์", workType: "installation", budgetMin: "350", yearFrom: String(NOW - 5), yearTo: String(NOW - 5),
  });
});

test("Category and Work Type come from names and synonyms in the question", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("งานบำรุงรักษาระบบสื่อสัญญาณ"), { ask: "งานบำรุงรักษาระบบสื่อสัญญาณ", category: "transmission", workType: "ma" });
  assert.deepEqual(await ask("งานไมโครเวฟ งบไม่เกิน 20 ล้าน", { bmax: 20 }), { ask: "งานไมโครเวฟ งบไม่เกิน 20 ล้าน", category: "microwave-radio", budgetMax: "20" });
  // Latin names match whole words only: "MA" names MA, not the "ma" inside "Managed".
  assert.deepEqual(await ask("Managed services projects in the last 5 years", { within: 5 }), {
    ask: "Managed services projects in the last 5 years", workType: "managed-services", yearFrom: String(NOW - 5), yearTo: String(NOW),
  });
});

test("a model value with no supporting word in the question is dropped", { skip }, async () => {
  await signIn();
  await seedTerms();
  // No ปี/year, no budget word, no certificate word: the invented values go.
  assert.deepEqual(await ask("ผลงานดาวเทียม", { yf: 2020, yt: 2020, ago: 3, bmin: 100, cert: 3 }), {
    ask: "ผลงานดาวเทียม", category: "satellite-communications",
  });
  // A year the question doesn't contain is dropped even when it says ปี; so is
  // part of one ("65" of "2565"), and a years-back count that isn't sane.
  assert.deepEqual(await ask("โครงการปี 2563", { yf: 2563, yt: 2564 }), { ask: "โครงการปี 2563", yearFrom: "2020" });
  assert.deepEqual(await ask("โครงการปี 2565", { yf: 65, yt: 2565 }), { ask: "โครงการปี 2565", yearTo: "2022" });
  assert.deepEqual(await ask("โครงการเมื่อ 2565 ปีที่แล้ว", { ago: 2565 }), { ask: "โครงการเมื่อ 2565 ปีที่แล้ว" });
});

test("years in พ.ศ. or Thai digits become ค.ศ.", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("ขอดูโครงการปี ๒๕๖๓", { yf: 2563, yt: 2563 }), { ask: "ขอดูโครงการปี ๒๕๖๓", yearFrom: "2020", yearTo: "2020" });
  assert.deepEqual(await ask("งานพัฒนาระบบซอฟต์แวร์ ตั้งแต่ปี 2020 ถึง 2023", { yf: 2020, yt: 2023 }), {
    ask: "งานพัฒนาระบบซอฟต์แวร์ ตั้งแต่ปี 2020 ถึง 2023", category: "software", workType: "system-development", yearFrom: "2020", yearTo: "2023",
  });
});

test("a certificate age rounds up to the page's next choice and isn't a contract-year range", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("ผลงานติดตั้งที่หนังสือรับรองออกไม่เกิน 4 ปี", { cert: 4, within: 4 }), {
    ask: "ผลงานติดตั้งที่หนังสือรับรองออกไม่เกิน 4 ปี", workType: "installation", certWithin: "5",
  });
  assert.deepEqual(await ask("ผลงาน teleprotection ที่ได้หนังสือรับรองภายใน 3 ปี", { cert: 3 }), {
    ask: "ผลงาน teleprotection ที่ได้หนังสือรับรองภายใน 3 ปี", category: "teleprotection", certWithin: "3",
  });
  // Older than the largest choice (10 years): no filter rather than a wrong one.
  assert.deepEqual(await ask("หนังสือรับรองภายใน 12 ปี", { cert: 12 }), { ask: "หนังสือรับรองภายใน 12 ปี" });
});

test("one keyword word is kept; generic words never become the keyword", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("งาน router Cisco", { k: "router Cisco" }), { ask: "งาน router Cisco", q: "router" });
  assert.deepEqual(await ask("มีงานอะไรบ้าง", { k: "งาน" }), { ask: "มีงานอะไรบ้าง" });
});

test("a client named by code, Thai name or abbreviation sets the Client filter; the longest name wins", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("ผลงานของ กฟภ."), { ask: "ผลงานของ กฟภ.", client: "PEA" });
  assert.deepEqual(await ask("งานของการไฟฟ้านครหลวง"), { ask: "งานของการไฟฟ้านครหลวง", client: "MEA" });
  assert.deepEqual(await ask("projects for True"), { ask: "projects for True", client: "TRUE" });
  assert.deepEqual(await ask("งาน nt"), { ask: "งาน nt", client: "NT" });
  // "กสทช." (NBTC) contains CAT's "กสท"; the longer name wins.
  assert.deepEqual(await ask("โครงการของ กสทช."), { ask: "โครงการของ กสทช.", client: "NBTC" });
  // An abbreviation is also understood without its dot, and still wins.
  assert.deepEqual(await ask("โครงการของ กสทช"), { ask: "โครงการของ กสทช", client: "NBTC" });
  assert.deepEqual(await ask("งาน กฟภ"), { ask: "งาน กฟภ", client: "PEA" });
  // A Latin code matches whole words only: "NT" isn't inside "NTP".
  assert.deepEqual(await ask("งาน NTP server", { k: "NTP" }), { ask: "งาน NTP server", q: "NTP" });
});

test("a client added in Admin Center is understood in the next question", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("งานของ กทพ."), { ask: "งานของ กทพ." });
  await prisma.projectCardClient.create({ data: { code: "EXAT", names: ["การทางพิเศษแห่งประเทศไทย", "กทพ."] } });
  assert.deepEqual(await ask("งานของ กทพ."), { ask: "งานของ กทพ.", client: "EXAT" });
});

test("the keyword never repeats a filter: Category, Work Type and client names are cut out of it", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("งาน Wi-Fi สพฐ.", { k: "Wi-Fi สพฐ." }), { ask: "งาน Wi-Fi สพฐ.", q: "Wi-Fi", client: "OBEC" });
  assert.deepEqual(await ask("โครงการ solar rooftop", { k: "solar rooftop" }), { ask: "โครงการ solar rooftop", q: "rooftop", category: "energy" });
  assert.deepEqual(await ask("งาน CAT Telecom", { k: "CAT Telecom" }), { ask: "งาน CAT Telecom", client: "CAT" });
  // A name written twice in a row is cut both times.
  assert.deepEqual(await ask("งาน NT NT OLT", { k: "NT NT OLT" }), { ask: "งาน NT NT OLT", q: "OLT", client: "NT" });
  // A name cut out of Thai text takes the Thai rest with it ("ออฟติก" of "ไฟเบอร์ออฟติก").
  const question = "โครงการไฟเบอร์ออฟติกของการไฟฟ้านครหลวง";
  const expected = { ask: question, category: "fiber-optic", client: "MEA" };
  assert.deepEqual(await ask(question, { k: "ไฟเบอร์ออฟติก" }), expected);
  assert.deepEqual(await ask(question, { k: "ไฟเบอร์ออฟติกของการไฟฟ้านครหลวง" }), expected);
  // Little words stuck to the keyword go; so does a piece of the client name
  // the question used (evaluation misses #4 and #110, 2026-10-29).
  assert.deepEqual(await ask("มีงานกล้องกับ NT บ้างไหม", { k: "กล้องกับ" }), { ask: "มีงานกล้องกับ NT บ้างไหม", q: "กล้อง", client: "NT" });
  assert.deepEqual(await ask("งานใหญ่สุดของการไฟฟ้านครหลวงคืองานอะไร", { k: "ไฟฟ้า", sort: true }), {
    ask: "งานใหญ่สุดของการไฟฟ้านครหลวงคืองานอะไร", client: "MEA", note: "unsupported",
  });
  // …but only of a client the question named.
  assert.deepEqual(await ask("งานระบบไฟฟ้า ปี 2565", { k: "ไฟฟ้า", yf: 2565, yt: 2565 }), {
    ask: "งานระบบไฟฟ้า ปี 2565", q: "ไฟฟ้า", yearFrom: "2022", yearTo: "2022",
  });
  // A Latin keyword glued to a Thai client name keeps the Latin part.
  assert.deepEqual(await ask("งาน OLTของกฟภ.", { k: "OLTของกฟภ." }), { ask: "งาน OLTของกฟภ.", q: "OLT", client: "PEA" });
});

test("each question writes one Activity log row with the filters, the model and the time", { skip }, async () => {
  await signIn();
  await seedTerms();
  await ask("งานไมโครเวฟ งบไม่เกิน 20 ล้าน", { bmax: 20 });
  const rows = await prisma.auditLog.findMany({ where: { action: "project-card.question-search" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorId, signedIn!.id);
  assert.equal(rows[0].summary, "งานไมโครเวฟ งบไม่เกิน 20 ล้าน");
  const metadata = rows[0].metadata as Record<string, unknown>;
  assert.deepEqual(metadata.filters, { category: "microwave-radio", budgetMax: "20" });
  assert.equal(metadata.model, "qwen3:4b");
  assert.equal(metadata.fellBack, false);
  assert.equal(typeof metadata.ms, "number");
});

test("when the model fails the question is searched as a keyword, never an error page", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("งาน OLT", new Error("connect ECONNREFUSED")), { ask: "งาน OLT", q: "งาน OLT", note: "fallback" });
  const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "project-card.question-search" } });
  const metadata = row.metadata as Record<string, unknown>;
  assert.equal(metadata.fellBack, true);
  assert.equal(metadata.reason, "connect ECONNREFUSED");
});

test("an answer that isn't an object of fields falls back too", { skip }, async () => {
  await signIn();
  await seedTerms();
  for (const garbage of [null, "router", [{ k: "router" }], 42]) {
    assert.deepEqual(await ask("งาน router", garbage), { ask: "งาน router", q: "งาน router", note: "fallback" }, JSON.stringify(garbage));
  }
});

test("a model that doesn't answer within 30 s is stopped and the question falls back", { skip }, async () => {
  await signIn();
  await seedTerms();
  const called = new Promise<void>((resolve) => (hanging = resolve));
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const result = ask("งาน OLT", HANG);
    await called;
    mock.timers.tick(29_999);
    let settled = false;
    void result.finally(() => (settled = true));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, "still waiting before 30 s");
    mock.timers.tick(1);
    assert.deepEqual(await result, { ask: "งาน OLT", q: "งาน OLT", note: "fallback" });
  } finally {
    mock.timers.reset();
    hanging = null;
  }
  const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "project-card.question-search" } });
  assert.match(String((row.metadata as Record<string, unknown>).reason), /30/);
});

test("a ranking, total or count gets its filter part and a note; the model's sort needs such a word", { skip }, async () => {
  await signIn();
  await seedTerms();
  assert.deepEqual(await ask("5 อันดับที่งบสูงสุดของ PEA", { sort: true }), { ask: "5 อันดับที่งบสูงสุดของ PEA", client: "PEA", note: "unsupported" });
  assert.deepEqual(await ask("รวมมูลค่างานไมโครเวฟ", { sort: true }), { ask: "รวมมูลค่างานไมโครเวฟ", category: "microwave-radio", note: "unsupported" });
  assert.deepEqual(await ask("how many satellite projects", { sort: true }), { ask: "how many satellite projects", category: "satellite-communications", note: "unsupported" });
  assert.deepEqual(await ask("PEA มีกี่สัญญา", { sort: true }), { ask: "PEA มีกี่สัญญา", client: "PEA", note: "unsupported" });
  // No ranking word: the model's sort is invented.
  assert.deepEqual(await ask("งาน OLT ปี 2565", { k: "OLT", yf: 2565, yt: 2565, sort: true }), { ask: "งาน OLT ปี 2565", q: "OLT", yearFrom: "2022", yearTo: "2022" });
  const rows = await prisma.auditLog.findMany({ where: { action: "project-card.question-search" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(rows.map((r) => (r.metadata as Record<string, unknown>).unsupported), [true, true, true, true, false]);
});

test("the model isn't asked when it can't add anything", { skip }, async () => {
  await signIn();
  await seedTerms();
  await prisma.projectCardClient.create({ data: { code: "CMU", names: ["มหาวิทยาลัยเชียงใหม่", "มช."] } });
  asked.length = 0;
  // Only filter names and generic words: code alone answers these.
  assert.deepEqual(await ask("ผลงานดาวเทียม", new Error("must not be asked")), { ask: "ผลงานดาวเทียม", category: "satellite-communications" });
  assert.deepEqual(await ask("โครงการของมหาวิทยาลัยเชียงใหม่", new Error("must not be asked")), { ask: "โครงการของมหาวิทยาลัยเชียงใหม่", client: "CMU" });
  assert.deepEqual(await ask("งานบำรุงรักษาระบบสื่อสัญญาณ", new Error("must not be asked")), {
    ask: "งานบำรุงรักษาระบบสื่อสัญญาณ", category: "transmission", workType: "ma",
  });
  assert.deepEqual(asked, []);
  const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "project-card.question-search" } });
  assert.equal((row.metadata as Record<string, unknown>).askedModel, false);
  // A number, a time/budget/certificate/ranking word or a word left over: asked.
  await ask("ผลงานดาวเทียม 5 ปี", { within: 5 });
  await ask("ผลงานดาวเทียมที่แพงที่สุด", { sort: true });
  await ask("ผลงาน OLT ของ มช.", { k: "OLT" });
  // Thai written straight on to a client name is still a word to look for.
  assert.deepEqual(await ask("งานกล้องวงจรปิดของ PEA", { k: "กล้องวงจรปิด" }), { ask: "งานกล้องวงจรปิดของ PEA", q: "กล้องวงจรปิด", client: "PEA" });
  assert.deepEqual(asked, ["ผลงานดาวเทียม 5 ปี", "ผลงานดาวเทียมที่แพงที่สุด", "ผลงาน OLT ของ มช.", "งานกล้องวงจรปิดของ PEA"]);
});

test("only an admin may ask, and only while the model is configured", { skip }, async () => {
  await seedTerms();
  await signIn("USER");
  await assert.rejects(ask("งาน OLT"), /FORBIDDEN/);
  signedIn = null;
  await signIn();
  configuredModel = null;
  try {
    await assert.rejects(ask("งาน OLT"), /FORBIDDEN/);
  } finally {
    configuredModel = "qwen3:4b";
  }
  assert.equal(await prisma.auditLog.count(), 0);
});

async function pageHtml(searchParams: Record<string, string>) {
  return renderToStaticMarkup(await ProjectCardPage({ searchParams: Promise.resolve(searchParams) }));
}

test("the page offers ถามด้วยประโยค to admins only, while the model is configured", { skip }, async () => {
  await signIn();
  assert.match(await pageHtml({}), /ถามด้วยประโยค/);
  configuredModel = null;
  try {
    assert.doesNotMatch(await pageHtml({}), /ถามด้วยประโยค/);
  } finally {
    configuredModel = "qwen3:4b";
  }
  await prisma.user.update({ where: { id: signedIn!.id }, data: { role: "USER" } });
  signedIn = await prisma.user.findUniqueOrThrow({ where: { id: signedIn!.id } });
  assert.doesNotMatch(await pageHtml({ ask: "งาน OLT" }), /ถามด้วยประโยค|คำถาม:/);
});

test("the asked question is shown above the chips and can be edited and asked again", { skip }, async () => {
  await signIn();
  await seedTerms();
  asked.length = 0;
  const html = await pageHtml({ ask: "งานไมโครเวฟ งบไม่เกิน 20 ล้าน", category: "microwave-radio", budgetMax: "20" });
  assert.match(html, /คำถาม:/);
  assert.match(html, /<input[^>]*name="question"[^>]*value="งานไมโครเวฟ งบไม่เกิน 20 ล้าน"/);
  assert.match(html, /หมวดหมู่: Microwave &amp; Radio/);
  assert.ok(html.indexOf("คำถาม:") < html.indexOf("หมวดหมู่: Microwave"));
  assert.equal(asked.length, 0, "rendering the page never calls the model");
});

test("the page shows the question's note: rankings aren't done, or the question wasn't understood", { skip }, async () => {
  await signIn();
  await seedTerms();
  const unsupported = await pageHtml({ ask: "5 อันดับที่งบสูงสุดของ PEA", client: "PEA", note: "unsupported" });
  assert.match(unsupported, /ไม่จัดอันดับ/);
  assert.match(unsupported, /หัวตาราง/);
  const fallback = await pageHtml({ ask: "งาน OLT", q: "งาน OLT", note: "fallback" });
  assert.match(fallback, /แปลคำถามไม่สำเร็จ/);
  assert.doesNotMatch(await pageHtml({ ask: "งาน OLT", q: "OLT" }), /ไม่จัดอันดับ|แปลคำถามไม่สำเร็จ/);
  // A note without a question (a hand-made URL) shows nothing.
  assert.doesNotMatch(await pageHtml({ note: "fallback" }), /แปลคำถามไม่สำเร็จ/);
});
