import { NextResponse } from "next/server";
import { socBuilderError } from "@/lib/soc-builder-http";
import { cancelBuildRead } from "@/lib/soc-builds";

export const runtime = "nodejs";

// Stops the OCR read of a scanned build (its owner or an ADMIN). The pages
// already read are kept, so the read can be resumed.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await cancelBuildRead((await context.params).id))) throw new Error("SOC นี้ไม่ได้กำลังอ่านอยู่แล้ว");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socBuilderError(error, "ยกเลิกการอ่านไม่สำเร็จ");
  }
}
