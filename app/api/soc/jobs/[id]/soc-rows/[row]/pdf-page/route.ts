import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeSocJob, resolveStorageKey, socErrorStatus } from "@/lib/soc";
import { jobSocDocument, readJobSoc, socRowPage } from "@/lib/soc-import";
import { pdfPageResponse } from "@/lib/soc-pdf-page";

export const runtime = "nodejs";

// The page of the PDF SOC that SOC row `row` (with `?item=` as the review
// page has them) was read from, as a PNG, for the review page's "ดูหน้า PDF
// SOC" (soc-pdf-soc ticket 04), so the reviewer can see the table was read
// right. Whoever may open the job may see it. A job without a source PDF, or
// a row it has no page for, answers 404.
// Not audited per page: looking at the SOC while reviewing isn't a download.
export async function GET(request: Request, context: { params: Promise<{ id: string; row: string }> }) {
  try {
    const { id, row } = await context.params;
    const { job } = await authorizeSocJob(id);
    const item = new URL(request.url).searchParams.get("item") ?? "";
    const document = await prisma.socDocument.findFirst({ where: { jobId: id, type: "SOC_SOURCE_PDF" } });
    const page = document && /^\d{1,6}$/.test(row) ? socRowPage(await readJobSoc(await jobSocDocument(id)), job.socRowPages, Number(row), item) : null;
    if (!document || !page) return NextResponse.json({ error: "ไม่พบหน้า PDF SOC ของแถวนี้" }, { status: 404 });
    return await pdfPageResponse(resolveStorageKey(document.storageKey), document.originalName, String(page));
  } catch (error) {
    const status = socErrorStatus(error instanceof Error ? error.message : "");
    if (status === 401) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status });
    if (status === 403) return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน SOC" }, { status });
    if (status === 404) return NextResponse.json({ error: "ไม่พบงานตรวจ" }, { status });
    return NextResponse.json({ error: "แสดงหน้า PDF SOC ไม่สำเร็จ" }, { status: 500 });
  }
}
