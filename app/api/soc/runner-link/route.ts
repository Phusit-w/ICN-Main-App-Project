import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/authorization";
import { socErrorStatus } from "@/lib/soc";
import { createSocRunnerLink, socRunnerServerUrl } from "@/lib/soc-runner";
import { SOC_RUNNER_CONFIG_FILE } from "@/lib/soc-shared";

export const runtime = "nodejs";

// A signed-in user with `soc` access downloads their SOC Runner config
// (soc-runner.json), already tied to their account. POST, not GET, because
// it creates a link and revokes the previous one; /soc submits a form.
export async function POST(request: Request) {
  try {
    const actor = await requireAccess("soc");
    const config = await createSocRunnerLink(actor, socRunnerServerUrl(request));
    return new NextResponse(`${JSON.stringify(config, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${SOC_RUNNER_CONFIG_FILE}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = socErrorStatus(message);
    // Only the access errors are expected here; anything else is a server
    // fault, logged rather than shown.
    if (status === 400) {
      console.error("[soc-runner-link]", error);
      return NextResponse.json({ error: "สร้างไฟล์เชื่อม SOC Runner ไม่สำเร็จ" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
