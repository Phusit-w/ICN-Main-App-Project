import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProposal } from "@/lib/proposal";
import { attachProposalTor } from "@/lib/proposal-tor";
import { OCR_CONFIRM_REQUIRED, resolveStorageKey, socErrorStatus, validateUpload } from "@/lib/soc";
import { revalidatePath } from "next/cache";

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
    const message = error instanceof Error ? error.message : "";
    if (message === OCR_CONFIRM_REQUIRED) return NextResponse.json({ error: "TOR นี้ต้องยืนยันการส่งไป OCR ภายนอกก่อน", needsOcrConfirm: true }, { status: 409 });
    const status = socErrorStatus(message);
    // A message for the user is Thai; anything else is a fault, logged and shown plainly.
    const forUser = /[฀-๿]/.test(message);
    if (status === 400 && !forUser) console.error("Proposal TOR upload failed", error);
    return NextResponse.json({ error: status === 404 ? "ไม่พบ Proposal" : forUser ? message : "อัปโหลด TOR ไม่สำเร็จ" }, { status });
  }
}

// The TOR PDF, shown in the browser.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorizeProposal(id);
    const tor = await prisma.proposalTor.findUnique({ where: { proposalId: id } });
    if (!tor) return new NextResponse("Not found", { status: 404 });
    const bytes = await readFile(resolveStorageKey(tor.storageKey));
    const safeName = (tor.originalName.split("/").pop() || "tor.pdf").replace(/[\r\n"]/g, "_");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": tor.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 404;
    return new NextResponse(status === 401 ? "Unauthorized" : "Not found", { status });
  }
}
