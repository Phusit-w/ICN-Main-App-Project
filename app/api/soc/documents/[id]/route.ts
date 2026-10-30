import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProposal } from "@/lib/proposal";
import { writeAudit } from "@/lib/authorization";
import { authorizeSocJob, removeSocEvidence, requireSocActor, resolveStorageKey, socErrorStatus } from "@/lib/soc";
import { TOR_DOCUMENT } from "@/lib/soc-tor";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const found = await prisma.socDocument.findUnique({ where: { id } });
    // A Datasheet of a Proposal (the evidence of its SOC jobs): whoever may open the Proposal may open it.
    const datasheet = found ? null : await prisma.proposalDatasheet.findUnique({ where: { id } });
    if (!found && !datasheet) return new NextResponse("Not found", { status: 404 });
    const document = found ?? { id, jobId: null, type: "EVIDENCE", originalName: datasheet!.originalName, storageKey: datasheet!.storageKey, mimeType: "application/pdf" };
    const { actor } = found ? await authorizeSocJob(found.jobId) : await authorizeProposal(datasheet!.proposalId);
    const bytes = await readFile(resolveStorageKey(document.storageKey));
    if (document.jobId) await prisma.socAuditEvent.create({ data: { jobId: document.jobId, actorId: actor.id, action: "DOCUMENT_DOWNLOADED", detail: { documentId: id, type: document.type } } });
    await writeAudit({ actorId: actor.id, action: "SOC_DOCUMENT_DOWNLOADED", entityType: document.jobId ? "SOC_JOB" : "PROPOSAL", entityId: document.jobId ?? datasheet!.proposalId, summary: `ดาวน์โหลดไฟล์ ${document.originalName}`, metadata: { documentId: id, type: document.type } });
    const disposition = document.type === "EVIDENCE" || document.type === "SOC_SOURCE_PDF" || document.type === TOR_DOCUMENT ? "inline" : "attachment";
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
