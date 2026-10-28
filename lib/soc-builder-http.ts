// The error response of a สร้าง SOC route (templates, builds). Server-only.
import { NextResponse } from "next/server";
import { socErrorStatus } from "@/lib/soc";

// A message for the user is Thai and is shown as it is; any other failure is a
// fault, logged, and shown as `fallback`. NOT_FOUND / FORBIDDEN / UNAUTHORIZED
// keep their status.
export function socBuilderError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const status = socErrorStatus(message);
  if (status === 400) {
    const forUser = /[฀-๿]/.test(message);
    if (!forUser) console.error(fallback, error);
    return NextResponse.json({ error: forUser ? message : fallback }, { status });
  }
  return NextResponse.json({ error: status === 404 ? "ไม่พบรายการ" : status === 403 ? "ไม่มีสิทธิ์ใช้งาน" : "กรุณาเข้าสู่ระบบ" }, { status });
}
