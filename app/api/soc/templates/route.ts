import { NextResponse } from "next/server";
import { requireSocActor, socErrorStatus } from "@/lib/soc";
import { addSocTemplate, listSocTemplates } from "@/lib/soc-templates";

export const runtime = "nodejs";

// The shared list of SOC Templates of สร้าง SOC, for anyone with SOC access.
export async function GET() {
  try {
    await requireSocActor();
    return NextResponse.json({ templates: await listSocTemplates() });
  } catch (error) {
    const status = socErrorStatus(error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "โหลดรายการเทมเพลตไม่สำเร็จ" }, { status: status === 400 ? 500 : status });
  }
}

// Adds a template (form fields `name` and `file`); a file the builder can't
// fill is refused with the message that names the problem.
export async function POST(request: Request) {
  try {
    const actor = await requireSocActor();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("กรุณาเลือกไฟล์เทมเพลต SOC (.docx)");
    const template = await addSocTemplate(actor, { name: form.get("name"), file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } });
    return NextResponse.json({ id: template.id, name: template.name }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = socErrorStatus(message);
    // A message for the user is Thai; anything else is a fault, logged and shown plainly.
    const forUser = /[฀-๿]/.test(message);
    if (status === 400 && !forUser) console.error("SOC template add failed", error);
    return NextResponse.json({ error: status === 400 ? (forUser ? message : "เพิ่มเทมเพลตไม่สำเร็จ") : "ไม่มีสิทธิ์ใช้งาน" }, { status });
  }
}
