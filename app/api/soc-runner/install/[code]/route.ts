import { socRunnerServerUrl } from "@/lib/soc-runner";
import { socRunnerInstallScript } from "@/lib/soc-runner-install";

export const runtime = "nodejs";

// The install script for the one-time code in the command /soc gives a user
// (ticket 16), fetched by Windows PowerShell's `iex (irm …)`: no session, the
// code is the proof (proxy.ts lets a well-formed one through). A GET that
// links the runner, because irm is what the user can paste; the code works
// once. A refused code still gets 200 and a script that says why, since a
// failed irm would only show PowerShell's own error.
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  try {
    const script = await socRunnerInstallScript(code, socRunnerServerUrl(request));
    return new Response(script, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[soc-runner-install]", error);
    return new Response("Write-Host 'server error: install failed, tell the admin' -ForegroundColor Red\n", {
      status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
}
