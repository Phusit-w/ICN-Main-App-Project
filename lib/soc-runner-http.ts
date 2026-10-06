// The JSON error answer shared by the SOC Runner API routes
// (app/api/soc-runner/*, docs/SOC-RUNNER.md).
import { NextResponse } from "next/server";

const KNOWN: Record<string, { status: number; message?: string }> = {
  UNAUTHORIZED: { status: 401 },
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404 },
  NOT_CLAIMED: { status: 409, message: "คำขอนี้ไม่ได้อยู่ระหว่างตรวจบนเครื่องนี้แล้ว" },
  NO_SKILL_PACKAGE: { status: 409, message: "ยังไม่มี skill บน server ติดต่อ admin" },
};

// { error: CODE, message? } for an expected error; anything else is a
// server fault, logged rather than shown (it may hold a storage path).
export function socRunnerErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const known = KNOWN[code];
  if (!known) {
    console.error("[soc-runner]", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
  return NextResponse.json(known.message ? { error: code, message: known.message } : { error: code }, { status: known.status });
}
