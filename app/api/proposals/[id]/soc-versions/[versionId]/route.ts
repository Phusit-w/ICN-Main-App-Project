import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeProposal } from "@/lib/proposal";
import { downloadFailure, fileResponse } from "@/lib/proposal-http";
import { resolveStorageKey } from "@/lib/soc";

export const runtime = "nodejs";

// Downloads a SOC Version's SOC file; `?file=source` is the PDF a PDF SOC was
// made from. Any SOC user may, old versions included.
export async function GET(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const { id, versionId } = await context.params;
    await authorizeProposal(id);
    const version = await prisma.socVersion.findUnique({ where: { id: versionId } });
    if (!version || version.proposalId !== id) return new NextResponse("Not found", { status: 404 });
    const source = new URL(request.url).searchParams.get("file") === "source";
    const [storageKey, name, mimeType] = source ? [version.sourceStorageKey, version.sourceName, "application/pdf"] : [version.storageKey, version.originalName, version.mimeType];
    if (!storageKey || !name || !mimeType) return new NextResponse("Not found", { status: 404 });
    return fileResponse(await readFile(resolveStorageKey(storageKey)), { mimeType, name, disposition: source ? "inline" : "attachment" });
  } catch (error) {
    return downloadFailure(error);
  }
}
