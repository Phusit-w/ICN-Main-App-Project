"use client";

import { useState, useTransition } from "react";
import { updateProjectCardDetails, verifyProjectCardBudget } from "@/actions/projectCard";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CopyButton from "@/components/CopyButton";
import CommaNumberInput, { withCommas } from "@/components/CommaNumberInput";
import { fmt } from "@/lib/format";
import { descriptionSourceLabel, termLabel, type Taxonomy } from "@/lib/project-card-taxonomy";

export type ProjectCardRow = {
  id: string;
  projectCode: string;
  client: string;
  projectName: string;
  descriptionTh: string;
  descriptionEn: string;
  descriptionSource: string | null;
  contractPath: string | null;
  certificatePath: string | null;
  projectFolderPath: string | null;
  budgetAmount: string | null;
  budgetSource: string | null;
  vatStatus: string | null;
  budgetNote: string;
  budgetVerified: boolean;
  year: number | null;
  category: string | null;
  tags: string[];
  workTypes: string[];
};

// The project's own folder in the wider archive (`_Project …`), where its
// TOR and working files live — distinct from the two `_BID` document paths.
const PROJECT_FOLDER_LABEL = "โฟลเดอร์โครงการ (TOR และไฟล์ทำงาน)";

const VAT_LABEL: Record<string, string> = {
  included: "รวม VAT",
  excluded: "ไม่รวม VAT",
  unspecified: "VAT ไม่ระบุ",
};

const SOURCE_LABEL: Record<string, string> = {
  certificate: "จากหนังสือรับรอง",
  contract: "จากสัญญา",
};

function formatBudget(amount: string | null): string {
  return amount ? fmt(amount, 2) : "-";
}

// The list stays deliberately sparse — name, client, year, budget — so a
// search result reads at a glance; everything else (description, note,
// file paths, editing) lives in the popup opened by clicking a row.
// canEdit false = view-only access (lib/access.ts): no edit or confirm-budget
// buttons. The server actions check the same permission on their own.
export default function ProjectCardList({
  cards,
  taxonomy,
  canEdit,
}: {
  cards: ProjectCardRow[];
  taxonomy: Taxonomy;
  canEdit: boolean;
}) {
  const categoryLabel = (value: string) => termLabel(taxonomy.categories, value);
  const [openId, setOpenId] = useState<string | null>(null);
  // Looked up from the latest props (not a copy held in state) so the popup
  // shows the saved values once revalidatePath re-renders the page.
  const openCard = cards.find((c) => c.id === openId) ?? null;

  return (
    <>
      <div className="hidden grid-cols-[1fr_110px_70px_170px] gap-4 border-b border-line px-5 py-3 text-xs font-medium text-muted md:grid">
        <span>โครงการ</span>
        <span>ลูกค้า</span>
        <span>ปี</span>
        <span className="text-right">งบประมาณ (บาท)</span>
      </div>
      <ul className="divide-y divide-line">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => setOpenId(card.id)}
              className="ui-btn grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none md:grid-cols-[1fr_110px_70px_170px] md:items-center"
            >
              <span className="min-w-0">
                <span className="block font-medium leading-snug text-ink">{card.projectName}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {card.projectCode}
                  {/* Main Category dark, secondary ones (Tags) light — same as the popup. */}
                  {card.category ? (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-surface">
                      {categoryLabel(card.category)}
                    </span>
                  ) : null}
                  {card.tags.map((t) => (
                    <span key={t} className="rounded-full bg-chip px-2 py-0.5 text-[11px] text-muted">
                      {categoryLabel(t)}
                    </span>
                  ))}
                </span>
              </span>
              <span className="hidden text-sm text-label md:block">{card.client}</span>
              <span className="hidden text-sm text-label md:block">{card.year ?? "-"}</span>
              <span className="text-right">
                <span className="block font-medium tabular-nums text-ink">{formatBudget(card.budgetAmount)}</span>
                {card.budgetAmount && !card.budgetVerified ? (
                  <span className="block text-[11px] text-amber-600">ยังไม่ยืนยัน</span>
                ) : null}
              </span>
              <span className="col-span-2 text-xs text-muted md:hidden">
                {card.client}
                {card.year ? ` · ปี ${card.year}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {openCard ? <ProjectCardDetail key={openCard.id} card={openCard} taxonomy={taxonomy} canEdit={canEdit} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function ProjectCardDetail({
  card,
  taxonomy,
  canEdit,
  onClose,
}: {
  card: ProjectCardRow;
  taxonomy: Taxonomy;
  canEdit: boolean;
  onClose: () => void;
}) {
  const categoryLabel = (value: string) => termLabel(taxonomy.categories, value);
  const workTypeLabel = (value: string) => termLabel(taxonomy.workTypes, value);
  const [editing, setEditing] = useState(false);
  const [descriptionTh, setDescriptionTh] = useState(card.descriptionTh);
  const [descriptionEn, setDescriptionEn] = useState(card.descriptionEn);
  const [note, setNote] = useState(card.budgetNote);
  const [budget, setBudget] = useState(card.budgetAmount ?? "");
  const [category, setCategory] = useState(card.category ?? "");
  const [tags, setTags] = useState<string[]>(card.tags);
  const [workTypes, setWorkTypes] = useState<string[]>(card.workTypes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetForm() {
    setDescriptionTh(card.descriptionTh);
    setDescriptionEn(card.descriptionEn);
    setNote(card.budgetNote);
    setBudget(card.budgetAmount ?? "");
    setCategory(card.category ?? "");
    setTags(card.tags);
    setWorkTypes(card.workTypes);
    setError(null);
  }

  // Updater for setTags/setWorkTypes: adds `value` if absent, removes it if present.
  const toggled = (value: string) => (prev: string[]) =>
    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];

  function save() {
    const trimmed = budget.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && !Number.isFinite(parsed)) {
      setError("จำนวนงบประมาณไม่ถูกต้อง");
      return;
    }
    if (workTypes.length === 0 && card.workTypes.length > 0) {
      setError("ต้องเลือกลักษณะงานอย่างน้อย 1 อย่าง");
      return;
    }
    const original = card.budgetAmount === null ? null : Number(card.budgetAmount);
    startTransition(async () => {
      try {
        await updateProjectCardDetails(card.id, {
          descriptionTh,
          descriptionEn,
          budgetNote: note,
          ...(parsed !== original ? { budgetAmount: parsed } : {}),
          category: category || null,
          // A Tag equal to the Category is redundant (and rejected), so it's
          // dropped rather than blocking the save.
          tags: tags.filter((t) => t !== category),
          workTypes,
        });
        setEditing(false);
        setError(null);
      } catch {
        setError("บันทึกไม่สำเร็จ ลองอีกครั้ง");
      }
    });
  }

  function confirmBudget() {
    startTransition(async () => {
      try {
        await verifyProjectCardBudget(card.id, card.budgetAmount === null ? null : Number(card.budgetAmount));
      } catch {
        setError("ยืนยันงบไม่สำเร็จ ลองอีกครั้ง");
      }
    });
  }

  const budgetChips = [
    card.budgetSource ? SOURCE_LABEL[card.budgetSource] ?? card.budgetSource : null,
    card.vatStatus ? VAT_LABEL[card.vatStatus] ?? card.vatStatus : null,
  ].filter(Boolean);

  return (
    <Modal open onClose={pending ? () => {} : onClose} labelledBy="project-card-heading" width={680}>
      <div className="-mx-6 -my-6 flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-chip px-2.5 py-0.5 font-medium text-label">{card.projectCode}</span>
              <span>{card.client}</span>
              {card.year ? <span>· ปี {card.year}</span> : null}
            </div>
            <h2 id="project-card-heading" className="mt-2 font-display text-lg font-semibold leading-snug text-ink">
              {card.projectName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="ปิด"
            className="ui-btn shrink-0 rounded-input px-2 py-1 text-xl leading-none text-muted hover:bg-hover hover:text-ink"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <Section label="งบประมาณ (บาท)">
            {editing ? (
              <CommaNumberInput
                value={budget}
                onValueChange={setBudget}
                placeholder="จำนวนเงิน (บาท)"
                disabled={pending}
                className="h-11 w-full max-w-xs rounded-field border border-line bg-surface px-3 text-base tabular-nums text-ink outline-none focus:border-ink"
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl font-semibold tabular-nums text-ink">{formatBudget(card.budgetAmount)}</span>
                {card.budgetAmount ? (
                  card.budgetVerified ? (
                    <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">ยืนยันแล้ว</span>
                  ) : (
                    <>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">ยังไม่ยืนยัน</span>
                      {canEdit ? (
                        <Button size="sm" variant="primary" onClick={confirmBudget} disabled={pending}>
                          ยืนยันงบนี้
                        </Button>
                      ) : null}
                    </>
                  )
                ) : null}
              </div>
            )}
            {budgetChips.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {budgetChips.map((t) => (
                  <span key={t} className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {editing && budget !== (card.budgetAmount ?? "") ? (
              <p className="mt-2 text-xs text-muted">
                แก้งบเป็น {budget ? withCommas(budget) : "ว่าง"} — เมื่อบันทึกจะนับเป็นงบที่ยืนยันแล้ว
              </p>
            ) : null}
          </Section>

          <Section label="หมวดหมู่">
            {editing ? (
              <div className="flex flex-col gap-3">
                <div className="-mb-1.5 text-xs text-muted">หมวดหลัก</div>
                <select
                  aria-label="หมวดหลัก"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={pending}
                  className="h-11 w-full max-w-xs rounded-field border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-ink"
                >
                  <option value="">— ยังไม่ระบุหมวด —</option>
                  {taxonomy.categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.en} · {c.th}
                    </option>
                  ))}
                </select>
                <div>
                  <div className="mb-1.5 text-xs text-muted">หมวดหมู่รอง (งานเทคโนโลยีอื่นในโครงการ)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {taxonomy.categories.filter((c) => c.value !== category).map((c) => {
                      return (
                        <ToggleChip
                          key={c.value}
                          on={tags.includes(c.value)}
                          disabled={pending}
                          onClick={() => setTags(toggled(c.value))}
                        >
                          {c.en}
                        </ToggleChip>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : card.category || card.tags.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {card.category ? (
                  <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-surface">
                    {categoryLabel(card.category)}
                  </span>
                ) : null}
                {card.tags.map((t) => (
                  <span key={t} className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">
                    {categoryLabel(t)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">ยังไม่ระบุหมวด</p>
            )}
          </Section>

          <Section label="ลักษณะงาน">
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {taxonomy.workTypes.map((w) => (
                  <ToggleChip
                    key={w.value}
                    on={workTypes.includes(w.value)}
                    disabled={pending}
                    onClick={() => setWorkTypes(toggled(w.value))}
                  >
                    {w.en} · {w.th}
                  </ToggleChip>
                ))}
              </div>
            ) : card.workTypes.length ? (
              <div className="flex flex-wrap gap-1.5">
                {card.workTypes.map((w) => (
                  <span key={w} className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">
                    {workTypeLabel(w)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">ยังไม่ระบุลักษณะงาน</p>
            )}
          </Section>

          <Section label="รายละเอียดโครงการ">
            {editing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  aria-label="รายละเอียดภาษาไทย"
                  value={descriptionTh}
                  onChange={(e) => setDescriptionTh(e.target.value)}
                  rows={4}
                  disabled={pending}
                  placeholder="อธิบายว่าโครงการนี้ทำอะไร (ภาษาไทย)"
                  className="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-ink"
                />
                <textarea
                  aria-label="รายละเอียดภาษาอังกฤษ"
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  rows={3}
                  disabled={pending}
                  placeholder="What the project delivered (English)"
                  className="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-ink"
                />
                <p className="text-xs text-muted">ถ้าแก้คำอธิบาย จะติดป้าย “แก้ไขโดยคน” และการอัปเดตข้อมูลครั้งต่อไปจะไม่เขียนทับ</p>
              </div>
            ) : card.descriptionTh || card.descriptionEn ? (
              <div className="text-sm leading-6 text-label">
                {card.descriptionSource ? (
                  <span
                    className={`mb-1.5 inline-block rounded-full px-2 py-0.5 text-xs ${
                      // A name-only Description is a guess, not read from
                      // documents — flagged so it's never mistaken for one.
                      card.descriptionSource === "name" ? "bg-peach text-black" : "bg-chip text-muted"
                    }`}
                  >
                    {descriptionSourceLabel(card.descriptionSource)}
                  </span>
                ) : null}
                {card.descriptionTh ? <p className="whitespace-pre-line">{card.descriptionTh}</p> : null}
                {card.descriptionEn ? <p className="mt-1 whitespace-pre-line text-muted">{card.descriptionEn}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-muted">ยังไม่มีรายละเอียด</p>
            )}
          </Section>

          <Section label="หมายเหตุ">
            {editing ? (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                disabled={pending}
                placeholder="เช่น กิจการร่วมค้า, เงื่อนไขพิเศษ"
                className="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-ink"
              />
            ) : card.budgetNote ? (
              <p className="whitespace-pre-line text-sm leading-6 text-label">{card.budgetNote}</p>
            ) : (
              <p className="text-sm text-muted">-</p>
            )}
          </Section>

          <Section label="ตำแหน่งไฟล์">
            <div className="flex flex-col gap-2">
              {/* Always listed, "-" when blank: no folder, or none identified
                  with confidence (CONTEXT.md's Project Folder entry). */}
              {card.projectFolderPath ? (
                <PathRow label={PROJECT_FOLDER_LABEL} path={card.projectFolderPath} />
              ) : (
                <div>
                  <div className="mb-1 text-xs text-muted">{PROJECT_FOLDER_LABEL}</div>
                  <p className="text-sm text-muted">-</p>
                </div>
              )}
              {card.contractPath ? <PathRow label="สัญญา" path={card.contractPath} /> : null}
              {card.certificatePath ? <PathRow label="หนังสือรับรอง" path={card.certificatePath} /> : null}
            </div>
          </Section>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  resetForm();
                  setEditing(false);
                }}
              >
                ยกเลิก
              </Button>
              <Button variant="dark" size="sm" disabled={pending} onClick={save}>
                {pending ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
                ปิด
              </Button>
              {canEdit ? (
                <Button variant="dark" size="sm" onClick={() => setEditing(true)} disabled={pending}>
                  แก้ไข
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      {children}
    </section>
  );
}

function PathRow({ label, path }: { label: string; path: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-input bg-chip px-3 py-2 text-xs text-muted">{path}</code>
        <CopyButton value={path} label="คัดลอก" />
      </div>
    </div>
  );
}

function ToggleChip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`ui-btn rounded-full border px-2.5 py-1 text-xs transition-colors ${
        on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-label hover:bg-hover"
      }`}
    >
      {children}
    </button>
  );
}
