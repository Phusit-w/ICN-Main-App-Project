"use client";

import { useState, useTransition } from "react";
import { createProjectCardTerm, renameProjectCardTerm, type Result } from "@/actions/projectCardTerms";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import type { TermKind } from "@/lib/project-card-taxonomy";

export type AdminTerm = { id: string; kind: TermKind; value: string; en: string; th: string; cardCount: number };

const SECTIONS: { kind: TermKind; title: string; addLabel: string; hint: string }[] = [
  { kind: "category", title: "หมวดหมู่ / แท็ก", addLabel: "เพิ่มหมวดหมู่", hint: "สาขาเทคโนโลยีของโครงการ ใช้เป็นทั้งหมวดหลักและแท็ก" },
  { kind: "workType", title: "ลักษณะงาน", addLabel: "เพิ่มลักษณะงาน", hint: "รูปแบบที่ ICN ส่งมอบงาน เช่น จัดหา ติดตั้ง บำรุงรักษา เช่า" },
];

export default function AdminProjectCardTerms({ terms }: { terms: AdminTerm[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run(action: () => Promise<Result>, done: string, onOk?: () => void) {
    start(async () => {
      const r = await action();
      setMessage(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
      if (r.ok) onOk?.();
    });
  }

  return (
    <div className="space-y-6 pt-2">
      {message ? (
        <div className={`rounded-field border p-4 text-sm font-medium ${message.ok ? "border-line bg-chip" : "border-danger-border text-danger"}`}>
          {message.text}
        </div>
      ) : null}
      {SECTIONS.map((s) => (
        <TermSection key={s.kind} {...s} terms={terms.filter((t) => t.kind === s.kind)} pending={pending} run={run} />
      ))}
    </div>
  );
}

type Run = (action: () => Promise<Result>, done: string, onOk?: () => void) => void;

function TermSection({
  kind,
  title,
  addLabel,
  hint,
  terms,
  pending,
  run,
}: {
  kind: TermKind;
  title: string;
  addLabel: string;
  hint: string;
  terms: AdminTerm[];
  pending: boolean;
  run: Run;
}) {
  const [en, setEn] = useState("");
  const [th, setTh] = useState("");

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-chip">
            <tr>
              <th className="p-4">ชื่อภาษาอังกฤษ</th>
              <th className="p-4">ชื่อภาษาไทย</th>
              <th className="p-4">การ์ดที่ใช้</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <TermRow key={t.id} term={t} pending={pending} run={run} />
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="grid gap-4 rounded-card border border-line bg-surface p-5 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createProjectCardTerm({ kind, en, th }), `เพิ่ม "${en.trim()}" แล้ว`, () => {
            setEn("");
            setTh("");
          });
        }}
      >
        <Field label="ชื่อภาษาอังกฤษ" placeholder="เช่น Solar & EV" value={en} onChange={(e) => setEn(e.target.value)} required />
        <Field label="ชื่อภาษาไทย" placeholder="เช่น โซลาร์เซลล์และสถานีชาร์จ" value={th} onChange={(e) => setTh(e.target.value)} required />
        <Button type="submit" className="self-end" disabled={pending}>
          {addLabel}
        </Button>
      </form>
    </div>
  );
}

function TermRow({ term, pending, run }: { term: AdminTerm; pending: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [en, setEn] = useState(term.en);
  const [th, setTh] = useState(term.th);
  const input = "w-full rounded-input border border-line bg-surface p-2";

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0">
        <td className="p-4">
          <input aria-label="ชื่อภาษาอังกฤษ" className={input} value={en} onChange={(e) => setEn(e.target.value)} disabled={pending} />
        </td>
        <td className="p-4">
          <input aria-label="ชื่อภาษาไทย" className={input} value={th} onChange={(e) => setTh(e.target.value)} disabled={pending} />
        </td>
        <td className="p-4 text-muted">{term.cardCount}</td>
        <td className="p-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setEn(term.en);
                setTh(term.th);
                setEditing(false);
              }}
            >
              ยกเลิก
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => renameProjectCardTerm(term.id, { en, th }), `แก้ชื่อ "${term.en}" แล้ว`, () => setEditing(false))}
            >
              บันทึก
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="p-4">
        <div className="font-medium">{term.en}</div>
        <div className="text-xs text-muted">{term.value}</div>
      </td>
      <td className="p-4">{term.th}</td>
      <td className="p-4">{term.cardCount.toLocaleString("th-TH")}</td>
      <td className="p-4 text-right">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
          แก้ชื่อ
        </Button>
      </td>
    </tr>
  );
}
