// Writes one batch file (e.g. 07-nt-a.json) into the LOCAL pilot-db through the
// local dev server's ingest API, so the same validation and merge rules apply
// as on production. Then marks those rows `written` in ../worklist.md.
//
//   npm run dev                                  (in Main_Project_Build_App)
//   node --env-file=.env .scratch/project-card-description/batches/write-local.mjs 07-nt-a.json
//
// Never points at production: the production push is a separate, user-run step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASE_URL = "http://localhost:3000";
const SHARE = String.raw`\\192.168.99.1\PS`;
const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
if (!file) throw new Error("usage: write-local.mjs <batch.json>");
const entries = JSON.parse(fs.readFileSync(path.join(here, file), "utf8"));

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const { rows } = await db.query(
  `select "projectCode", client, "projectName", "contractPath", "certificatePath" from "ProjectCard" where "projectCode" = any($1)`,
  [entries.map((e) => e.projectCode)],
);
await db.end();
const base = new Map(rows.map((r) => [r.projectCode, r]));

const projects = entries.map((e) => {
  const b = base.get(e.projectCode);
  if (!b) throw new Error(`${e.projectCode} is not in pilot-db`);
  return {
    projectCode: e.projectCode,
    client: b.client,
    projectName: b.projectName,
    contractPath: b.contractPath,
    certificatePath: b.certificatePath,
    descriptionTh: e.descriptionTh,
    descriptionEn: e.descriptionEn,
    descriptionSource: e.descriptionSource,
    category: e.category,
    tags: e.tags,
    workTypes: e.workTypes,
    projectFolderPath: e.folder ? `${SHARE}\\${e.folder}` : null,
  };
});

const res = await fetch(`${BASE_URL}/api/project-card/ingest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.PROJECT_CARD_INGEST_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ projects }),
});
const result = await res.json();
console.log(result);
if (!res.ok || result.rejected) process.exit(1);

// Worklist: todo -> written for the cards just written.
const worklistPath = path.join(here, "..", "worklist.md");
const written = new Set(projects.map((p) => p.projectCode));
const lines = fs.readFileSync(worklistPath, "utf8").split("\n").map((line) => {
  const cells = line.split(" | ");
  if (cells.length > 6 && written.has(cells[1]) && cells[6] === "todo") cells[6] = "written";
  return cells.join(" | ");
});
fs.writeFileSync(worklistPath, lines.join("\n"));
console.log(`worklist: ${written.size} row(s) marked written`);
