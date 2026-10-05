import { requirePageAccess } from "@/lib/authorization";
import TravelCalculator from "@/components/TravelCalculator";

// Pure client-side calculator — no DB/server data needed, so unlike the
// other routes (app/bill/*) this page has nothing to fetch server-side;
// it only checks expense access (lib/access.ts).
export default async function TravelPage() {
  await requirePageAccess("expense");
  return <TravelCalculator />;
}
