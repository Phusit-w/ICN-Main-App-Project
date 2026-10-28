import { NextResponse } from "next/server";
import { socBuilderError } from "@/lib/soc-builder-http";
import { downloadSocBuild } from "@/lib/soc-builds";

export const runtime = "nodejs";

// The Generated SOC Draft as SOC-<title>.docx, for the build's owner or an
// ADMIN. 409 while the build has no draft yet.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const draft = await downloadSocBuild((await context.params).id);
    if (!draft) return NextResponse.json({ error: "ยังไม่มีไฟล์ SOC ให้ดาวน์โหลด" }, { status: 409 });
    return new NextResponse(Buffer.from(draft.bytes), {
      headers: {
        "Content-Type": draft.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(draft.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return socBuilderError(error, "ดาวน์โหลด SOC ไม่สำเร็จ");
  }
}
