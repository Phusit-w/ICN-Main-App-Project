import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeSocJob, resolveStorageKey, socErrorStatus } from "@/lib/soc";
import { pdfPageResponse } from "@/lib/soc-pdf-page";
import { TOR_DOCUMENT } from "@/lib/soc-tor";

export const runtime = "nodejs";

// One page of the job's TOR ต้นฉบับ as a PNG, for the TOR Match issue list's
// "TOR หน้า N" link (TOR Match 04), rendered as the evidence pages are.
// Whoever may open the job may see it. A page the PDF doesn't have answers
// 404 and a PDF that can't be read answers 422, each with a Thai message.
// Not audited per page.
export async function GET(_request: Request, context: { params: Promise<{ id: string; page: string }> }) {
  try {
    const { id, page } = await context.params;
    await authorizeSocJob(id);
    const document = await prisma.socDocument.findFirst({ where: { jobId: id, type: TOR_DOCUMENT } });
    if (!document) return NextResponse.json({ error: "งานตรวจนี้ยังไม่มี TOR ต้นฉบับ" }, { status: 404 });
    return await pdfPageResponse(resolveStorageKey(document.storageKey), document.originalName, page);
  } catch (error) {
    const status = socErrorStatus(error instanceof Error ? error.message : "");
    if (status === 401) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status });
    if (status === 403) return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน SOC" }, { status });
    if (status === 404) return NextResponse.json({ error: "ไม่พบงานตรวจ" }, { status });
    return NextResponse.json({ error: "แสดงหน้า TOR ต้นฉบับไม่สำเร็จ" }, { status: 500 });
  }
}
