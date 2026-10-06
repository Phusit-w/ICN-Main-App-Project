import { NextResponse } from "next/server";
import { authorizeSocJob, socErrorStatus } from "@/lib/soc";
import { importLocalCheckRun } from "@/lib/soc-import";

export const runtime = "nodejs";

const MAX_RESULTS_BYTES = 10 * 1024 * 1024;

// Manual upload of one Local Check Run (phase 1): the results.json and
// SOC_Check document a reviewer got from running the skill in Claude Code.
// Any user who may open the job may import. Skill version and model come
// from the form, or else from the file's top-level `skill_version`/`model`.
export async function POST(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id, itemId } = await context.params;
    const { actor } = await authorizeSocJob(id);
    const form = await request.formData();
    const resultsFile = form.get("results");
    const socCheck = form.get("socCheck");
    if (!(resultsFile instanceof File) || resultsFile.size === 0) return NextResponse.json({ error: "กรุณาแนบไฟล์ results.json" }, { status: 400 });
    if (!(socCheck instanceof File) || socCheck.size === 0) return NextResponse.json({ error: "กรุณาแนบไฟล์ SOC_Check (.docx)" }, { status: 400 });
    if (resultsFile.size > MAX_RESULTS_BYTES) return NextResponse.json({ errors: ["ไฟล์ results.json ต้องมีขนาดไม่เกิน 10 MB"] }, { status: 422 });

    let results: unknown;
    try {
      results = JSON.parse(await resultsFile.text());
    } catch {
      return NextResponse.json({ errors: ["ไฟล์ results.json ไม่ใช่ JSON ที่อ่านได้"] }, { status: 422 });
    }
    const fromFile = (key: string) => {
      const value = typeof results === "object" && results !== null ? (results as Record<string, unknown>)[key] : undefined;
      return typeof value === "string" ? value : "";
    };
    const typed = (key: string) => String(form.get(key) || "").trim();

    const imported = await importLocalCheckRun(actor, {
      jobId: id,
      majorItemId: itemId,
      results,
      socCheck: { name: socCheck.name, bytes: new Uint8Array(await socCheck.arrayBuffer()) },
      run: { skillVersion: typed("skillVersion") || fromFile("skill_version"), model: typed("model") || fromFile("model"), source: "manual" },
    });
    if (!imported.ok) return NextResponse.json({ errors: imported.errors }, { status: 422 });
    return NextResponse.json({ runId: imported.runId, rowCount: imported.rowCount }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "นำเข้าผลตรวจไม่สำเร็จ";
    const status = socErrorStatus(message);
    return NextResponse.json({ error: status === 404 ? "ไม่พบงานตรวจหรือข้อใหญ่" : message }, { status });
  }
}
