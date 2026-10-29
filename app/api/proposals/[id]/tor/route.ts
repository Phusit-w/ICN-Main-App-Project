import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authorizeProposal } from "@/lib/proposal";
import { downloadFailure, fileResponse, uploadFailure } from "@/lib/proposal-http";
import { attachProposalTor } from "@/lib/proposal-tor";
import { resolveStorageKey, validateUpload } from "@/lib/soc";

export const runtime = "nodejs";

// Uploads the Proposal's TOR (the first one, or a replacement). A scanned TOR
// is refused with needsOcrConfirm until the form is sent again with
// ocrConfirmed=1.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorizeProposal(id);
    const form = await request.formData();
    const file = form.get("tor");
    if (!(file instanceof File) || file.size === 0) throw new Error("กรุณาเลือกไฟล์ PDF ของ TOR");
    const bytes = await validateUpload(file, "EVIDENCE");
    const result = await attachProposalTor(id, { name: file.name, bytes }, { ocrConfirmed: form.get("ocrConfirmed") === "1" });
    revalidatePath(`/soc/proposals/${id}`); revalidatePath("/soc");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return uploadFailure(error, { what: "Proposal TOR upload", ocrConfirm: "TOR นี้ต้องยืนยันการส่งไป OCR ภายนอกก่อน", fallback: "อัปโหลด TOR ไม่สำเร็จ" });
  }
}

// The TOR PDF, shown in the browser.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorizeProposal(id);
    const tor = await prisma.proposalTor.findUnique({ where: { proposalId: id } });
    if (!tor) return new NextResponse("Not found", { status: 404 });
    return fileResponse(await readFile(resolveStorageKey(tor.storageKey)), { mimeType: tor.mimeType, name: tor.originalName, disposition: "inline" });
  } catch (error) {
    return downloadFailure(error);
  }
}
