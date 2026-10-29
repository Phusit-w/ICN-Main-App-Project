"use client";

import { useState, useTransition } from "react";
import {
  createProjectCardClient,
  deleteProjectCardClient,
  updateProjectCardClient,
  type Result,
} from "@/actions/projectCardClients";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";

export type AdminClient = { id: string; code: string; names: string[] };

// Names are typed as one comma-separated line, like synonyms in
// AdminProjectCardTerms; blank pieces are passed on for the action to reject.
function splitNames(text: string): string[] {
  return text.trim() ? text.split(",") : [];
}

type Run = (action: () => Promise<Result>, done: string, onOk?: () => void) => void;

export default function AdminProjectCardClients({ clients }: { clients: AdminClient[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [names, setNames] = useState("");

  const run: Run = (action, done, onOk) => {
    start(async () => {
      const r = await action();
      setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
      if (r.ok) onOk?.();
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold">ชื่อหน่วยงาน</h3>
        <p className="text-xs text-muted">
          รหัสหน่วยงานตามที่เขียนบนการ์ด พร้อมชื่อไทยและชื่อย่อที่คนมักเรียก ใช้เฉพาะการถามด้วยประโยค —
          ไม่ตรวจและไม่เปลี่ยนหน่วยงานบนการ์ด แก้หรือลบได้โดยไม่กระทบการ์ด
        </p>
      </div>
      {message ? (
        <div className={`rounded-field border p-4 text-sm font-medium ${message.ok ? "border-line bg-chip" : "border-danger-border text-danger"}`}>
          {message.text}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-chip">
            <tr>
              <th className="p-4">รหัส</th>
              <th className="p-4">ชื่อและชื่อย่อ</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <ClientRow key={c.id} client={c} pending={pending} run={run} />
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="grid gap-4 rounded-card border border-line bg-surface p-5 md:grid-cols-[1fr_2fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createProjectCardClient({ code, names: splitNames(names) }), `เพิ่ม "${code.trim()}" แล้ว`, () => {
            setCode("");
            setNames("");
          });
        }}
      >
        <Field label="รหัส" placeholder="เช่น PEA" value={code} onChange={(e) => setCode(e.target.value)} required />
        <Field
          label="ชื่อและชื่อย่อ"
          placeholder="คั่นด้วยจุลภาค เช่น การไฟฟ้าส่วนภูมิภาค, กฟภ."
          value={names}
          onChange={(e) => setNames(e.target.value)}
          required
        />
        <Button type="submit" className="self-end" disabled={pending}>
          เพิ่มหน่วยงาน
        </Button>
      </form>
    </div>
  );
}

function ClientRow({ client, pending, run }: { client: AdminClient; pending: boolean; run: Run }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [code, setCode] = useState(client.code);
  const [names, setNames] = useState(client.names.join(", "));
  const input = "w-full rounded-input border border-line bg-surface p-2";

  function cancel() {
    setCode(client.code);
    setNames(client.names.join(", "));
    setMode(null);
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="p-4 font-medium">
        {mode === "edit" ? (
          <input aria-label="รหัส" className={input} value={code} onChange={(e) => setCode(e.target.value)} disabled={pending} />
        ) : (
          client.code
        )}
      </td>
      <td className="p-4">
        {mode === "edit" ? (
          <input aria-label="ชื่อและชื่อย่อ" className={input} value={names} onChange={(e) => setNames(e.target.value)} disabled={pending} />
        ) : (
          <div className="flex flex-wrap gap-1">
            {client.names.map((s) => (
              <span key={s} className="rounded-full bg-chip px-2 py-0.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="p-4">
        <div className="flex flex-wrap justify-end gap-2">
          {mode ? (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={cancel}>
                ยกเลิก
              </Button>
              {mode === "edit" ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => updateProjectCardClient(client.id, { code, names: splitNames(names) }),
                      `แก้ "${client.code}" แล้ว`,
                      () => setMode(null),
                    )
                  }
                >
                  บันทึก
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => run(() => deleteProjectCardClient(client.id), `ลบ "${client.code}" แล้ว`)}
                >
                  ยืนยันลบ {client.code}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("edit")}>
                แก้
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("delete")}>
                ลบ
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
