"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import SocFilePicker, { readUploadResponse } from "@/components/SocFilePicker";
import { MAX_EVIDENCE_FILE_BYTES, SOC_TITLE_MAX } from "@/lib/soc-shared";

type Template = { id: string; name: string; addedByName: string; canDelete: boolean };

const INPUT = "h-[46px] rounded-input border border-line bg-surface px-4 text-ink outline-none focus:border-ink";

export default function SocBuildForm({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmDialog, confirm] = useConfirmDialog();
  const [tor, setTor] = useState<File[]>([]);
  const [pageRanges, setPageRanges] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"list" | "upload">(templates.length ? "list" : "upload");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [uploaded, setUploaded] = useState<File[]>([]);
  const [saveToList, setSaveToList] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const chosen = templates.find((t) => t.id === templateId);

  function submit() {
    setError("");
    if (!tor.length) return setError("กรุณาเลือกไฟล์ PDF ของ TOR");
    if (tor[0].size > MAX_EVIDENCE_FILE_BYTES) return setError(`ไฟล์ ${tor[0].name} ต้องมีขนาดไม่เกิน ${MAX_EVIDENCE_FILE_BYTES / 1024 / 1024} MB`);
    if (mode === "list" && !templateId) return setError("กรุณาเลือกเทมเพลตจากรายการ");
    if (mode === "upload" && !uploaded.length) return setError("กรุณาเลือกไฟล์เทมเพลต SOC (.docx)");
    if (mode === "upload" && saveToList && !templateName.trim()) return setError("กรุณาตั้งชื่อเทมเพลตที่จะบันทึกในรายการกลาง");
    startTransition(async () => {
      try {
        let useTemplateId = mode === "list" ? templateId : "";
        // A template kept for everyone is added first, then used like one from the list.
        if (mode === "upload" && saveToList) {
          const form = new FormData();
          form.set("name", templateName.trim());
          form.set("file", uploaded[0]);
          const added = await readUploadResponse<{ id?: string; error?: string }>(await fetch("/api/soc/templates", { method: "POST", body: form }));
          if (!added.id) throw new Error(added.error || "เพิ่มเทมเพลตไม่สำเร็จ");
          useTemplateId = added.id;
        }
        const form = new FormData();
        form.set("tor", tor[0]);
        form.set("pageRanges", pageRanges.trim());
        if (title.trim()) form.set("title", title.trim());
        if (useTemplateId) form.set("templateId", useTemplateId);
        else form.set("template", uploaded[0]);
        let response = await fetch("/api/soc/builds", { method: "POST", body: form });
        let body = await readUploadResponse<{ id?: string; error?: string; needsOcrConfirm?: boolean }>(response);
        if (body.needsOcrConfirm) {
          // A scanned TOR goes to an outside OCR service: ask every time; cancel stores and sends nothing.
          const yes = await confirm({ title: "ไฟล์นี้จะส่งไป OCR ภายนอก (Beta)", message: "TOR นี้เป็น PDF แบบสแกน ระบบจะส่งภาพของหน้าที่คุณเลือกไปอ่านที่บริการ OCR ภายนอก (Typhoon) อ่านในเบื้องหลังต่อคิวหลังงานอ่านอื่น (ประมาณ 2 วินาทีต่อหน้า) แล้วจึงสร้างไฟล์ Word ผลอ่านจาก OCR ยังไม่แม่นยำ 100% ต้องทวนทุกข้อเทียบ TOR จริง ต้องการดำเนินการต่อหรือไม่", confirmLabel: "ยืนยันและส่ง OCR" });
          if (!yes) return;
          form.set("ocrConfirmed", "1");
          response = await fetch("/api/soc/builds", { method: "POST", body: form });
          body = await readUploadResponse<{ id?: string; error?: string; needsOcrConfirm?: boolean }>(response);
        }
        if (!response.ok || !body.id) throw new Error(body.error || "สร้าง SOC ไม่สำเร็จ");
        router.push(`/soc/builds/${body.id}`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "สร้าง SOC ไม่สำเร็จ");
      }
    });
  }

  async function deleteTemplate() {
    if (!chosen || !window.confirm(`ลบเทมเพลต "${chosen.name}" ออกจากรายการกลาง?`)) return;
    const response = await fetch(`/api/soc/templates/${chosen.id}`, { method: "DELETE" });
    if (!response.ok) return setError((await response.json().catch(() => ({}))).error || "ลบเทมเพลตไม่สำเร็จ");
    setTemplateId("");
    router.refresh();
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex flex-col gap-6">
      {confirmDialog}
      <Section number="1" title="TOR และช่วงหน้า" description="PDF ข้อความ หรือ PDF สแกน (อ่านด้วย OCR ภายนอก Beta จะถามยืนยันก่อน) พิมพ์ช่วงหน้าที่เป็นส่วนข้อกำหนด เช่น 12-40, 55-60 (PDF ข้อความเว้นว่างได้ ระบบหาหน้าเริ่มจากหัวเอกสารผนวก ส่วน PDF สแกนต้องกรอก)">
        <div className="flex flex-col gap-5">
          <SocFilePicker files={tor} onChange={setTor} disabled={pending} label="เลือกไฟล์ PDF ของ TOR" accept=".pdf,application/pdf" />
          <label className="flex max-w-md flex-col gap-2 text-sm font-medium">ช่วงหน้าของ TOR (เว้นว่างให้ระบบเลือก)
            <input value={pageRanges} onChange={(e) => setPageRanges(e.target.value)} disabled={pending} placeholder="เว้นว่าง = ให้ระบบเลือก เช่น 12-40, 55-60" className={INPUT} />
          </label>
        </div>
      </Section>
      <Section number="2" title="เทมเพลต SOC" description="ไฟล์ Word เปล่าในรูปแบบของลูกค้า ระบบเติมเลขข้อและข้อกำหนด TOR ลงตารางแรก ช่องอื่นเว้นว่าง">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "list"} onChange={() => setMode("list")} disabled={pending || !templates.length} />เลือกจากรายการกลาง{templates.length ? "" : " (ยังไม่มี)"}</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "upload"} onChange={() => setMode("upload")} disabled={pending} />อัปโหลดไฟล์เทมเพลต</label>
          </div>
          {mode === "list" ? <div className="flex flex-wrap items-center gap-3">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={pending} aria-label="เทมเพลต" className={`${INPUT} min-w-72`}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (เพิ่มโดย {t.addedByName})</option>)}
            </select>
            {chosen?.canDelete ? <Button type="button" size="sm" variant="danger" onClick={deleteTemplate} disabled={pending}>ลบเทมเพลตนี้</Button> : null}
          </div> : <div className="flex flex-col gap-4">
            <SocFilePicker files={uploaded} onChange={setUploaded} disabled={pending} label="เลือกไฟล์เทมเพลต (.docx)" accept=".docx" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveToList} onChange={(e) => setSaveToList(e.target.checked)} disabled={pending} />บันทึกไว้ในรายการกลางให้เพื่อนร่วมงานใช้ด้วย</label>
            {saveToList ? <label className="flex max-w-md flex-col gap-2 text-sm font-medium">ชื่อเทมเพลต
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} disabled={pending} maxLength={120} placeholder="เช่น แบบฟอร์ม กฟน." className={INPUT} />
            </label> : null}
          </div>}
        </div>
      </Section>
      <Section number="3" title="ชื่อ SOC" description="ถ้าเว้นว่าง ใช้ชื่อไฟล์ TOR ชื่อซ้ำกันได้ ไฟล์ที่ได้ชื่อ SOC-<ชื่อ>.docx">
        <label className="flex max-w-2xl flex-col gap-2 text-sm font-medium">ชื่อ
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} maxLength={SOC_TITLE_MAX} placeholder={tor[0] ? tor[0].name.replace(/\.pdf$/i, "") : "เช่น Apron สุราษฎร์ธานี"} className={INPUT} />
        </label>
      </Section>
      {error ? <p role="alert" className="rounded-input border border-danger-border bg-surface px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/soc/builds")} disabled={pending}>ยกเลิก</Button>
        <Button type="submit" disabled={pending}>{pending ? "กำลังสร้าง…" : "สร้าง SOC"}</Button>
      </div>
    </form>
  );
}

function Section({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-card bg-surface p-6 shadow-card"><div className="mb-5 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-ground">{number}</span><div><h2 className="font-display text-base font-semibold">{title}</h2><p className="text-xs text-muted">{description}</p></div></div>{children}</section>;
}
