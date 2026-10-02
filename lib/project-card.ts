import { timingSafeEqual } from "node:crypto";
import {
  isPushedDescriptionSource,
  isTerm,
  type PushedDescriptionSource,
  type Taxonomy,
  type Term,
} from "@/lib/project-card-taxonomy";

// Project Card ingest has no browser session to check — the extraction
// script that crawls the `PS` share runs off this app's server entirely
// (see docs/adr/0005-project-card-push-based-ingest.md) and authenticates
// with a single shared key instead. Checked both in proxy.ts (so a bad key
// gets a clean 401 instead of a redirect to /login) and again in the route
// handler itself (proxy.ts skips all auth in dev — see its NODE_ENV check —
// so the route can't rely on proxy.ts alone).
export function requireIngestKey(request: Request): void {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new Error("UNAUTHORIZED");

  const expected = process.env.PROJECT_CARD_INGEST_KEY;
  if (!expected) throw new Error("UNAUTHORIZED");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(token);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error("UNAUTHORIZED");
  }
}

// One ingest request re-pushes the full current state of every project the
// crawler found this run (see ADR 0005's "re-index re-pushes everything"
// note) — a generous but finite cap just to reject an obviously malformed
// request instead of a real crawl size.
export const MAX_PROJECTS_PER_REQUEST = 5000;

export type BudgetSource = "certificate" | "contract";
export type VatStatus = "included" | "excluded" | "unspecified";

const BUDGET_SOURCES: readonly BudgetSource[] = ["certificate", "contract"];
const VAT_STATUSES: readonly VatStatus[] = ["included", "excluded", "unspecified"];

export interface ProjectCardInput {
  projectCode: string;
  client: string;
  projectName: string;
  descriptionTh: string;
  descriptionEn: string;
  descriptionSource: PushedDescriptionSource | null;
  contractPath: string | null;
  certificatePath: string | null;
  projectFolderPath: string | null;
  budgetAmount: number | null;
  budgetSource: BudgetSource | null;
  vatStatus: VatStatus | null;
  budgetNote: string;
  year: number | null;
  category: string | null;
  tags: string[];
  workTypes: string[];
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`"${field}" must be a non-empty string`);
  return value;
}

// Unlike client/projectName/projectCode (always known from the folder/file
// structure itself), descriptions depend on an AI provider that starts
// disabled by default (see project-card-crawler/ai_provider.py, mirroring
// soc-worker/ai_provider.py's fail-closed pattern) — until one is approved
// and wired up, every crawl produces blank descriptions. Blank is valid
// input, not a validation failure; a person can fill it in by hand later
// (see CONTEXT.md's Description entry).
function optionalString(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`"${field}" must be a string`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`"${field}" must be a non-empty string or null`);
  return value;
}

// Folder names under `PS` embed the year (`_Project 2018-2025`, `_Project
// 2026`) as a plain Gregorian year, not Buddhist Era — extracted `year`
// values follow the same convention.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

// \\<server>\PS\_Project <years>\<at least one more segment>
const PROJECT_FOLDER_PATH = /^\\\\[^\\]+\\PS\\_Project [^\\]+\\[^\\]/i;

export function validateProjectCardInput(raw: unknown, taxonomy: Taxonomy): ProjectCardInput {
  if (typeof raw !== "object" || raw === null) throw new Error("Record must be an object");
  const r = raw as Record<string, unknown>;

  const projectCode = requireNonEmptyString(r.projectCode, "projectCode");
  const client = requireNonEmptyString(r.client, "client");
  const projectName = requireNonEmptyString(r.projectName, "projectName");
  const descriptionTh = optionalString(r.descriptionTh, "descriptionTh");
  const descriptionEn = optionalString(r.descriptionEn, "descriptionEn");
  const budgetNote = optionalString(r.budgetNote, "budgetNote");

  // A Description is never unlabelled (CONTEXT.md's Description Source
  // entry), and the two travel together like budgetAmount/budgetSource.
  // `manual` means a person edited it on the web, which a push can't claim.
  let descriptionSource: PushedDescriptionSource | null = null;
  if (r.descriptionSource !== undefined && r.descriptionSource !== null) {
    if (!isPushedDescriptionSource(r.descriptionSource)) {
      throw new Error('"descriptionSource" must be one of tor, proposal, contract, name ("manual" is set only by the web)');
    }
    descriptionSource = r.descriptionSource;
  }
  const sendsDescription = descriptionTh.trim() !== "" || descriptionEn.trim() !== "";
  // Both languages come from one reading of one source, so they're sent
  // together: a push with only one would leave the stored other language
  // under the new source's label, misdescribing where it came from.
  if (sendsDescription && (descriptionTh.trim() === "" || descriptionEn.trim() === "")) {
    throw new Error('"descriptionTh" and "descriptionEn" must be sent together');
  }
  if (sendsDescription && descriptionSource === null) {
    throw new Error('"descriptionSource" is required when "descriptionTh" or "descriptionEn" is present');
  }
  if (!sendsDescription && descriptionSource !== null) {
    throw new Error('"descriptionSource" must be null when no Description is sent');
  }

  const contractPath = nullableString(r.contractPath, "contractPath");
  const certificatePath = nullableString(r.certificatePath, "certificatePath");
  // A `_BID` project only exists because it appeared in the Contract or
  // Work Certificate collection (see CONTEXT.md's Project Card entry) — a
  // record with neither path isn't a project this context can source.
  if (contractPath === null && certificatePath === null) {
    throw new Error('at least one of "contractPath" or "certificatePath" is required');
  }
  // The project's folder in the wider archive (CONTEXT.md's Project Folder
  // entry): a UNC path whose top folder on the `PS` share is `_Project …`
  // (e.g. `\\192.168.99.1\PS\_Project 2018-2025\…`), never a `_BID` or
  // local path. Absent/null means "not known", never "erase".
  const projectFolderPath = nullableString(r.projectFolderPath, "projectFolderPath");
  if (projectFolderPath !== null && !PROJECT_FOLDER_PATH.test(projectFolderPath)) {
    throw new Error(String.raw`"projectFolderPath" must be a UNC path under the PS share's _Project archive (\\server\PS\_Project …\…)`);
  }

  let budgetAmount: number | null = null;
  if (r.budgetAmount !== undefined && r.budgetAmount !== null) {
    if (typeof r.budgetAmount !== "number" || !Number.isFinite(r.budgetAmount) || r.budgetAmount < 0) {
      throw new Error('"budgetAmount" must be a non-negative number');
    }
    budgetAmount = r.budgetAmount;
  }

  let budgetSource: BudgetSource | null = null;
  if (r.budgetSource !== undefined && r.budgetSource !== null) {
    if (typeof r.budgetSource !== "string" || !BUDGET_SOURCES.includes(r.budgetSource as BudgetSource)) {
      throw new Error(`"budgetSource" must be one of ${BUDGET_SOURCES.join(", ")}`);
    }
    budgetSource = r.budgetSource as BudgetSource;
  }
  // A Budget figure is only ever presented with the document it came from
  // (CONTEXT.md's Budget entry) — the two travel together or not at all.
  if (budgetAmount !== null && budgetSource === null) {
    throw new Error('"budgetSource" is required when "budgetAmount" is present');
  }
  if (budgetAmount === null && budgetSource !== null) {
    throw new Error('"budgetSource" must be null when "budgetAmount" is absent');
  }

  let vatStatus: VatStatus | null = null;
  if (r.vatStatus !== undefined && r.vatStatus !== null) {
    if (typeof r.vatStatus !== "string" || !VAT_STATUSES.includes(r.vatStatus as VatStatus)) {
      throw new Error(`"vatStatus" must be one of ${VAT_STATUSES.join(", ")}`);
    }
    vatStatus = r.vatStatus as VatStatus;
  }

  let year: number | null = null;
  if (r.year !== undefined && r.year !== null) {
    if (!Number.isInteger(r.year) || (r.year as number) < MIN_YEAR || (r.year as number) > MAX_YEAR) {
      throw new Error(`"year" must be an integer between ${MIN_YEAR} and ${MAX_YEAR}`);
    }
    year = r.year as number;
  }

  return {
    projectCode,
    client,
    projectName,
    descriptionTh,
    descriptionEn,
    descriptionSource,
    contractPath,
    certificatePath,
    projectFolderPath,
    budgetAmount,
    budgetSource,
    vatStatus,
    budgetNote,
    year,
    ...validateClassification(r.category, r.tags, taxonomy.categories),
    workTypes: validateWorkTypes(r.workTypes, taxonomy.workTypes),
  };
}

// An array of values from one list, with no repeats; absent means [] —
// "nothing to say", never "erase".
function validateTermArray(raw: unknown, field: string, list: readonly Term[]): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((v) => isTerm(list, v))) {
    throw new Error(`"${field}" must be an array of ${list.map((t) => t.value).join(", ")}`);
  }
  if (new Set(raw).size !== raw.length) throw new Error(`"${field}" must not repeat a value`);
  return raw;
}

// Category and Tags must come from the company list admins keep
// (CONTEXT.md's Category / Tag entries), so a typo can never create a
// near-duplicate area. Shared by the ingest API and the popup's save
// action. An absent category is null — "nothing to say", never "erase".
export function validateClassification(
  rawCategory: unknown,
  rawTags: unknown,
  categories: readonly Term[],
): { category: string | null; tags: string[] } {
  let category: string | null = null;
  if (rawCategory !== undefined && rawCategory !== null) {
    if (!isTerm(categories, rawCategory)) {
      throw new Error(`"category" must be one of ${categories.map((c) => c.value).join(", ")}`);
    }
    category = rawCategory;
  }
  const tags = validateTermArray(rawTags, "tags", categories);
  if (category !== null && tags.includes(category)) throw new Error('"tags" must not repeat the "category"');
  return { category, tags };
}

// Work Types follow the same rules as Tags, from the Work Type list.
export function validateWorkTypes(raw: unknown, workTypes: readonly Term[]): string[] {
  return validateTermArray(raw, "workTypes", workTypes);
}
