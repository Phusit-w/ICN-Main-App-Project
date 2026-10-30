import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeProposal } from "@/lib/proposal";
import { addProposalDatasheets, datasheetTotals } from "@/lib/proposal-datasheet";
import { uploadFailure } from "@/lib/proposal-http";
import { evidenceUploads, validateEvidenceBatch, validateUpload } from "@/lib/soc";

export const runtime = "nodejs";

// Adds Datasheet PDFs, folders kept (one browser batch per request). Anyone
// with SOC access may add them to any live Proposal.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await authorizeProposal(id);
    const uploads = evidenceUploads(await request.formData());
    validateEvidenceBatch(uploads.map((upload) => upload.file), await datasheetTotals(id));
    const bytes = await Promise.all(uploads.map((upload) => validateUpload(upload.file, "EVIDENCE")));
    const added = await addProposalDatasheets(id, uploads.map((upload, i) => ({ name: upload.name, bytes: bytes[i] })));
    revalidatePath(`/soc/proposals/${id}`); revalidatePath("/soc");
    return NextResponse.json({ added }, { status: 201 });
  } catch (error) {
    return uploadFailure(error, { what: "Proposal Datasheet upload", ocrConfirm: "", fallback: "เพิ่ม Datasheet ไม่สำเร็จ" });
  }
}
