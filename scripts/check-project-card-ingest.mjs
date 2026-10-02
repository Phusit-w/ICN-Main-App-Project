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
    'select category, tags, "workTypes", "classificationEditedByPerson" as edited from "ProjectCard" where "projectCode" = $1',
    [`${PREFIX}${code}`],
  );
  return rows[0];
}

// Throw-away list entries use the same prefix (lower-case, as list values are).
const TERM_PREFIX = PREFIX.toLowerCase();
const cleanup = async () => {
  await db.query(`delete from "ProjectCard" where "projectCode" like '${PREFIX}%'`);
  await db.query(`delete from "ProjectCardTerm" where value like '${TERM_PREFIX}%'`);
};
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
  check("created card stores Category and Tags", same(await stored("OK1"), { category: "fiber-optic", tags: ["ip-network"], workTypes: [], edited: false }));

  // --- Preserve-if-blank ---
  await push(card("OK1"));
  check("absent Category/Tags never erase stored values", same(await stored("OK1"), { category: "fiber-optic", tags: ["ip-network"], workTypes: [], edited: false }));

  // --- Replace when non-blank ---
  await push(card("OK1", { category: "transmission", tags: ["fiber-optic"] }));
  check("non-blank Category/Tags replace stored values", same(await stored("OK1"), { category: "transmission", tags: ["fiber-optic"], workTypes: [], edited: false }));

  // --- Tags only: a Tag equal to the preserved Category is dropped ---
  await push(card("OK1", { tags: ["transmission", "energy"] }));
  check("tags-only push drops a Tag equal to the preserved Category", same(await stored("OK1"), { category: "transmission", tags: ["energy"], workTypes: [], edited: false }));

  // --- Person-edited classification is never overwritten ---
  await db.query(
    `update "ProjectCard" set category = 'medical', tags = '{}', "classificationEditedByPerson" = true where "projectCode" = $1`,
    [`${PREFIX}OK1`],
  );
  r = await push(card("OK1", { category: "energy", tags: ["software"] }));
  check("push skips a person-edited classification", same(await stored("OK1"), { category: "medical", tags: [], workTypes: [], edited: true }));
  check("response counts the skipped classification", r.skippedPersonClassification === 1, JSON.stringify(r));
  r = await push(card("OK1"));
  check("a push without classification isn't counted as skipped", r.skippedPersonClassification === 0, JSON.stringify(r));

  // --- Work Types validation (ticket 02) ---
  r = await push(
    card("WBAD1", { workTypes: ["maintenance"] }),
    card("WBAD2", { workTypes: ["ma", "ma"] }),
    card("WBAD3", { workTypes: "ma" }),
    card("WOK1", { category: "ip-network", workTypes: ["supply", "installation", "ma"] }),
  );
  check("unknown, repeated and non-array Work Types are each rejected", r.rejected === 3, JSON.stringify(r.errors));
  check(
    "created card stores Work Types",
    same(await stored("WOK1"), { category: "ip-network", tags: [], workTypes: ["supply", "installation", "ma"], edited: false }),
  );

  // --- Work Types preserve-if-blank / replace ---
  await push(card("WOK1", { category: "transmission" }));
  check(
    "absent Work Types never erase stored values",
    same(await stored("WOK1"), { category: "transmission", tags: [], workTypes: ["supply", "installation", "ma"], edited: false }),
  );
  await push(card("WOK1", { workTypes: ["rental"] }));
  check(
    "non-blank Work Types replace stored values (Category kept)",
    same(await stored("WOK1"), { category: "transmission", tags: [], workTypes: ["rental"], edited: false }),
  );

  // --- One person-edited marker covers Work Types too ---
  await db.query(`update "ProjectCard" set "classificationEditedByPerson" = true where "projectCode" = $1`, [`${PREFIX}WOK1`]);
  r = await push(card("WOK1", { workTypes: ["managed-services"] }));
  check(
    "push skips Work Types of a person-edited classification",
    same(await stored("WOK1"), { category: "transmission", tags: [], workTypes: ["rental"], edited: true }),
  );
  check("a Work-Types-only push to a person-edited card is counted as skipped", r.skippedPersonClassification === 1, JSON.stringify(r));

  // --- Description Source validation (ticket 03) ---
  r = await push(
    card("DBAD1", { descriptionTh: "มีคำอธิบาย" }),
    card("DBAD2", { descriptionEn: "Has a description", descriptionSource: "bogus" }),
    card("DBAD3", { descriptionTh: "แก้โดยคน", descriptionSource: "manual" }),
    card("DBAD4", { descriptionSource: "tor" }),
    card("DBAD5", { descriptionTh: "ภาษาเดียว", descriptionSource: "contract" }),
    card("DOK1", { descriptionTh: "งาน IP", descriptionEn: "IP work", descriptionSource: "tor" }),
  );
  check(
    "Description without source, unknown source, manual from a push, source without Description, one language only are each rejected",
    r.rejected === 5,
    JSON.stringify(r.errors),
  );
  const desc = async (code) =>
    (await db.query('select "descriptionTh" as th, "descriptionEn" as en, "descriptionSource" as src from "ProjectCard" where "projectCode" = $1', [`${PREFIX}${code}`])).rows[0];
  check("created card stores Description and its source", same(await desc("DOK1"), { th: "งาน IP", en: "IP work", src: "tor" }));

  // --- Preserve-if-blank / replace ---
  await push(card("DOK1"));
  check("absent Description and source never erase stored values", same(await desc("DOK1"), { th: "งาน IP", en: "IP work", src: "tor" }));
  await push(card("DOK1", { descriptionTh: "จากสัญญา", descriptionEn: "From the contract", descriptionSource: "contract" }));
  check(
    "a pushed Description replaces a non-manual one, with its source",
    same(await desc("DOK1"), { th: "จากสัญญา", en: "From the contract", src: "contract" }),
  );

  // --- A Description a person edited is never overwritten ---
  await db.query(`update "ProjectCard" set "descriptionTh" = 'คนเขียน', "descriptionSource" = 'manual' where "projectCode" = $1`, [`${PREFIX}DOK1`]);
  r = await push(card("DOK1", { descriptionTh: "AI เขียนใหม่", descriptionEn: "new", descriptionSource: "proposal" }));
  check("push skips a manual Description", same(await desc("DOK1"), { th: "คนเขียน", en: "From the contract", src: "manual" }));
  check("response counts the skipped manual Description", r.skippedManualDescription === 1, JSON.stringify(r));
  r = await push(card("DOK1"));
  check("a push without Description isn't counted as skipped", r.skippedManualDescription === 0, JSON.stringify(r));

  // --- Project Folder (ticket 04) ---
  const FOLDER = String.raw`\\192.168.99.1\PS\_Project 2018-2025\NT\NT014 MA Transport`;
  r = await push(
    card("FBAD1", { projectFolderPath: String.raw`C:\local\folder` }),
    card("FBAD2", { projectFolderPath: String.raw`\\192.168.99.1\PS\_BID\00 Contract\x` }),
    card("FBAD3", { projectFolderPath: "" }),
    card("FBAD4", { projectFolderPath: String.raw`\\192.168.99.1\Other\_Project 2026\NT\x` }),
    card("FBAD5", { projectFolderPath: String.raw`\\192.168.99.1\PS\_ProjectX\NT\x` }),
    card("FOK1", { projectFolderPath: FOLDER }),
  );
  check(
    "non-UNC, _BID, empty, non-PS share and non-`_Project …` paths are each rejected",
    r.rejected === 5,
    JSON.stringify(r.errors),
  );
  const folder = async (code) =>
    (await db.query('select "projectFolderPath" as p from "ProjectCard" where "projectCode" = $1', [`${PREFIX}${code}`])).rows[0]?.p;
  check("created card stores the Project Folder", (await folder("FOK1")) === FOLDER);
  await push(card("FOK1"), card("FOK2"));
  check("absent Project Folder never erases a stored one", (await folder("FOK1")) === FOLDER);
  check("a card without a Project Folder stores null", (await folder("FOK2")) === null);
  const OTHER = String.raw`\\192.168.99.1\PS\_Project 2026\NT\NT066 CM-PM`;
  await push(card("FOK1", { projectFolderPath: OTHER }));
  check("a non-null Project Folder replaces the stored one", (await folder("FOK1")) === OTHER);

  // --- Lists kept by admins in the database (ticket 15) ---
  r = await push(card("TBAD1", { category: `${TERM_PREFIX}-area` }), card("TBAD2", { workTypes: [`${TERM_PREFIX}-way`] }));
  check("a Category / Work Type not yet in the list is rejected", r.rejected === 2, JSON.stringify(r.errors));
  await db.query(
    `insert into "ProjectCardTerm" (id, kind, value, en, th, "sortOrder", "updatedAt") values
       ('${TERM_PREFIX}1', 'category', '${TERM_PREFIX}-area', 'ZZ Test Area', 'พื้นที่ทดสอบ', 999, now()),
       ('${TERM_PREFIX}2', 'workType', '${TERM_PREFIX}-way', 'ZZ Test Way', 'วิธีทดสอบ', 999, now())`,
  );
  r = await push(card("TOK1", { category: `${TERM_PREFIX}-area`, tags: ["energy"], workTypes: [`${TERM_PREFIX}-way`, "ma"] }));
  check("a Category / Work Type an admin added is accepted at once", r.created === 1 && r.rejected === 0, JSON.stringify(r));
  check(
    "the card stores the added values",
    same(await stored("TOK1"), { category: `${TERM_PREFIX}-area`, tags: ["energy"], workTypes: [`${TERM_PREFIX}-way`, "ma"], edited: false }),
  );
  r = await push(card("TBAD3", { tags: ["zz-not-a-term"] }));
  check("an unknown Tag is still rejected", r.rejected === 1, JSON.stringify(r.errors));
} finally {
  await cleanup();
  await db.end();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
