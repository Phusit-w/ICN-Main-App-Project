import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { socErrorStatus } from "@/lib/soc";
import { readSocSkillPackage, socSkillDownloadName } from "@/lib/soc-skill-package";

export const runtime = "nodejs";

// ADMIN downloads a stored SOC skill package, exactly as SOC Runners get it
// (with the headless instruction).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await context.params;
    const found = await readSocSkillPackage(id);
    if (!found) return NextResponse.json({ error: "ไม่พบ skill เวอร์ชันนี้" }, { status: 404 });
    return new NextResponse(new Uint8Array(found.bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${socSkillDownloadName(found.record)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = socErrorStatus(message);
    // Only the access errors are expected here; anything else is a server
    // fault, logged rather than shown (it may hold a storage path).
    if (status === 400) {
      console.error("[soc-skills]", error);
      return NextResponse.json({ error: "ดาวน์โหลด skill ไม่สำเร็จ" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
