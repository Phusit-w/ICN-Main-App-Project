import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { socErrorStatus } from "@/lib/soc";
import { uploadSocSkillPackage } from "@/lib/soc-skill-package";

export const runtime = "nodejs";

// ADMIN uploads a SOC skill package (multipart: `package`, optional
// `version`). 201 { id, version, isCurrent }, 422 { error } for a file that
// isn't a usable package or a taken version, 400 when no file is attached.
export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");
    const form = await request.formData();
    const file = form.get("package");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "กรุณาแนบไฟล์ skill (.skill หรือ .zip)" }, { status: 400 });
    const uploaded = await uploadSocSkillPackage({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      version: String(form.get("version") || ""),
    });
    if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 422 });
    return NextResponse.json({ id: uploaded.id, version: uploaded.version, isCurrent: uploaded.isCurrent }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = socErrorStatus(message);
    // Only the access errors are expected here; anything else is a server
    // fault, logged rather than shown (it may hold a storage path).
    if (status === 400) {
      console.error("[soc-skills]", error);
      return NextResponse.json({ error: "อัปโหลด skill ไม่สำเร็จ" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
