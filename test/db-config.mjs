// Shared by test/global-setup.mjs (which Node loads before the `@/` resolve
// hook exists, so it can't import TypeScript app code) and test/db.ts.

export const SCHEMA_PREFIX = "test_run_";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

/**
 * TEST_DATABASE_URL, refusing anything but a server on this machine so a
 * mis-pasted production connection string can't be migrated into or truncated.
 * @returns {string}
 */
export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(`TEST_DATABASE_URL must point at a local server, got host "${host}"`);
  }
  return url;
}
