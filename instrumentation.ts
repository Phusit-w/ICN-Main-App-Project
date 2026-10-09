// Runs once when a Next.js server starts (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
// Background work of the app's own: SOC jobs in the trash are deleted for good after 30 days.
export async function register() {
  // The import sits inside a plain NEXT_RUNTIME === "nodejs" check so the edge
  // bundle drops it; an early return for other runtimes still bundles pg for edge.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startSocTrashPurge } = await import("@/lib/soc-trash");
    startSocTrashPurge();
  }
}
