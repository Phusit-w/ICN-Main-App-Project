import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeProposal } from "@/lib/proposal";
import { uploadFailure } from "@/lib/proposal-http";
import { attachSocVersion } from "@/lib/proposal-soc";
import { validateUpload } from "@/lib/soc";

export const runtime = "nodejs";

// Uploads a SOC (Word, Excel or PDF, text or scanned) as the Proposal's next
// SOC Version. A scanned PDF is refused with needsOcrConfirm until the form is
// sent again with ocrConfirmed=1; it then reads in the background.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { actor, proposal } = await authorizeProposal(id);
    const form = await request.formData();
    const file = form.get("soc");
    if (!(file instanceof File) || file.size === 0) throw new Error("กรุณาเลือกไฟล์ SOC (Word, Excel หรือ PDF)");
    const bytes = await validateUpload(file, "SOC");
    const result = await attachSocVersion(actor, proposal, { name: file.name, bytes }, { ocrConfirmed: form.get("ocrConfirmed") === "1" });
    revalidatePath(`/soc/proposals/${id}`); revalidatePath("/soc");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return uploadFailure(error, { what: "Proposal SOC upload", ocrConfirm: "SOC นี้เป็น PDF แบบสแกน ต้องยืนยันการส่งไป OCR ภายนอกก่อน", fallback: "อัปโหลด SOC ไม่สำเร็จ" });
  }
}
