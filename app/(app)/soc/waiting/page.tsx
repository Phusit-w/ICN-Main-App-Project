import { requirePageAccess } from "@/lib/authorization";
import { requireSocUser } from "@/lib/proposal";
import { waitingCheckRequests } from "@/lib/soc-check-requests";
import { hasActiveRunnerLink } from "@/lib/soc-runner";
import { waitingTab } from "@/lib/soc-waiting-tab";
import SocSectionTabs from "@/components/SocSectionTabs";
import SocWaitingList from "@/components/SocWaitingList";

export const dynamic = "force-dynamic";

// รอคนรับ (ADR 0013): AI work teammates sent away, for a user with a SOC
// Runner to take by their own click. Without a Runner the list is read-only.
export default async function WaitingPage() {
  await requirePageAccess("soc");
  const actor = await requireSocUser();
  const [requests, canTake] = await Promise.all([waitingCheckRequests(), hasActiveRunnerLink(actor.id)]);
  return <div className="flex flex-col gap-6">
    <SocSectionTabs active="waiting" waiting={await waitingTab()} />
    <div>
      <h1 className="font-display text-[28px] font-bold">รอคนรับ</h1>
      <p className="mt-1 text-sm text-muted">งานตรวจที่เพื่อนส่งมาให้คนอื่นตรวจแทน กดรับเองเท่านั้น ระบบไม่รับแทนใคร งานที่รับจะตรวจบน SOC Runner ของคุณด้วยโควตา Claude ของคุณ{canTake ? "" : " (ต้องเชื่อม SOC Runner ก่อนจึงจะรับงานได้)"}</p>
    </div>
    <SocWaitingList requests={requests} canTake={canTake} />
  </div>;
}
