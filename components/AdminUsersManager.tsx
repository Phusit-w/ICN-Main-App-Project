"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeUsername, createUser, resetUserPassword, setUserActive, setUserAppAccess, setUserRole } from "@/actions/admin";
import { appAccessLabels, DEFAULT_APP_ACCESS, type AppPermission } from "@/lib/access";
import AppAccessModal from "@/components/AppAccessModal";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import EditUsernameModal from "@/components/EditUsernameModal";

type AdminUser = { id: string; username: string; displayName: string; role: string; appAccess: string[]; isActive: boolean; mustChangePassword: boolean; createdAt: string };
type ActionResult = { ok: boolean; error?: string; message?: string; temporaryPassword?: string; username?: string; selfChanged?: boolean };

function messageFor(result: ActionResult) {
  if (!result.ok) return result.error ?? "ไม่สำเร็จ";
  if (result.message) return result.message;
  if (result.temporaryPassword) return `รหัสผ่านชั่วคราว (แสดงครั้งเดียว): ${result.temporaryPassword}`;
  if (result.username) return `รีเซ็ตรหัสผ่าน ${result.username} แล้ว — ผู้ที่ใช้บัญชีนี้อยู่จะถูกให้ login ใหม่ด้วยรหัสใหม่`;
  return "บันทึกเรียบร้อย";
}

// The access a USER holds, as chips (lib/access.ts). ADMIN rows show
// "ทุกระบบ" instead: an admin may open everything.
function AccessChips({ appAccess }: { appAccess: readonly string[] }) {
  const labels = appAccessLabels(appAccess);
  if (!labels.length) return <span className="text-muted">ไม่มีสิทธิ์เข้า app ใด</span>;
  return <div className="flex flex-wrap gap-1.5">{labels.map((l) => <span key={l} className="rounded-full bg-chip px-2 py-0.5 text-xs text-label">{l}</span>)}</div>;
}

export default function AdminUsersManager({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [access, setAccess] = useState<AppPermission[]>(DEFAULT_APP_ACCESS);
  // Whose access the dialog is editing: "new" = the add-user form above.
  const [accessTarget, setAccessTarget] = useState<AdminUser | "new" | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [usernameTarget, setUsernameTarget] = useState<AdminUser | null>(null);
  const show = (r: ActionResult) => setMessage(messageFor(r));

  return <div className="space-y-6">
    <form className="grid gap-4 rounded-card border border-line bg-surface p-5 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createUser({ username, displayName, role, appAccess: access }); show(r); if (r.ok) { setUsername(""); setDisplayName(""); setAccess(DEFAULT_APP_ACCESS); } }); }}>
      <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      <Field label="ชื่อที่แสดง" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      <label className="text-[13px] font-medium text-label">Role<select className="mt-1.5 h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm" value={role} onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}><option>USER</option><option>ADMIN</option></select></label>
      <Button type="submit" className="self-end" disabled={pending}>เพิ่มผู้ใช้</Button>
      <div className="text-sm md:col-span-4">
        <div className="mb-1.5 text-[13px] font-medium text-label">สิทธิ์เข้าใช้งาน</div>
        {role === "ADMIN" ? <span className="text-muted">Admin ใช้ได้ทุกระบบ</span> : <div className="flex flex-col items-start gap-2"><AccessChips appAccess={access} /><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setAccessTarget("new")}>กำหนดสิทธิ์</Button></div>}
      </div>
    </form>
    {message ? <div className="rounded-field border border-line bg-chip p-4 text-sm font-medium">{message}</div> : null}
    <div className="overflow-x-auto rounded-card border border-line bg-surface"><table className="w-full text-left text-sm"><thead className="border-b border-line bg-chip"><tr><th className="p-4">ผู้ใช้</th><th className="p-4">Role</th><th className="p-4">สิทธิ์เข้าใช้งาน</th><th className="p-4">สถานะ</th><th className="p-4">จัดการ</th></tr></thead><tbody>
      {users.map((u) => <tr key={u.id} className="border-b border-line last:border-0">
        <td className="p-4"><div className="font-medium">{u.displayName}</div><div className="text-muted">{u.username}{u.mustChangePassword ? " · รอเปลี่ยนรหัสผ่าน" : ""}</div></td>
        <td className="p-4"><select className="rounded-input border border-line bg-surface p-2" value={u.role} disabled={pending} onChange={(e) => start(async () => show(await setUserRole(u.id, e.target.value as "USER" | "ADMIN")))}><option>USER</option><option>ADMIN</option></select></td>
        <td className="p-4">{u.role === "ADMIN" ? <span className="text-muted">ทุกระบบ</span> : <div className="flex flex-col items-start gap-2"><AccessChips appAccess={u.appAccess} /><Button size="sm" variant="outline" disabled={pending} onClick={() => setAccessTarget(u)}>แก้ไขสิทธิ์</Button></div>}</td>
        <td className="p-4">{u.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</td>
        <td className="p-4"><div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setUsernameTarget(u)}>เปลี่ยน Username</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setResetTarget(u)}>รีเซ็ตรหัสผ่าน</Button>
          <Button size="sm" variant={u.isActive ? "danger" : "outline"} disabled={pending} onClick={() => start(async () => show(await setUserActive(u.id, !u.isActive)))}>{u.isActive ? "ปิดบัญชี" : "เปิดบัญชี"}</Button>
        </div></td>
      </tr>)}
    </tbody></table></div>

    <AppAccessModal
      key={`app-access-${accessTarget === null ? "none" : accessTarget === "new" ? "new" : accessTarget.id}`}
      open={accessTarget !== null}
      title={accessTarget === "new" ? "สิทธิ์เข้าใช้งานของผู้ใช้ใหม่" : `สิทธิ์เข้าใช้งาน — ${accessTarget?.displayName ?? ""}`}
      initial={accessTarget === "new" ? access : accessTarget?.appAccess ?? []}
      pending={pending}
      confirmLabel={accessTarget === "new" ? "ตกลง" : "บันทึก"}
      onCancel={() => setAccessTarget(null)}
      onConfirm={(next) => {
        const target = accessTarget;
        if (target === "new") { setAccess(next); setAccessTarget(null); return; }
        if (!target) return;
        start(async () => {
          const r = await setUserAppAccess(target.id, next);
          show(r);
          if (r.ok) setAccessTarget(null);
        });
      }}
    />
    <ResetPasswordModal
      key={`reset-password-${resetTarget?.id ?? "none"}`}
      open={resetTarget !== null}
      user={resetTarget}
      pending={pending}
      onCancel={() => setResetTarget(null)}
      onConfirm={(newPassword) => {
        const target = resetTarget;
        if (!target) return;
        start(async () => {
          const r = await resetUserPassword(target.id, newPassword);
          show(r);
          if (r.ok) setResetTarget(null);
        });
      }}
    />
    <EditUsernameModal
      key={`edit-username-${usernameTarget?.id ?? "none"}`}
      open={usernameTarget !== null}
      user={usernameTarget}
      pending={pending}
      onCancel={() => setUsernameTarget(null)}
      onConfirm={(nextUsername) => {
        const target = usernameTarget;
        if (!target) return;
        start(async () => {
          const result = await changeUsername(target.id, nextUsername);
          show(result);
          if (!result.ok) return;
          setUsernameTarget(null);
          if (result.selfChanged) router.replace("/login");
        });
      }}
    />
  </div>;
}
