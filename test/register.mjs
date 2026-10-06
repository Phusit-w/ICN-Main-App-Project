// Preloaded into every `npm test` process (node --import). Order matters:
// the resolve hook must be registered before any app TypeScript is imported.
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);

// Test processes never load .env, but a DATABASE_URL exported in the shell
// would still reach lib/prisma.ts. Replace it with an address that can't
// resolve, so a DB test that forgot `{ skip }` fails loudly instead of
// reaching dev/prod or pg's localhost:5432 default.
process.env.DATABASE_URL = "postgres://no-test-database.invalid:1/none";

// Inside test-file processes the global setup has already created and
// migrated this run's schema; bind `@/lib/prisma` to it before any test
// imports app code.
if (process.env.TEST_DATABASE_SCHEMA) {
  const { installTestPrisma } = await import("./db.ts");
  installTestPrisma();
}
