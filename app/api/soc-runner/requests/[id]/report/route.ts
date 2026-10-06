import { NextResponse } from "next/server";
import { authenticateSocRunner } from "@/lib/soc-runner";
import { parseCheckRequestReport, reportCheckRequest } from "@/lib/soc-check-requests";
import { socRunnerErrorResponse } from "@/lib/soc-runner-http";

export const runtime = "nodejs";

// The runner reports on a Check Request it is running (docs/SOC-RUNNER.md):
// { state: "running", progress? } | { state: "paused_quota", resumeAt,
// progress? } | { state: "needs_documents", missingDocuments } |
// { state: "failed", reason } | { state: "needs_login" }. 200 { ok }, 400 for
// a bad body (nothing recorded), 409 NOT_CLAIMED when it no longer runs it.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const link = await authenticateSocRunner(request);
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const report = parseCheckRequestReport(body);
    if ("error" in report) return NextResponse.json({ error: report.error }, { status: 400 });
    await reportCheckRequest(link, id, report);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socRunnerErrorResponse(error);
  }
}
