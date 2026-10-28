import { NextResponse } from "next/server";
import { socBuilderError } from "@/lib/soc-builder-http";
import { deleteSocBuild } from "@/lib/soc-builds";

export const runtime = "nodejs";

// Deletes a build and its files: its owner, or an ADMIN.
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await deleteSocBuild((await context.params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return socBuilderError(error, "ลบ SOC ที่สร้างไม่สำเร็จ");
  }
}
