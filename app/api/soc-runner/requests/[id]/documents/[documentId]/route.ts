import { NextResponse } from "next/server";
import { authenticateSocRunner } from "@/lib/soc-runner";
import { runnerRequestDocument } from "@/lib/soc-check-requests";
import { socRunnerErrorResponse } from "@/lib/soc-runner-http";

export const runtime = "nodejs";

// The SOC or an evidence PDF of a Check Request this runner is running.
export async function GET(request: Request, context: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const link = await authenticateSocRunner(request);
    const { id, documentId } = await context.params;
    const { document, bytes } = await runnerRequestDocument(link, id, documentId);
    // The runner takes the folder path from the claim; the header names the file only.
    const safeName = (document.originalName.split("/").pop() || "file").replace(/[\r\n"]/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Soc-Checksum": document.checksum,
      },
    });
  } catch (error) {
    return socRunnerErrorResponse(error);
  }
}
