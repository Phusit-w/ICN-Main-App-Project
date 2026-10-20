// The HTTP response of a job's Excel download (results Excel, TOR Match
// Excel): any user who may open the job may download; 409 with the reason
// while there is nothing to download. Server-only.
import { NextResponse } from "next/server";
import { authorizeSocJob, socErrorStatus } from "@/lib/soc";
import { XLSX_MIME, type SocExcelFile } from "@/lib/soc-results-excel";

export async function socExcelResponse(context: { params: Promise<{ id: string }> }, build: (actor: { id: string }, id: string) => Promise<SocExcelFile>) {
  try {
    const { id } = await context.params;
    const { actor } = await authorizeSocJob(id);
    const built = await build(actor, id);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 409 });
    return new NextResponse(Buffer.from(built.bytes), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(built.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ดาวน์โหลด Excel ไม่สำเร็จ";
    const status = socErrorStatus(message);
    if (status === 400) return NextResponse.json({ error: message }, { status: 500 });
    return NextResponse.json({ error: status === 404 ? "ไม่พบงานตรวจ" : message }, { status });
  }
}
