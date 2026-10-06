import { NextResponse } from "next/server";
import { DOCX_MIME, authorizeSocJob, socErrorStatus } from "@/lib/soc";
import { downloadCombinedSocCheck } from "@/lib/soc-combined-check";

export const runtime = "nodejs";

// The job's combined SOC_Check document (ticket 10): the original SOC with
// the latest results of every checked major item appended. Any user who may
// open the job may download it; every download is audited. 409 while no
// major item is checked yet.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { actor } = await authorizeSocJob(id);
    const built = await downloadCombinedSocCheck(actor, id);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 409 });
    return new NextResponse(Buffer.from(built.bytes), {
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(built.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ดาวน์โหลด SOC_Check ไม่สำเร็จ";
    const status = socErrorStatus(message);
    if (status === 400) return NextResponse.json({ error: message }, { status: 500 });
    return NextResponse.json({ error: status === 404 ? "ไม่พบงานตรวจ" : message }, { status });
  }
}
