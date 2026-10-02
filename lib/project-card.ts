import { timingSafeEqual } from "node:crypto";
import {
  CATEGORIES,
  WORK_TYPES,
  isCategory,
  isWorkType,
  type CategoryValue,
  type WorkTypeValue,
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
  contractPath: string | null;
  certificatePath: string | null;
  budgetAmount: number | null;
  budgetSource: BudgetSource | null;
  vatStatus: VatStatus | null;
  budgetNote: string;
  year: number | null;
  category: CategoryValue | null;
  tags: CategoryValue[];
  workTypes: WorkTypeValue[];
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

export function validateProjectCardInput(raw: unknown): ProjectCardInput {
  if (typeof raw !== "object" || raw === null) throw new Error("Record must be an object");
  const r = raw as Record<string, unknown>;

  const projectCode = requireNonEmptyString(r.projectCode, "projectCode");
  const client = requireNonEmptyString(r.client, "client");
  const projectName = requireNonEmptyString(r.projectName, "projectName");
  const descriptionTh = optionalString(r.descriptionTh, "descriptionTh");
  const descriptionEn = optionalString(r.descriptionEn, "descriptionEn");
  const budgetNote = optionalString(r.budgetNote, "budgetNote");

  const contractPath = nullableString(r.contractPath, "contractPath");
  const certificatePath = nullableString(r.certificatePath, "certificatePath");
  // A `_BID` project only exists because it appeared in the Contract or
  // Work Certificate collection (see CONTEXT.md's Project Card entry) — a
  // record with neither path isn't a project this context can source.
  if (contractPath === null && certificatePath === null) {
    throw new Error('at least one of "contractPath" or "certificatePath" is required');
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
    contractPath,
    certificatePath,
    budgetAmount,
    budgetSource,
    vatStatus,
    budgetNote,
    year,
    ...validateClassification(r.category, r.tags),
    workTypes: validateWorkTypes(r.workTypes),
  };
}

// Category and Tags must come from the fixed list (CONTEXT.md's Category /
// Tag entries) so a typo can never create a near-duplicate area. Shared by
// the ingest API and the popup's save action. An absent category is null
// and absent tags are [] — both mean "nothing to say", never "erase".
export function validateClassification(
  rawCategory: unknown,
  rawTags: unknown,
): { category: CategoryValue | null; tags: CategoryValue[] } {
  let category: CategoryValue | null = null;
  if (rawCategory !== undefined && rawCategory !== null) {
    if (!isCategory(rawCategory)) throw new Error(`"category" must be one of ${CATEGORIES.map((c) => c.value).join(", ")}`);
    category = rawCategory;
  }

  let tags: CategoryValue[] = [];
  if (rawTags !== undefined && rawTags !== null) {
    if (!Array.isArray(rawTags) || !rawTags.every(isCategory)) {
      throw new Error(`"tags" must be an array of ${CATEGORIES.map((c) => c.value).join(", ")}`);
    }
    if (new Set(rawTags).size !== rawTags.length) throw new Error('"tags" must not repeat a value');
    if (category !== null && rawTags.includes(category)) throw new Error('"tags" must not repeat the "category"');
    tags = rawTags;
  }
  return { category, tags };
}

// Work Types follow the same rules as Tags: from the fixed list, no repeats,
// absent means [] ("nothing to say", never "erase"). Shared by the ingest
// API and the popup's save action.
export function validateWorkTypes(raw: unknown): WorkTypeValue[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every(isWorkType)) {
    throw new Error(`"workTypes" must be an array of ${WORK_TYPES.map((w) => w.value).join(", ")}`);
  }
  if (new Set(raw).size !== raw.length) throw new Error('"workTypes" must not repeat a value');
  return raw;
}
