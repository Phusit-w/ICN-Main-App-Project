// Lets `node` load the app's TypeScript for the evaluation script the way
// `npm test` does (test/resolve-ts.mjs: the `@/` alias, extensionless
// imports). Unlike test/register.mjs it keeps DATABASE_URL: the script reads
// the real Categories, Work Types and client names from the app's database.
import { register } from "node:module";

register("../../test/resolve-ts.mjs", import.meta.url);
