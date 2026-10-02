import { prisma } from "@/lib/prisma";
import type { Taxonomy, Term, TermKind } from "@/lib/project-card-taxonomy";

// Loads the Category/Tag and Work Type lists (ProjectCardTerm) in display
// order. Server-only: pages pass the result down to client components, and
// the ingest API / save action validate against it. Read per request, so an
// entry an admin just added is accepted immediately.
export async function loadTaxonomy(): Promise<Taxonomy> {
  const rows = await prisma.projectCardTerm.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { kind: true, value: true, en: true, th: true },
  });
  const pick = (kind: TermKind): Term[] =>
    rows.filter((r) => r.kind === kind).map(({ value, en, th }) => ({ value, en, th }));
  return { categories: pick("category"), workTypes: pick("workType") };
}
