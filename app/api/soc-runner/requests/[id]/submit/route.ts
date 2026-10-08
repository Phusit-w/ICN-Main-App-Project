import { NextResponse } from "next/server";
import { authenticateSocRunner } from "@/lib/soc-runner";
import { submitCheckRequest } from "@/lib/soc-check-requests";
import { socRunnerErrorResponse } from "@/lib/soc-runner-http";

export const runtime = "nodejs";

const MAX_RESULTS_BYTES = 10 * 1024 * 1024;

// The runner submits a finished Local Check Run for a request it is running
// (docs/SOC-RUNNER.md): multipart `results` (results.json), `socCheck`
// (.docx), `skillVersion` (else the pinned package's version), `model` and,
// when the item ran without the evidence packet, `packetFallback` (why).
// It goes through the same import as a manual upload: 201 { runId,
// rowCount }, or 422/409 { errors } and the request is closed as failed.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const link = await authenticateSocRunner(request);
    const { id } = await context.params;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "multipart/form-data with results and socCheck is required" }, { status: 400 });
    }
    const resultsFile = form.get("results");
    const socCheck = form.get("socCheck");
    if (!(resultsFile instanceof File) || resultsFile.size === 0 || !(socCheck instanceof File) || socCheck.size === 0) {
      return NextResponse.json({ error: "results (results.json) and socCheck (.docx) files are required" }, { status: 400 });
    }
    // Too large or not JSON: passed on as null, so the import rejects it like
    // any malformed results file (and the request is closed as failed).
    let results: unknown = null;
    if (resultsFile.size <= MAX_RESULTS_BYTES) {
      try {
        results = JSON.parse(await resultsFile.text());
      } catch {
        results = null;
      }
    }
    const imported = await submitCheckRequest(link, id, {
      results,
      socCheck: { name: socCheck.name, bytes: new Uint8Array(await socCheck.arrayBuffer()) },
      skillVersion: String(form.get("skillVersion") || "").trim(),
      model: String(form.get("model") || "").trim(),
      packetFallback: String(form.get("packetFallback") || "").trim(),
    });
    if (!imported.ok) {
      return NextResponse.json(
        { errors: imported.errors, ...(imported.confirmedRows ? { confirmedRows: imported.confirmedRows } : {}) },
        { status: imported.confirmedRows ? 409 : 422 },
      );
    }
    return NextResponse.json({ runId: imported.runId, rowCount: imported.rowCount }, { status: 201 });
  } catch (error) {
    return socRunnerErrorResponse(error);
  }
}
