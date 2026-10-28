import { NextResponse } from "next/server";
import { requireSocActor, socErrorStatus } from "@/lib/soc";
import { deleteSocTemplate } from "@/lib/soc-templates";

export const runtime = "nodejs";

// Deletes a template: only the one who added it, or an ADMIN.
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteSocTemplate(await requireSocActor(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = socErrorStatus(error instanceof Error ? error.message : "");
    if (status === 400) console.error("SOC template delete failed", error);
    const message = status === 404 ? "ไม่พบเทมเพลต" : status === 403 ? "ลบได้เฉพาะผู้ที่เพิ่มเทมเพลตนี้หรือ ADMIN" : status === 401 ? "กรุณาเข้าสู่ระบบ" : "ลบเทมเพลตไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status });
  }
}
