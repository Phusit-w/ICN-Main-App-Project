import { NextResponse } from "next/server";
import { authenticateSocRunner } from "@/lib/soc-runner";
import { runnerRequestSkill } from "@/lib/soc-check-requests";
import { socRunnerErrorResponse } from "@/lib/soc-runner-http";
import { socSkillDownloadName } from "@/lib/soc-skill-package";

export const runtime = "nodejs";

// The Skill Package pinned when this runner claimed the request, with its
// version in X-Soc-Skill-Version (to send back with the results).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const link = await authenticateSocRunner(request);
    const { id } = await context.params;
    const { record, bytes } = await runnerRequestSkill(link, id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${socSkillDownloadName(record)}"`,
        "Cache-Control": "private, no-store",
        "X-Soc-Skill-Version": record.version,
        "X-Soc-Checksum": record.checksum,
      },
    });
  } catch (error) {
    return socRunnerErrorResponse(error);
  }
}
