import { NextResponse } from "next/server";
import { authenticateSocRunner } from "@/lib/soc-runner";
import { claimNextCheckRequest } from "@/lib/soc-check-requests";
import { socRunnerErrorResponse } from "@/lib/soc-runner-http";

export const runtime = "nodejs";

// The runner asks for its next Check Request (docs/SOC-RUNNER.md): 200
// { request } with what to check and where to fetch the files, or
// { request: null } when there is nothing to do. Only the token's own user's
// requests, oldest first. 409 NO_SKILL_PACKAGE when there is work but no
// current skill on the server.
export async function POST(request: Request) {
  try {
    const link = await authenticateSocRunner(request);
    return NextResponse.json({ request: await claimNextCheckRequest(link) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socRunnerErrorResponse(error);
  }
}
