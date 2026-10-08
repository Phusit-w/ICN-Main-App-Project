// Runs once when a Next.js server starts (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
// Background work of the app's own: SOC jobs in the trash are deleted for good after 30 days.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startSocTrashPurge } = await import("@/lib/soc-trash");
  startSocTrashPurge();
}
