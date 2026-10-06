// Disposable database for tests. Every `npm test` run gets its own Postgres
// schema (`test_run_*`), created and migrated by test/global-setup.mjs and
// dropped when the run ends, on the local server named by TEST_DATABASE_URL.
// Dev/prod data is never touched. See docs/SOC-TESTING.md.
import { PrismaClient } from "@/lib/generated/prisma/client";
import { beforeEach } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCHEMA_PREFIX, quoteIdent, testDatabaseUrl } from "./db-config.mjs";

export function hasTestDatabase(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_SCHEMA);
}

export function testSchema(): string {
  const schema = process.env.TEST_DATABASE_SCHEMA;
  if (!schema?.startsWith(SCHEMA_PREFIX)) throw new Error(`TEST_DATABASE_SCHEMA is not set to a ${SCHEMA_PREFIX}* schema`);
  return schema;
}

let client: PrismaClient | undefined;

// lib/prisma.ts reuses `globalThis.prisma` when it is set, so installing the
// test client there makes every `@/lib/prisma` import in code under test use
// this run's schema. test/register.mjs calls this before any test file loads.
export function installTestPrisma(): PrismaClient {
  if (!client) {
    // allowExitOnIdle: test processes exit on their own without a $disconnect().
    const adapter = new PrismaPg(
      { connectionString: testDatabaseUrl(), max: 1, allowExitOnIdle: true },
      { schema: testSchema() },
    );
    client = new PrismaClient({ adapter });
  }
  (globalThis as unknown as { prisma?: PrismaClient }).prisma = client;
  return client;
}

// Empty every table in this run's schema (keeping the migration history), so
// each test starts from nothing. setupTestDatabase() runs it before each test.
export async function resetDatabase(): Promise<void> {
  const prisma = installTestPrisma();
  const schema = testSchema();
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT tablename AS name FROM pg_tables
    WHERE schemaname = ${schema} AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `${quoteIdent(schema)}.${quoteIdent(t.name)}`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

// Call once at the top of a test file that uses the database: empties the
// schema before each test and returns the `skip` option for those tests, so
// they are reported as skipped (not run against nothing) without a test DB.
//   const skip = setupTestDatabase();
//   test("…", { skip }, async () => { … });
export function setupTestDatabase(): false | string {
  if (!hasTestDatabase()) return "TEST_DATABASE_URL not set — see docs/SOC-TESTING.md";
  beforeEach(() => resetDatabase());
  return false;
}
