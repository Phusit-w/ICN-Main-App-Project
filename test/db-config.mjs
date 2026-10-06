// Shared by test/global-setup.mjs (which Node loads before the `@/` resolve
// hook exists, so it can't import TypeScript app code) and test/db.ts.

export const SCHEMA_PREFIX = "test_run_";

// LIKE pattern for SCHEMA_PREFIX: `_` is a single-character wildcard in LIKE,
// so escape it or `test1run2x` would match too.
export const SCHEMA_PREFIX_LIKE = `${SCHEMA_PREFIX.replaceAll("_", "\\_")}%`;

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

/**
 * TEST_DATABASE_URL, refusing anything but a server on this machine so a
 * mis-pasted production connection string can't be migrated into or truncated.
 * pg also honours `?host=`/`?hostaddr=`, which would bypass the hostname check.
 * @returns {string}
 */
export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const parsed = new URL(url);
  if (!LOCAL_HOSTS.includes(parsed.hostname) || parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
    throw new Error(`TEST_DATABASE_URL must point at a local server, got host "${parsed.hostname}"`);
  }
  return url;
}

/** @param {string} name @returns {string} a Postgres quoted identifier */
export function quoteIdent(name) {
  return `"${name.replaceAll('"', '""')}"`;
}
