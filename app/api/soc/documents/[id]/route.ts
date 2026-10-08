import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { authorizeSocJob, removeSocEvidence, requireSocActor, resolveStorageKey, socErrorStatus } from "@/lib/soc";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const document = await prisma.socDocument.findUnique({ where: { id } });
    if (!document) return new NextResponse("Not found", { status: 404 });
    const { actor } = await authorizeSocJob(document.jobId);
    const bytes = await readFile(resolveStorageKey(document.storageKey));
    await prisma.socAuditEvent.create({ data: { jobId: document.jobId, actorId: actor.id, action: "DOCUMENT_DOWNLOADED", detail: { documentId: id, type: document.type } } });
    await writeAudit({ actorId: actor.id, action: "SOC_DOCUMENT_DOWNLOADED", entityType: "SOC_JOB", entityId: document.jobId, summary: `ดาวน์โหลดไฟล์ ${document.originalName}`, metadata: { documentId: id, type: document.type } });
    const disposition = document.type === "EVIDENCE" ? "inline" : "attachment";
    // A PDF picked with its folder is named "folder/file.pdf"; the browser gets the file name only.
    const safeName = (document.originalName.split("/").pop() || "file").replace(/[\r\n"]/g, "_");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 404;
    return new NextResponse(status === 401 ? "Unauthorized" : "Not found", { status });
  }
}

// Removes an evidence PDF. Anyone who may open the job may remove one, as
// anyone may add one (app/api/soc/jobs/[id]/evidence).
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await removeSocEvidence(await requireSocActor(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ลบเอกสารไม่สำเร็จ";
    const status = socErrorStatus(message);
    return NextResponse.json({ error: status === 404 ? "ไม่พบเอกสาร" : message }, { status });
  }
}
