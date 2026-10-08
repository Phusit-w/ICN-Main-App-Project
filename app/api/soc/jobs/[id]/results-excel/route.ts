import { NextResponse } from "next/server";
import { authorizeSocJob, socErrorStatus } from "@/lib/soc";
import { downloadSocResultsExcel, XLSX_MIME } from "@/lib/soc-results-excel";

export const runtime = "nodejs";

// The job's results as Excel: the whole job (summary + one sheet per checked
// major item), or one major item with `?item=<majorItemId>` (one sheet). Any
// user who may open the job may download it; every download is audited. 409
// while there is nothing checked to download.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { actor } = await authorizeSocJob(id);
    const item = new URL(request.url).searchParams.get("item");
    const built = await downloadSocResultsExcel(actor, id, item || null);
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
    const message = error instanceof Error ? error.message : "ดาวน์โหลดผลตรวจ Excel ไม่สำเร็จ";
    const status = socErrorStatus(message);
    if (status === 400) return NextResponse.json({ error: message }, { status: 500 });
    return NextResponse.json({ error: status === 404 ? "ไม่พบงานตรวจ" : message }, { status });
  }
}
