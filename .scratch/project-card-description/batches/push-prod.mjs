// Pushes reviewed batches (e.g. 07-nt-a.json 08-nt-b.json) from the LOCAL pilot-db
// to PRODUCTION through the ingest API, then marks those worklist rows `pushed`.
// Run by the user, not Claude. The ingest key is read from an env var and never
// written to disk.
//
//   $env:PROD_INGEST_KEY = "<production key>"          (PowerShell)
//   node --env-file=.env .scratch/project-card-description/batches/push-prod.mjs --dry-run 07-nt-a.json 08-nt-b.json
//   node --env-file=.env .scratch/project-card-description/batches/push-prod.mjs 07-nt-a.json 08-nt-b.json
//
// What is sent: projectCode/client/projectName/contractPath/certificatePath (required
// by the ingest validation, unchanged from production) plus Description TH/EN,
// Description Source, Category, Tags, Work Types and Project Folder — all read from
// pilot-db, so classification corrections made in the local web app are included. Budget, VAT,
// budget note and year are NOT sent; the ingest merge keeps production's values.
// Rows must be `reviewed` in the worklist; anything else stops the push.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const PROD_URL = "https://psaidemo.icn21.local/api/project-card/ingest";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => a !== "--dry-run");
if (!files.length) throw new Error("usage: push-prod.mjs [--dry-run] <batch.json> [...]");
const key = process.env.PROD_INGEST_KEY;
if (!dryRun && !key) throw new Error("set PROD_INGEST_KEY to the production ingest key first");
if (key && !/^[A-Za-z0-9_\-+/=]+$/.test(key)) {
  throw new Error("PROD_INGEST_KEY has extra characters (quotes, < >, spaces or a line break) — paste only the key");
}

const codes = files.flatMap((f) => JSON.parse(fs.readFileSync(path.join(here, f), "utf8")).map((e) => e.projectCode));

// Gate: every card must be `reviewed` in the worklist.
const worklistPath = path.join(here, "..", "worklist.md");
const status = new Map(
  fs.readFileSync(worklistPath, "utf8").split("\n")
    .map((line) => line.split(" | "))
    .filter((c) => c.length > 6)
    .map((c) => [c[1], c[6]]),
);
const notReviewed = codes.filter((c) => status.get(c) !== "reviewed");
if (notReviewed.length) throw new Error(`not reviewed in the worklist: ${notReviewed.join(", ")}`);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query(
  `select "projectCode", client, "projectName", "contractPath", "certificatePath",
          "descriptionTh", "descriptionEn", "descriptionSource", category, tags, "workTypes", "projectFolderPath"
     from "ProjectCard" where "projectCode" = any($1) order by "projectCode"`,
  [codes],
);
await db.end();
if (rows.length !== codes.length) {
  const found = new Set(rows.map((r) => r.projectCode));
  throw new Error(`missing in pilot-db: ${codes.filter((c) => !found.has(c)).join(", ")}`);
}

const projects = rows.map((r) => ({
  projectCode: r.projectCode,
  client: r.client,
  projectName: r.projectName,
  contractPath: r.contractPath,
  certificatePath: r.certificatePath,
  descriptionTh: r.descriptionTh,
  descriptionEn: r.descriptionEn,
  descriptionSource: r.descriptionSource,
  category: r.category,
  tags: r.tags,
  workTypes: r.workTypes,
  projectFolderPath: r.projectFolderPath,
}));
// Every card in a written batch has a Description and a Category. Blanks mean the
// script is reading the wrong database (e.g. it was run on the production server,
// whose .env points at production) — stop rather than push them.
const blank = rows.filter((r) => !r.descriptionTh?.trim() || !r.category).map((r) => r.projectCode);
if (blank.length) {
  throw new Error(
    `no Description/Category in this database for: ${blank.join(", ")}\n` +
      "Run this on the workstation that holds pilot-db, from the Main_Project_Build_App folder.",
  );
}
// A Description edited in the local web is stored as `manual`, which the ingest
// API refuses (only the web sets it). Decide those by hand rather than guess a source.
const manual = rows.filter((r) => r.descriptionSource === "manual").map((r) => r.projectCode);
if (manual.length) throw new Error(`manual Descriptions in pilot-db, decide their source first: ${manual.join(", ")}`);

if (dryRun) {
  console.log(`dry run: ${projects.length} card(s) ready for ${PROD_URL}`);
  console.log(JSON.stringify(projects[0], null, 2));
  process.exit(0);
}

const res = await fetch(PROD_URL, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ projects }),
});
const result = await res.json().catch(() => ({ status: res.status }));
console.log(result);
if (!res.ok || result.rejected) process.exit(1);

// Worklist: reviewed -> pushed.
const pushed = new Set(codes);
const lines = fs.readFileSync(worklistPath, "utf8").split("\n").map((line) => {
  const cells = line.split(" | ");
  if (cells.length > 6 && pushed.has(cells[1]) && cells[6] === "reviewed") cells[6] = "pushed";
  return cells.join(" | ");
});
fs.writeFileSync(worklistPath, lines.join("\n"));
console.log(`worklist: ${pushed.size} row(s) marked pushed`);
