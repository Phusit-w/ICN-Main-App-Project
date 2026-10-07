import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/authorization";
import { socErrorStatus } from "@/lib/soc";
import { createSocRunnerLink, socRunnerServerUrl } from "@/lib/soc-runner";
import { appendRunnerConfig, readSocRunnerInstaller, SOC_RUNNER_INSTALLER_FILE } from "@/lib/soc-runner-installer";

export const runtime = "nodejs";

// A signed-in user with `soc` access downloads the SOC Runner installer with
// their runner config appended (ticket 16): installing links that PC to them,
// and installing again (the repair path) replaces the previous link. POST,
// not GET, because it creates a link and revokes the previous one.
export async function POST(request: Request) {
  try {
    const actor = await requireAccess("soc");
    // Before linking, so a missing installer doesn't revoke a working link.
    const installer = await readSocRunnerInstaller();
    if (!installer) {
      return NextResponse.json({ error: "ยังไม่มีตัวติดตั้ง SOC Runner บน server ติดต่อ admin" }, { status: 503 });
    }
    const config = await createSocRunnerLink(actor, socRunnerServerUrl(request));
    return new NextResponse(new Uint8Array(appendRunnerConfig(installer, config)), {
      headers: {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": `attachment; filename="${SOC_RUNNER_INSTALLER_FILE}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = socErrorStatus(message);
    if (status === 400) {
      console.error("[soc-runner-installer]", error);
      return NextResponse.json({ error: "สร้างตัวติดตั้ง SOC Runner ไม่สำเร็จ" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
