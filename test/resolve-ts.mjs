// Node module resolve hook so `node --test` can load the app's TypeScript the
// way Next/tsc do: the `@/` path alias from tsconfig.json, and relative
// imports written without an extension (`./foo` → `./foo.ts`). Node's own
// type stripping does the rest — no transpiler or test library involved.
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

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
  // `next` has no package.json "exports", so Node's ESM loader needs the file
  // extension that webpack/tsc add for us: `next/cache` → `next/cache.js`.
  if (/^next\/[\w/-]+$/.test(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }
  return nextResolve(specifier, context);
}

// Node can strip types from .ts files itself, but JSX still needs a small
// compile step. Keep it scoped to .tsx so the existing test runtime is
// unchanged for server-side tests.
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".tsx")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: fileURLToPath(url),
      }).outputText,
    };
  }
  return nextLoad(url, context);
}
