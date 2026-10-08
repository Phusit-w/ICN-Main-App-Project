import { NextResponse } from "next/server";
import { authorizeSocJob, socErrorStatus } from "@/lib/soc";
import { downloadPickedSocResultsExcel, downloadSocResultsExcel, MAX_PICKED_ROWS, XLSX_MIME, type SocResultsExcel } from "@/lib/soc-results-excel";

export const runtime = "nodejs";

// The job's results as Excel: the whole job (summary + one sheet per checked
// major item), or one major item with `?item=<majorItemId>` (one sheet). Any
// user who may open the job may download it; every download is audited. 409
// while there is nothing checked to download.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(context, (actor, id) => downloadSocResultsExcel(actor, id, new URL(request.url).searchParams.get("item") || null));
}

// The rows picked on the review page, as one sheet: { resultIds } in the
// page's order. POST because a long list of ids doesn't fit IIS's query limit.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let resultIds: string[];
  try {
    const body = await request.json();
    resultIds = Array.isArray(body?.resultIds) ? body.resultIds.filter((id: unknown): id is string => typeof id === "string") : [];
  } catch {
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  }
  if (!resultIds.length || resultIds.length > MAX_PICKED_ROWS) return NextResponse.json({ error: `เลือก 1–${MAX_PICKED_ROWS.toLocaleString("en-US")} แถว` }, { status: 400 });
  return respond(context, (actor, id) => downloadPickedSocResultsExcel(actor, id, resultIds));
}

async function respond(context: { params: Promise<{ id: string }> }, build: (actor: { id: string }, id: string) => Promise<SocResultsExcel>) {
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
    const message = error instanceof Error ? error.message : "ดาวน์โหลดผลตรวจ Excel ไม่สำเร็จ";
    const status = socErrorStatus(message);
    if (status === 400) return NextResponse.json({ error: message }, { status: 500 });
    return NextResponse.json({ error: status === 404 ? "ไม่พบงานตรวจ" : message }, { status });
  }
}
