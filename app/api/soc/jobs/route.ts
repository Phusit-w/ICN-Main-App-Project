import { NextResponse } from "next/server";
import { createImportedSocJob, evidenceUploads, requireSocActor, socErrorStatus, validateEvidenceBatch, validateUpload } from "@/lib/soc";

export const runtime = "nodejs";

// Creates an Imported SOC Check (ADR 0008): checks run on reviewers' own
// machines, so new jobs never go to the server-side worker's queue.
export async function POST(request: Request) {
  try {
    const actor = await requireSocActor();
    const form = await request.formData();
    const title = String(form.get("title") || "").trim();
    const soc = form.get("soc");
    const evidence = evidenceUploads(form);
    if (!title || title.length > 160) return NextResponse.json({ error: "กรุณาระบุชื่อโครงการไม่เกิน 160 ตัวอักษร" }, { status: 400 });
    if (!(soc instanceof File)) return NextResponse.json({ error: "กรุณาแนบไฟล์ SOC" }, { status: 400 });
    // The first batch only; the form sends the rest to /evidence.
    validateEvidenceBatch(evidence.map((e) => e.file));
    const socBytes = await validateUpload(soc, "SOC");
    const evidenceBytes = await Promise.all(evidence.map((e) => validateUpload(e.file, "EVIDENCE")));
    const id = await createImportedSocJob(actor, {
      title,
      soc: { name: soc.name, bytes: socBytes },
      evidence: evidence.map((e, i) => ({ name: e.name, bytes: evidenceBytes[i] })),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถสร้างงานตรวจได้";
    return NextResponse.json({ error: message }, { status: socErrorStatus(message) });
  }
}
