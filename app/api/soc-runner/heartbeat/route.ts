import { NextResponse } from "next/server";
import { socErrorStatus } from "@/lib/soc";
import { authenticateSocRunner, parseSocRunnerHeartbeat, recordSocRunnerHeartbeat } from "@/lib/soc-runner";

export const runtime = "nodejs";

// SOC Runner heartbeat (docs/SOC-RUNNER.md). Bearer token from the runner
// config; body { runnerVersion, claudeLogin }. 200 { ok, username,
// serverTime }, 401 for a missing/unknown/revoked token, 403 when the user
// lost `soc` access, 400 for a bad body. proxy.ts lets /api/soc-runner/*
// through without a session: the token is checked here.
export async function POST(request: Request) {
  try {
    const link = await authenticateSocRunner(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const heartbeat = parseSocRunnerHeartbeat(body);
    if (!heartbeat) return NextResponse.json({ error: "runnerVersion (A-Z a-z 0-9 . _ + -, up to 64) and claudeLogin (logged_in | logged_out | unknown) are required" }, { status: 400 });
    const { lastSeenAt } = await recordSocRunnerHeartbeat(link.id, heartbeat);
    return NextResponse.json({ ok: true, username: link.user.username, serverTime: lastSeenAt.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = socErrorStatus(message);
    if (status === 400) {
      console.error("[soc-runner]", error);
      return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
