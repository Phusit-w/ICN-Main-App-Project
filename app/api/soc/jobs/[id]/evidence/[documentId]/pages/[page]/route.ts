import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeSocJob, resolveStorageKey, socErrorStatus } from "@/lib/soc";
import { renderPdfPage } from "@/lib/soc-pdf-page";

export const runtime = "nodejs";

// One page of one of the job's evidence PDFs as a PNG, highlights included,
// for the review page's evidence panel (ticket 09). Whoever may open the job
// may see its pages. A page the PDF doesn't have answers 404 and a PDF that
// can't be read answers 422, each with a Thai message the panel shows.
// Not audited per page: viewing evidence while reviewing isn't a download.
export async function GET(_request: Request, context: { params: Promise<{ id: string; documentId: string; page: string }> }) {
  try {
    const { id, documentId, page } = await context.params;
    await authorizeSocJob(id);
    const document = await prisma.socDocument.findFirst({ where: { id: documentId, jobId: id, type: "EVIDENCE" } });
    if (!document) return NextResponse.json({ error: "ไม่พบเอกสารอ้างอิงนี้ในงานตรวจ" }, { status: 404 });

    const unreadable = NextResponse.json({ error: `อ่านไฟล์ ${document.originalName} ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่ PDF` }, { status: 422 });
    const pageNumber = /^\d{1,5}$/.test(page) ? Number(page) : NaN;
    let bytes: Uint8Array;
    try {
      bytes = await readFile(resolveStorageKey(document.storageKey));
    } catch {
      return unreadable;
    }
    const rendered = renderPdfPage(bytes, pageNumber);
    if (!rendered.ok && rendered.reason === "unreadable") return unreadable;
    if (!rendered.ok) {
      const total = rendered.pageCount ? ` (ไฟล์นี้มีทั้งหมด ${rendered.pageCount} หน้า)` : "";
      return NextResponse.json({ error: `ไม่พบหน้า ${page} ใน ${document.originalName}${total}` }, { status: 404 });
    }
    return new NextResponse(Buffer.from(rendered.png), {
      headers: {
        "Content-Type": "image/png",
        // The file behind a document id never changes, so a viewer paging
        // back and forth needn't re-render it; private keeps it off shared
        // caches, and 5 minutes bounds how long a revoked user still sees it.
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = socErrorStatus(error instanceof Error ? error.message : "");
    if (status === 401) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status });
    if (status === 403) return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน SOC" }, { status });
    if (status === 404) return NextResponse.json({ error: "ไม่พบงานตรวจ" }, { status });
    return NextResponse.json({ error: "แสดงหน้าเอกสารไม่สำเร็จ" }, { status: 500 });
  }
}
