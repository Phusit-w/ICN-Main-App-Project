import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProposal } from "@/lib/proposal";
import { resolveStorageKey, socErrorStatus } from "@/lib/soc";
import { pdfPageResponse } from "@/lib/soc-pdf-page";

export const runtime = "nodejs";

// One page of one of the Proposal's Datasheets as a PNG, highlights included,
// for the กรอกอ้างอิง review table (the same render the review page's evidence
// panel uses). Any SOC user may see it. Not audited per page.
export async function GET(_request: Request, context: { params: Promise<{ id: string; datasheetId: string; page: string }> }) {
  try {
    const { id, datasheetId, page } = await context.params;
    await authorizeProposal(id);
    const datasheet = await prisma.proposalDatasheet.findUnique({ where: { id: datasheetId } });
    if (!datasheet || datasheet.proposalId !== id) return NextResponse.json({ error: "ไม่พบ Datasheet นี้ใน Proposal" }, { status: 404 });
    return await pdfPageResponse(resolveStorageKey(datasheet.storageKey), datasheet.originalName, page);
  } catch (error) {
    const status = socErrorStatus(error instanceof Error ? error.message : "");
    if (status === 401) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status });
    if (status === 403) return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน SOC" }, { status });
    if (status === 404) return NextResponse.json({ error: "ไม่พบ Proposal" }, { status });
    return NextResponse.json({ error: "แสดงหน้าเอกสารไม่สำเร็จ" }, { status: 500 });
  }
}
