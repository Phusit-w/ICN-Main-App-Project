// Preloaded into every `npm test` process (node --import). Order matters:
// the resolve hook must be registered before any app TypeScript is imported.
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);

// Tests never read .env, but drop DATABASE_URL anyway (e.g. one exported in
// the shell) so app code can't fall back to the dev/prod database.
delete process.env.DATABASE_URL;

// Inside test-file processes the global setup has already created and
// migrated this run's schema; bind `@/lib/prisma` to it before any test
// imports app code.
if (process.env.TEST_DATABASE_SCHEMA) {
  const { installTestPrisma } = await import("./db.ts");
  installTestPrisma();
}
