import { NextResponse } from "next/server";
import { OCR_CONFIRM_REQUIRED, requireSocActor, validateUpload } from "@/lib/soc";
import { socBuilderError } from "@/lib/soc-builder-http";
import { createSocBuild, listSocBuilds } from "@/lib/soc-builds";

export const runtime = "nodejs";

// The signed-in user's own builds, newest first.
export async function GET() {
  try {
    return NextResponse.json({ builds: await listSocBuilds(await requireSocActor()) });
  } catch (error) {
    return socBuilderError(error, "โหลดรายการ SOC ที่สร้างไม่สำเร็จ");
  }
}

// Creates a build from a TOR (form fields `tor`, `pageRanges`, optional
// `title`) and a template: `templateId` of the shared list, or `template`, a
// .docx for this build only. A text TOR answers when the draft is ready
// (READY). A scanned TOR is refused with needsOcrConfirm until the form is
// sent again with ocrConfirmed=1, then answers at once (QUEUED): it is read in
// the background.
export async function POST(request: Request) {
  try {
    const actor = await requireSocActor();
    const form = await request.formData();
    const tor = form.get("tor");
    if (!(tor instanceof File) || tor.size === 0) throw new Error("กรุณาเลือกไฟล์ PDF ของ TOR");
    const uploaded = form.get("template");
    const templateId = form.get("templateId");
    const template = uploaded instanceof File && uploaded.size > 0
      ? { file: { name: uploaded.name, bytes: new Uint8Array(await uploaded.arrayBuffer()) } }
      : typeof templateId === "string" && templateId ? { id: templateId } : null;
    if (!template) throw new Error("กรุณาเลือกเทมเพลต SOC จากรายการ หรืออัปโหลดไฟล์เทมเพลต");
    const build = await createSocBuild(
      actor,
      {
        title: form.get("title"),
        tor: { name: tor.name, bytes: await validateUpload(tor, "EVIDENCE") },
        pageRanges: String(form.get("pageRanges") ?? ""),
        template,
      },
      { ocrConfirmed: form.get("ocrConfirmed") === "1" },
    );
    return NextResponse.json({ id: build.id, title: build.title, status: build.status, rowCount: build.rowCount, warnings: build.warnings }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === OCR_CONFIRM_REQUIRED) return NextResponse.json({ error: "TOR นี้ต้องยืนยันการส่งไป OCR ภายนอกก่อน", needsOcrConfirm: true }, { status: 409 });
    return socBuilderError(error, "สร้าง SOC ไม่สำเร็จ");
  }
}
