// Proof that the node:test harness works end to end: `@/` imports resolve,
// `@/lib/prisma` is the disposable test-schema client (never dev/prod), and a
// test can create and clean up its own rows. See docs/SOC-TESTING.md.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { hasTestDatabase, resetDatabase, testSchema } from "@/test/db";
import { testDatabaseUrl } from "@/test/db-config.mjs";

const skip = hasTestDatabase() ? false : "TEST_DATABASE_URL not set — see docs/SOC-TESTING.md";

beforeEach(async () => {
  if (hasTestDatabase()) await resetDatabase();
});

test("@/lib/prisma is bound to this run's throwaway schema", { skip }, async () => {
  const rows = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  assert.equal(rows[0].schema, testSchema());
  assert.match(testSchema(), /^test_run_/);
});

test("a test can create and clean up its own data", { skip }, async () => {
  await prisma.savedItem.create({ data: { type: "FA017", desc: "harness proof", data: { ok: true } } });
  assert.equal(await prisma.savedItem.count(), 1);

  await resetDatabase();
  assert.equal(await prisma.savedItem.count(), 0);
});

test("refuses a TEST_DATABASE_URL that isn't on this machine", () => {
  const saved = process.env.TEST_DATABASE_URL;
  try {
    process.env.TEST_DATABASE_URL = "postgres://u:p@192.168.51.43:5432/app";
    assert.throws(() => testDatabaseUrl(), /must point at a local server/);
    process.env.TEST_DATABASE_URL = "postgres://u:p@localhost:51228/template1";
    assert.equal(testDatabaseUrl(), process.env.TEST_DATABASE_URL);
  } finally {
    process.env.TEST_DATABASE_URL = saved;
  }
});
