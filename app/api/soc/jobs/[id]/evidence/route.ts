import { NextResponse } from "next/server";
import { addSocEvidence, authorizeSocJob, evidenceUploads, jobEvidenceTotals, socErrorStatus, validateEvidenceBatch, validateUpload } from "@/lib/soc";

export const runtime = "nodejs";

// Adds evidence PDFs to an Imported SOC Check. Anyone who may open the job
// (any user with `soc` access) may add them.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { actor, job } = await authorizeSocJob(id);
    const form = await request.formData();
    const evidence = evidenceUploads(form);
    validateEvidenceBatch(evidence.map((e) => e.file), await jobEvidenceTotals(job.id));
    const bytes = await Promise.all(evidence.map((e) => validateUpload(e.file, "EVIDENCE")));
    const documents = await addSocEvidence(actor, job, evidence.map((e, i) => ({ name: e.name, bytes: bytes[i] })));
    return NextResponse.json({ ids: documents.map((d) => d.id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถเพิ่มเอกสารได้";
    const status = socErrorStatus(message);
    return NextResponse.json({ error: status === 404 ? "ไม่พบงานตรวจ" : message }, { status });
  }
}
