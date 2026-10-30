import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { startProposalBuild } from "@/lib/proposal-build";
import { uploadFailure } from "@/lib/proposal-http";
import { buildTemplateFromForm } from "@/lib/soc-builder-http";

export const runtime = "nodejs";

// Starts a build from the Proposal's TOR (form fields `pageRanges`, optional
// `title`, and `templateId` or `template` as for /api/soc/builds). A scanned
// TOR is refused with needsOcrConfirm until the form is sent again with
// ocrConfirmed=1. Anyone with SOC access may start one on any live Proposal.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const form = await request.formData();
    const build = await startProposalBuild(
      id,
      { title: form.get("title"), pageRanges: String(form.get("pageRanges") ?? ""), template: await buildTemplateFromForm(form) },
      { ocrConfirmed: form.get("ocrConfirmed") === "1" },
    );
    revalidatePath(`/soc/proposals/${id}`); revalidatePath("/soc");
    return NextResponse.json({ id: build.id, status: build.status, rowCount: build.rowCount }, { status: 201 });
  } catch (error) {
    return uploadFailure(error, { what: "Proposal build", ocrConfirm: "TOR นี้ต้องยืนยันการส่งไป OCR ภายนอกก่อน", fallback: "สร้าง SOC ไม่สำเร็จ" });
  }
}
