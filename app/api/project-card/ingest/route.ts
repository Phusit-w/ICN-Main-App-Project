import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MAX_PROJECTS_PER_REQUEST, requireIngestKey, validateProjectCardInput } from "@/lib/project-card";
import type { ProjectCardInput } from "@/lib/project-card";

export const runtime = "nodejs";

// Reads that need share access run interactively (Claude-in-session reading
// scanned PDFs — see PROJECT-CARD-BID-PIVOT-2026-09-21.md), so a crawl can
// legitimately cover only some projects in one pass. A blank descriptionTh/
// descriptionEn/year in this request must never erase a value an earlier,
// more complete push already recorded.
function preserveIfBlank(existing: string, incoming: string): string {
  return incoming === "" ? existing : incoming;
}

function preserveIfNull<T>(existing: T | null, incoming: T | null): T | null {
  return incoming === null ? existing : incoming;
}

// Category, Tags and Work Types each preserve-if-blank, then a Tag that
// ended up equal to the (possibly preserved) Category is dropped, so the two
// never overlap.
function mergeClassification(
  existing: { category: string | null; tags: string[]; workTypes: string[] },
  incoming: Pick<ProjectCardInput, "category" | "tags" | "workTypes">,
): { category: string | null; tags: string[]; workTypes: string[] } {
  const category = preserveIfNull(existing.category, incoming.category);
  const tags = incoming.tags.length > 0 ? incoming.tags : existing.tags;
  const workTypes = incoming.workTypes.length > 0 ? incoming.workTypes : existing.workTypes;
  return { category, tags: tags.filter((t) => t !== category), workTypes };
}

// Pushed by the extraction script that crawls the `PS` share from a machine
// that has access to it — this app's server doesn't (see
// docs/adr/0005-project-card-push-based-ingest.md). One request represents
// the crawler's current view of some or all `_BID` projects: a project the
// crawler stops sending simply stops getting refreshed rather than being
// deleted (no explicit removal in v1).
export async function POST(request: Request) {
  try {
    requireIngestKey(request);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projects = (body as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects) || projects.length === 0) {
    return NextResponse.json({ error: '"projects" must be a non-empty array' }, { status: 400 });
  }
  if (projects.length > MAX_PROJECTS_PER_REQUEST) {
    return NextResponse.json({ error: `"projects" exceeds the ${MAX_PROJECTS_PER_REQUEST}-record limit per request` }, { status: 400 });
  }

  const validated: ProjectCardInput[] = [];
  const errors: { projectCode?: string; message: string }[] = [];
  for (const raw of projects) {
    try {
      validated.push(validateProjectCardInput(raw));
    } catch (error) {
      const projectCode = typeof (raw as { projectCode?: unknown })?.projectCode === "string" ? (raw as { projectCode: string }).projectCode : undefined;
      errors.push({ projectCode, message: error instanceof Error ? error.message : "Invalid record" });
    }
  }

  let created = 0;
  let updated = 0;
  // Never overwrites a human-confirmed budget with a fresh AI guess — see
  // CONTEXT.md's Budget entry ("never shown as authoritative before [a
  // person confirms it]"). Re-crawls still refresh the rest of the card.
  let skippedVerifiedBudget = 0;
  // Same rule for Category/Tags/Work Types a person set in the popup (CONTEXT.md's
  // Description Source entry: person edits are never overwritten).
  let skippedPersonClassification = 0;
  // And for a Description a person edited (Description Source `manual`).
  let skippedManualDescription = 0;

  // Prisma's interactive-transaction default timeout (5000ms) isn't enough
  // once the batch is large: the real PS share crawl pushes 100s of records
  // in one request, each needing a findUnique + create/update round trip,
  // which took just over 5s against this app's single-connection pool
  // (lib/prisma.ts's max: 1) and threw P2028 mid-run — found by testing
  // against the actual crawl output, not a hypothetical. 60s gives ample
  // headroom over today's real volume without over-provisioning for the
  // 5000-record defensive cap above, which isn't real expected load.
  await prisma.$transaction(async (tx) => {
    for (const project of validated) {
      const existing = await tx.projectCard.findUnique({ where: { projectCode: project.projectCode } });
      if (!existing) {
        await tx.projectCard.create({
          data: {
            projectCode: project.projectCode,
            client: project.client,
            projectName: project.projectName,
            descriptionTh: project.descriptionTh,
            descriptionEn: project.descriptionEn,
            descriptionSource: project.descriptionSource,
            contractPath: project.contractPath,
            certificatePath: project.certificatePath,
            projectFolderPath: project.projectFolderPath,
            budgetAmount: project.budgetAmount,
            budgetSource: project.budgetSource,
            vatStatus: project.vatStatus,
            budgetNote: project.budgetNote,
            year: project.year,
            category: project.category,
            tags: project.tags,
            workTypes: project.workTypes,
          },
        });
        created++;
        continue;
      }

      if (existing.budgetVerified) skippedVerifiedBudget++;
      const sendsClassification =
        project.category !== null || project.tags.length > 0 || project.workTypes.length > 0;
      if (existing.classificationEditedByPerson && sendsClassification) skippedPersonClassification++;
      const descriptionIsManual = existing.descriptionSource === "manual";
      if (descriptionIsManual && project.descriptionSource !== null) skippedManualDescription++;
      await tx.projectCard.update({
        where: { projectCode: project.projectCode },
        data: {
          client: project.client,
          projectName: project.projectName,
          // A Description a person edited is never touched; otherwise a
          // blank language keeps what's stored and the source follows the
          // language(s) actually sent.
          ...(descriptionIsManual
            ? {}
            : {
                descriptionTh: preserveIfBlank(existing.descriptionTh, project.descriptionTh),
                descriptionEn: preserveIfBlank(existing.descriptionEn, project.descriptionEn),
                descriptionSource: preserveIfNull(existing.descriptionSource, project.descriptionSource),
              }),
          // Same reasoning as description/year above: a project read from
          // only one document type this pass (see the pilot table in
          // PROJECT-CARD-BID-PIVOT-2026-09-21.md — most projects have just
          // one of Contract/Work Certificate read at a time) must not have
          // the other document's already-recorded path erased.
          contractPath: preserveIfNull(existing.contractPath, project.contractPath),
          certificatePath: preserveIfNull(existing.certificatePath, project.certificatePath),
          projectFolderPath: preserveIfNull(existing.projectFolderPath, project.projectFolderPath),
          budgetNote: preserveIfBlank(existing.budgetNote, project.budgetNote),
          year: preserveIfNull(existing.year, project.year),
          // budgetAmount/budgetSource/vatStatus travel together as one unit
          // (CONTEXT.md's Budget entry: a figure, where it came from, and
          // its VAT status are never presented separately). Once a person
          // has verified the number, a re-crawl must not change any of the
          // three. Before verification, a null budgetAmount still must not
          // clobber an earlier pass's reading — a project read from only
          // one document type this pass (see the pilot table in
          // PROJECT-CARD-BID-PIVOT-2026-09-21.md) can otherwise silently
          // erase a budget an earlier, more complete push already found.
          ...(existing.budgetVerified
            ? {}
            : {
                budgetAmount: preserveIfNull(existing.budgetAmount?.toNumber() ?? null, project.budgetAmount),
                budgetSource: preserveIfNull(existing.budgetSource, project.budgetSource),
                vatStatus: preserveIfNull(existing.vatStatus, project.vatStatus),
              }),
          // Absent Category/Tags/Work Types never erase what an earlier batch recorded;
          // a classification a person edited is never touched at all.
          ...(existing.classificationEditedByPerson ? {} : mergeClassification(existing, project)),
        },
      });
      updated++;
    }
  }, { timeout: 60_000 });

  return NextResponse.json({
    created,
    updated,
    skippedVerifiedBudget,
    skippedPersonClassification,
    skippedManualDescription,
    rejected: errors.length,
    errors,
  });
}

// Lets the crawler run in "only new projects" mode (PROJECT-CARD-BID-PIVOT
// -2026-09-21.md's step before reading the full ~168-contract set): fetch
// which Project Codes already have a card, then skip re-reading those
// documents this pass. Same ingest key as POST — this is still crawler-to-
// server traffic, not a browser request.
export async function GET(request: Request) {
  try {
    requireIngestKey(request);
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const cards = await prisma.projectCard.findMany({ select: { projectCode: true } });
  return NextResponse.json({ projectCodes: cards.map((c) => c.projectCode) });
}
