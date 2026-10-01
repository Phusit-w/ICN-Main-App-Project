// Scripted check of the Project Card ingest API's rules — the agreed test
// seam for the Description/Category work (.scratch/project-card-description/
// spec.md, "Testing Decisions"). Runs against a local dev server and its
// database, using throw-away cards whose Project Code starts with ZZTEST
// (deleted before and after). Never point this at production.
//
//   npm run dev            (in another terminal)
//   node --env-file=.env scripts/check-project-card-ingest.mjs
import pg from "pg";

const BASE_URL = process.env.INGEST_CHECK_BASE_URL ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`Refusing to run against ${BASE_URL}: local dev server only.`);
  process.exit(2);
}
const URL = `${BASE_URL}/api/project-card/ingest`;
const KEY = process.env.PROJECT_CARD_INGEST_KEY;
const PREFIX = "ZZTEST";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  — ${detail}`}`);
  if (!ok) failures++;
}

function card(code, extra = {}) {
  return {
    projectCode: `${PREFIX}${code}`,
    client: "TEST",
    projectName: `Ingest check ${code}`,
    contractPath: `\\\\test\\${code}.pdf`,
    ...extra,
  };
}

async function push(...projects) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ projects }),
  });
  if (!res.ok) throw new Error(`POST ${res.status}: ${await res.text()}`);
  return res.json();
}

async function stored(code) {
  const { rows } = await db.query(
    'select category, tags, "classificationEditedByPerson" as edited from "ProjectCard" where "projectCode" = $1',
    [`${PREFIX}${code}`],
  );
  return rows[0];
}

const cleanup = () => db.query(`delete from "ProjectCard" where "projectCode" like '${PREFIX}%'`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  await cleanup();

  // --- Category / Tags validation (ticket 01) ---
  let r = await push(
    card("BAD1", { category: "bogus" }),
    card("BAD2", { category: "fiber-optic", tags: ["fiber-optic"] }),
    card("BAD3", { tags: ["energy", "energy"] }),
    card("BAD4", { tags: "energy" }),
    card("OK1", { category: "fiber-optic", tags: ["ip-network"] }),
  );
  check("unknown category, tag = category, repeated tag, non-array tags are each rejected", r.rejected === 4, JSON.stringify(r.errors));
  check("a valid record in the same request is still saved", r.created === 1);
  check("created card stores Category and Tags", same(await stored("OK1"), { category: "fiber-optic", tags: ["ip-network"], edited: false }));

  // --- Preserve-if-blank ---
  await push(card("OK1"));
  check("absent Category/Tags never erase stored values", same(await stored("OK1"), { category: "fiber-optic", tags: ["ip-network"], edited: false }));

  // --- Replace when non-blank ---
  await push(card("OK1", { category: "transmission", tags: ["fiber-optic"] }));
  check("non-blank Category/Tags replace stored values", same(await stored("OK1"), { category: "transmission", tags: ["fiber-optic"], edited: false }));

  // --- Tags only: a Tag equal to the preserved Category is dropped ---
  await push(card("OK1", { tags: ["transmission", "energy"] }));
  check("tags-only push drops a Tag equal to the preserved Category", same(await stored("OK1"), { category: "transmission", tags: ["energy"], edited: false }));

  // --- Person-edited classification is never overwritten ---
  await db.query(
    `update "ProjectCard" set category = 'medical', tags = '{}', "classificationEditedByPerson" = true where "projectCode" = $1`,
    [`${PREFIX}OK1`],
  );
  r = await push(card("OK1", { category: "energy", tags: ["software"] }));
  check("push skips a person-edited classification", same(await stored("OK1"), { category: "medical", tags: [], edited: true }));
  check("response counts the skipped classification", r.skippedPersonClassification === 1, JSON.stringify(r));
  r = await push(card("OK1"));
  check("a push without classification isn't counted as skipped", r.skippedPersonClassification === 0, JSON.stringify(r));
} finally {
  await cleanup();
  await db.end();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
