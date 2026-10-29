import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/authorization";
import { exportProjectCards } from "@/lib/project-card-export";
import { XLSX_MIME } from "@/lib/soc-results-excel";

export const runtime = "nodejs";

// ค้นหาโครงการ's ส่งออก Excel: the page's own query string (search, filters)
// plus `sort=<key>:<dir>` → the cards on screen as .xlsx. Any user with
// Project Card access, view-only included; audited in lib/project-card-export.ts.
export async function GET(request: Request) {
  let actor;
  try {
    actor = await requireAccess("project-card");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้ค้นหาโครงการ" }, { status: 403 });
    throw error;
  }
  const { bytes, fileName } = await exportProjectCards(actor, new URL(request.url).searchParams);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
