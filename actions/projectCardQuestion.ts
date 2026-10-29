"use server";

import { redirect } from "next/navigation";
import { requireRole, writeAudit } from "@/lib/authorization";
import { loadTaxonomy } from "@/lib/project-card-terms";
import { translateQuestion } from "@/lib/question-search";
import { questionSearchModel } from "@/lib/question-search-model";

const MAX_QUESTION = 500;

// ถามด้วยประโยค on ค้นหาโครงการ (Question Search): the question → the
// ordinary search URL with the filters it produced, plus the question itself
// (`ask`) so the page can show it. Never adds to the filters in use: the
// redirect carries only what this question produced. Admins only during the
// trial, and only while the model is configured. Every question is logged.
export async function askProjectCardQuestion(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const model = questionSearchModel();
  if (!model) throw new Error("FORBIDDEN");
  const question = String(formData.get("question") ?? "").trim().slice(0, MAX_QUESTION);
  if (!question) redirect("/project-card");

  const started = Date.now();
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date()));
  const answer = await translateQuestion(question, await loadTaxonomy(), year);
  await writeAudit({
    actorId: actor.id,
    action: "project-card.question-search",
    entityType: "PROJECT_CARD",
    summary: question,
    metadata: {
      filters: answer.filters,
      unsupported: answer.unsupported,
      fellBack: answer.fellBack,
      ...(answer.reason ? { reason: answer.reason } : {}),
      model,
      ms: Date.now() - started,
    },
  });
  redirect(`/project-card?${new URLSearchParams({ ...answer.filters, ask: question })}`);
}
