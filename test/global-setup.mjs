// node --test-global-setup: runs once per `npm test`, in the runner process,
// before any test file starts. Creates this run's `test_run_*` schema on the
// TEST_DATABASE_URL server, applies prisma/migrations to it, and drops it at
// the end. Test-file processes inherit TEST_DATABASE_SCHEMA from here.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { SCHEMA_PREFIX, testDatabaseUrl } from "./db-config.mjs";

/** @param {(client: pg.Client) => Promise<void>} fn */
async function withClient(fn) {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

/** @param {pg.Client} client @param {string[]} names */
async function dropSchemas(client, names) {
  for (const name of names) await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
}

export async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    console.warn("\n⚠  TEST_DATABASE_URL not set: database tests are SKIPPED. See docs/SOC-TESTING.md.\n");
    return;
  }
  const url = testDatabaseUrl();
  const schema = `${SCHEMA_PREFIX}${Date.now()}_${randomBytes(3).toString("hex")}`;

  // Schemas left behind by a run that was killed before its teardown.
  await withClient(async (client) => {
    const stale = await client.query(
      "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name LIKE $1",
      [`${SCHEMA_PREFIX}%`],
    );
    await dropSchemas(client, stale.rows.map((r) => r.name));
  });

  const migrateUrl = new URL(url);
  migrateUrl.searchParams.set("schema", schema);
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: migrateUrl.toString() },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy into ${schema} failed:\n${result.stdout}\n${result.stderr}`);
  }

  process.env.TEST_DATABASE_SCHEMA = schema;
}

export async function globalTeardown() {
  const schema = process.env.TEST_DATABASE_SCHEMA;
  if (!schema) return;
  await withClient((client) => dropSchemas(client, [schema]));
}
