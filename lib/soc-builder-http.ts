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

// The template of a build form: `template` (a .docx for this build only) or
// `templateId` of the shared list. Throws the message the form shows when neither is given.
export async function buildTemplateFromForm(form: FormData): Promise<{ id: string } | { file: { name: string; bytes: Uint8Array } }> {
  const uploaded = form.get("template");
  const templateId = form.get("templateId");
  if (uploaded instanceof File && uploaded.size > 0) return { file: { name: uploaded.name, bytes: new Uint8Array(await uploaded.arrayBuffer()) } };
  if (typeof templateId === "string" && templateId) return { id: templateId };
  throw new Error("กรุณาเลือกเทมเพลต SOC จากรายการ หรืออัปโหลดไฟล์เทมเพลต");
}
