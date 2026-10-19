// Runs once when a Next.js server starts (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
// Background work of the app's own: SOC jobs in the trash are deleted for good after 30 days.
export async function register() {
  // The import sits inside a plain NEXT_RUNTIME === "nodejs" check so the edge
  // bundle drops it; an early return for other runtimes still bundles pg for edge.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startSocTrashPurge } = await import("@/lib/soc-trash");
    startSocTrashPurge();
    // A scanned PDF SOC that was being read when the server stopped goes on from its saved cells,
    // and a scanned TOR ต้นฉบับ from its saved pages, after them in the OCR line.
    const { resumeScanReads } = await import("@/lib/soc");
    const { resumeTorReads } = await import("@/lib/soc-tor");
    resumeScanReads().catch((error) => console.error("Resuming scanned PDF SOC reads failed", error))
      .then(() => resumeTorReads()).catch((error) => console.error("Resuming scanned TOR reads failed", error));
  }
}
