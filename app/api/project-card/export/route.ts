import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/authorization";
import { exportProjectCards } from "@/lib/project-card-export";
import { XLSX_MIME } from "@/lib/soc-results-excel";

export const runtime = "nodejs";

// The page sends at most its own cards' codes; far more is no real request.
const MAX_PICKED = 5000;

// ค้นหาโครงการ's ส่งออก Excel: the page's own query string (search, filters)
// plus `sort=<key>:<dir>` → the cards on screen as .xlsx. Any user with
// Project Card access, view-only included; audited in lib/project-card-export.ts.
export async function GET(request: Request) {
  return download(request, []);
}

// The same, for only the ticked cards: their Project Codes come as `code`
// form fields, since a long list in the URL could pass IIS's 2,048-character
// query limit.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const picked = (form?.getAll("code") ?? []).filter((v): v is string => typeof v === "string");
  if (picked.length > MAX_PICKED) return NextResponse.json({ error: "เลือกโครงการมากเกินไป" }, { status: 413 });
  return download(request, picked);
}

async function download(request: Request, picked: string[]) {
  let actor;
  try {
    actor = await requireAccess("project-card");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้ค้นหาโครงการ" }, { status: 403 });
    throw error;
  }
  const { bytes, fileName } = await exportProjectCards(actor, new URL(request.url).searchParams, picked);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
