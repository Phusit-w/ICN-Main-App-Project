// soc-worker must never pick up an Imported SOC Check (ADR 0008): runs the
// worker's own claim_job() against this run's test schema. Skipped when the
// worker's Python environment (psycopg, python-docx) isn't installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase, testSchema } from "@/test/db";
import { testDatabaseUrl } from "@/test/db-config.mjs";

const dbSkip = setupTestDatabase();
const workerDir = path.resolve(import.meta.dirname, "..", "soc-worker");
const python = process.platform === "win32" ? "python" : "python3";
const hasWorkerPython = spawnSync(python, ["-c", "import psycopg, docx"], { cwd: workerDir }).status === 0;
const skip = dbSkip || (hasWorkerPython ? false : "soc-worker Python dependencies not installed");

// Claims jobs until the queue is empty and prints the claimed ids as JSON.
const CLAIM_ALL = `
import json, os, sys, psycopg
sys.path.insert(0, os.getcwd())
import worker
conn = psycopg.connect(os.environ["DATABASE_URL"], options="-c search_path=" + os.environ["TEST_SCHEMA"], **worker.DB_CONNECT_OPTIONS)
claimed = []
while True:
    job = worker.claim_job(conn)
    if not job:
        break
    claimed.append(job[0])
print(json.dumps(claimed))
`;

test("soc-worker claims queued and confirmed check jobs but never an imported job", { skip }, async () => {
  const owner = await prisma.user.create({ data: { username: "owner", displayName: "owner", passwordHash: "x" } });
  const expiresAt = new Date(Date.now() + 86400000);
  const job = (title: string, kind: string, status: string) => prisma.socJob.create({ data: { title, kind, status, ownerId: owner.id, expiresAt } });
  const queued = await job("legacy queued", "CHECK", "QUEUED");
  const confirmed = await job("legacy confirmed", "CHECK", "CONFIRMED");
  const importedInReview = await job("imported in review", "IMPORTED", "NEEDS_REVIEW");
  const importedConfirmed = await job("imported confirmed", "IMPORTED", "CONFIRMED");
  const importedQueued = await job("imported queued", "IMPORTED", "QUEUED");

  const result = spawnSync(python, ["-c", CLAIM_ALL], {
    cwd: workerDir,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), TEST_SCHEMA: testSchema(), PYTHONIOENCODING: "utf-8" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").pop()!).sort(), [queued.id, confirmed.id].sort());

  const untouched = await prisma.socJob.findMany({ where: { id: { in: [importedInReview.id, importedConfirmed.id, importedQueued.id] } } });
  assert.deepEqual(untouched.map((j) => j.status).sort(), ["CONFIRMED", "NEEDS_REVIEW", "QUEUED"]);
});
