import { getProfile, listSavedEmployees } from "@/actions/profile";
import { requireActor } from "@/lib/authorization";
import { hasAccess } from "@/lib/access";
import PageShell from "@/components/PageShell";
import DefaultEmployeeSetting from "@/components/DefaultEmployeeSetting";
import Card from "@/components/ui/Card";

// Per-browser preferences. Reads the `lastEmployeeName` cookie via
// getProfile(), so — like every route under app/(app)/ — it must stay
// dynamic: a force-static route here also freezes the shared layout's
// session-cookie read (see the launcher avatar bug, commit ad60b78).
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Sequential, not Promise.all — same shared-Prisma-client constraint the
  // other pages document (see app/(app)/records/page.tsx).
  // Settings is open to everyone; only the expense part needs expense access.
  const actor = await requireActor();
  const canExpense = hasAccess(actor, "expense");
  const profile = canExpense ? await getProfile() : null;
  const savedEmployees = canExpense ? await listSavedEmployees() : [];

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[28px] font-bold leading-tight">
            ตั้งค่า
          </h1>
          <p className="text-sm text-muted">
            ตั้งค่าการใช้งานส่วนตัวของเครื่องนี้
          </p>
        </div>

        {profile ? (
        <Card className="flex max-w-xl flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <div className="text-base font-medium">ค่าเริ่มต้นผู้กรอก</div>
            <p className="text-[13px] text-muted">
              เลือกว่าจะให้ฟอร์มกรอกข้อมูลและหน้ารายการทั้งหมด เริ่มต้นด้วยข้อมูลพนักงานคนไหน
              — ค่านี้จำไว้เฉพาะเบราว์เซอร์นี้ ไม่ผูกกับบัญชีที่ล็อกอิน
            </p>
          </div>
          <DefaultEmployeeSetting
            currentName={profile.name}
            savedEmployees={savedEmployees}
          />
        </Card>
        ) : (
          <p className="text-sm text-muted">ยังไม่มีการตั้งค่าสำหรับระบบที่บัญชีนี้ใช้งานได้</p>
        )}
      </div>
    </PageShell>
  );
}
