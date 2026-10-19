import { NextResponse } from "next/server";
import { authorizeSocJob, OCR_CONFIRM_REQUIRED, socErrorStatus, validateUpload } from "@/lib/soc";
import { attachTorOriginal } from "@/lib/soc-tor";

export const runtime = "nodejs";

// Attaches the TOR ต้นฉบับ of an Imported SOC Check, replacing the one it
// had, and compares it with the SOC (TOR Match). Anyone who may open the job
// may attach one, as anyone may add evidence. A scanned TOR is refused with
// needsOcrConfirm until the form is sent again with ocrConfirmed=1.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { actor, job } = await authorizeSocJob(id);
    const form = await request.formData();
    const file = form.get("tor");
    if (!(file instanceof File) || file.size === 0) throw new Error("กรุณาเลือกไฟล์ PDF ของ TOR ต้นฉบับ");
    const bytes = await validateUpload(file, "EVIDENCE");
    const result = await attachTorOriginal(actor, job, { name: file.name, bytes }, { ocrConfirmed: form.get("ocrConfirmed") === "1" });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === OCR_CONFIRM_REQUIRED) return NextResponse.json({ error: "TOR ต้นฉบับนี้ต้องยืนยันการส่งไป OCR ภายนอกก่อน", needsOcrConfirm: true }, { status: 409 });
    const status = socErrorStatus(message);
    // A message for the reviewer is Thai; anything else is a fault, logged and shown plainly.
    const forReviewer = /[฀-๿]/.test(message);
    if (status === 400 && !forReviewer) console.error("TOR Match attach failed", error);
    return NextResponse.json({ error: status === 404 ? "ไม่พบงานตรวจ" : forReviewer ? message : "แนบ TOR ต้นฉบับไม่สำเร็จ" }, { status });
  }
}
