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
let answer: Record<string, unknown> | Error = {};
let configuredModel: string | null = "qwen3:4b";
const asked: string[] = [];
mock.module("@/lib/question-search-model", {
  namedExports: {
    questionSearchModel: () => configuredModel,
    askModel: async (question: string) => {
      asked.push(question);
      if (answer instanceof Error) throw answer;
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
      term("category", "satellite-communications", "Satellite Communications", "การสื่อสารผ่านดาวเทียม", ["satellite", "ดาวเทียม"], 150),
      term("workType", "supply", "Supply", "จัดหาอุปกรณ์", ["จัดหา", "จัดซื้อ"], 10),
      term("workType", "installation", "Installation", "ติดตั้ง", ["install"], 20),
      term("workType", "ma", "MA (Maintenance)", "บำรุงรักษา (MA)", ["ma", "maintenance", "บำรุงรักษา", "ซ่อมบำรุง"], 30),
      term("workType", "managed-services", "Managed Services", "บริการบริหารจัดการระบบ", ["managed service", "บริหารจัดการระบบ"], 40),
      term("workType", "system-development", "System Development", "พัฒนาระบบ", [], 60),
    ],
  });
}

async function signIn(role: "ADMIN" | "USER" = "ADMIN") {
  signedIn = await prisma.user.create({
    data: { username: role.toLowerCase(), passwordHash: "x", displayName: "ผู้ถาม", role, appAccess: ["project-card-edit"] },
  });
}

// Asks as the signed-in user; returns the search URL's params it redirected to.
async function ask(question: string, modelAnswer: Record<string, unknown> | Error = {}) {
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
  assert.deepEqual(await ask("งาน OLT", new Error("connect ECONNREFUSED")), { ask: "งาน OLT", q: "งาน OLT" });
  const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "project-card.question-search" } });
  assert.equal((row.metadata as Record<string, unknown>).fellBack, true);
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
