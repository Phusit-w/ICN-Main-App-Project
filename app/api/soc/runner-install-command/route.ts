import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/authorization";
import { socErrorStatus } from "@/lib/soc";
import { socRunnerServerUrl } from "@/lib/soc-runner";
import { createSocRunnerInstallCommand } from "@/lib/soc-runner-install";

export const runtime = "nodejs";

// A signed-in user with `soc` access gets the one-line PowerShell command
// that installs (or repairs) their SOC Runner (ticket 16). POST: it makes a
// one-time code. Nothing is linked until the command runs.
export async function POST(request: Request) {
  try {
    const actor = await requireAccess("soc");
    const body = await createSocRunnerInstallCommand(actor, socRunnerServerUrl(request));
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = socErrorStatus(message);
    if (status === 400) {
      console.error("[soc-runner-install-command]", error);
      return NextResponse.json({ error: "สร้างคำสั่งติดตั้ง SOC Runner ไม่สำเร็จ" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
