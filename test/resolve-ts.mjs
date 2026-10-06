// Node module resolve hook so `node --test` can load the app's TypeScript the
// way Next/tsc do: the `@/` path alias from tsconfig.json, and relative
// imports written without an extension (`./foo` → `./foo.ts`). Node's own
// type stripping does the rest — no transpiler or test library involved.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const CANDIDATES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function isFile(url) {
  const path = fileURLToPath(url);
  return existsSync(path) && statSync(path).isFile();
}

function withTsExtension(url) {
  if (isFile(url)) return url;
  for (const suffix of CANDIDATES) {
    const candidate = new URL(url.href + suffix);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let target = null;
  if (specifier.startsWith("@/")) {
    target = new URL(specifier.slice(2), ROOT);
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parentPath = fileURLToPath(context.parentURL);
    if (!parentPath.includes("node_modules")) target = new URL(specifier, pathToFileURL(parentPath));
  }
  if (target) {
    const found = withTsExtension(target);
    if (found) return nextResolve(found.href, context);
  }
  return nextResolve(specifier, context);
}
