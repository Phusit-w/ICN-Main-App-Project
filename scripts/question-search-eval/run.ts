// Question Search's evaluation (.scratch/question-search ticket 06): runs a
// question file through the real Question Translator — the same code the
// ถามด้วยประโยค action calls, with the Categories, Work Types and client
// names read from this app's database — against a real Ollama, and prints
// % exact and the time per question. Not part of `npm test`; accuracy is
// measured here, on the server, not in unit tests.
//
//   node --env-file=.env --import ./scripts/question-search-eval/register.mjs scripts/question-search-eval/run.ts
//   … run.ts questions-holdout.json        another file in this folder (or a path)
//   … run.ts questions.json 3              question 3 only
//
// Env: QUESTION_SEARCH_OLLAMA_URL (default http://127.0.0.1:11434),
// QUESTION_SEARCH_MODEL (default qwen3:4b), DATABASE_URL (from .env; only
// read). Question file: { asOfYear, questions: [{ id, text, expect | expectAny }] }
// where an expectation is the search URL's filters (numbers may be written as
// numbers) plus `unsupported: true` when a note about ranking/totals is due.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.QUESTION_SEARCH_OLLAMA_URL ||= "http://127.0.0.1:11434";
const { translateQuestion } = await import("@/lib/question-search");
const { questionSearchModel } = await import("@/lib/question-search-model");
const { loadTaxonomy } = await import("@/lib/project-card-terms");
const { prisma } = await import("@/lib/prisma");

type Expectation = Record<string, string | number | boolean>;
type Question = { id: number; text: string; expect?: Expectation; expectAny?: Expectation[] };

const here = fileURLToPath(new URL(".", import.meta.url));
const file = process.argv[2] ?? "questions.json";
const onlyId = process.argv[3] ? Number(process.argv[3]) : undefined;
const { asOfYear, questions } = JSON.parse(readFileSync(resolve(here, file), "utf8")) as {
  asOfYear: number;
  questions: Question[];
};

// One comparable form of an answer: filters as text, keyword in lower case,
// plus the unsupported flag only when set.
const norm = (filters: Expectation) =>
  JSON.stringify(
    Object.entries(filters)
      .filter(([key, value]) => !(key === "unsupported" && value !== true))
      .map(([key, value]) => [key, key === "q" ? String(value).toLowerCase() : String(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const taxonomy = await loadTaxonomy();
const clients = await prisma.projectCardClient.findMany({ select: { code: true, names: true } });
console.log(`model ${questionSearchModel()} at ${process.env.QUESTION_SEARCH_OLLAMA_URL}; ${file}, as of ${asOfYear}`);
console.log(`lists: ${taxonomy.categories.length} Categories, ${taxonomy.workTypes.length} Work Types, ${clients.length} clients\n`);

console.log("warm-up (loads the model and caches the fixed prompt; not scored)…");
const warmStart = Date.now();
await translateQuestion("ทดสอบ 1 ปี", taxonomy, clients, asOfYear);
console.log(`  ${((Date.now() - warmStart) / 1000).toFixed(1)} s\n`);

const results: { pass: boolean; seconds: number; askedModel: boolean; fellBack: boolean }[] = [];
for (const q of questions.filter((q) => onlyId === undefined || q.id === onlyId)) {
  const started = Date.now();
  const answer = await translateQuestion(q.text, taxonomy, clients, asOfYear);
  const seconds = (Date.now() - started) / 1000;
  const got = { ...answer.filters, ...(answer.unsupported ? { unsupported: true } : {}) };
  const expected = q.expectAny ?? (q.expect ? [q.expect] : []);
  const pass = !answer.fellBack && expected.some((e) => norm(e) === norm(got));
  results.push({ pass, seconds, askedModel: answer.askedModel, fellBack: answer.fellBack });
  const how = answer.fellBack ? `fell back: ${answer.reason}` : answer.askedModel ? "" : "no model";
  console.log(`#${q.id} ${pass ? "PASS" : "FAIL"} ${seconds.toFixed(1)}s ${how}  ${q.text}`);
  console.log(`    got    ${JSON.stringify(got)}`);
  if (!pass) console.log(`    expect ${JSON.stringify(q.expectAny ?? q.expect)}`);
}

const secs = results.map((r) => r.seconds).sort((a, b) => a - b);
const at = (p: number) => secs[Math.min(secs.length - 1, Math.floor(p * secs.length))]?.toFixed(1);
const passed = results.filter((r) => r.pass).length;
console.log(
  `\n${passed}/${results.length} exact (${Math.round((100 * passed) / results.length)}%); ` +
    `time p50 ${at(0.5)} s, p90 ${at(0.9)} s, max ${secs.at(-1)?.toFixed(1)} s; ` +
    `${results.filter((r) => !r.askedModel).length} without the model, ${results.filter((r) => r.fellBack).length} fell back`,
);
console.log("gate to open Question Search to everyone: >= 90% exact on logged real questions, <= 15 s each");
await prisma.$disconnect();
