import { NextResponse } from "next/server";
import { socBuilderError } from "@/lib/soc-builder-http";
import { resumeBuildRead } from "@/lib/soc-builds";

export const runtime = "nodejs";

// Goes on with a failed or cancelled read of a scanned build, from the pages
// already read (its owner or an ADMIN).
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await resumeBuildRead((await context.params).id))) throw new Error("SOC นี้ไม่ได้อยู่ในสถานะที่อ่านต่อได้");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socBuilderError(error, "อ่านต่อไม่สำเร็จ");
  }
}
