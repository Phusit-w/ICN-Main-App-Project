export const SOC_STATUSES = [
  "DRAFT", "QUEUED", "PROCESSING", "NEEDS_REVIEW", "CONFIRMED",
  "EXPORTING", "COMPLETED", "FAILED", "EXPIRED",
] as const;

export const SOC_CHECK_STATUSES = [
  "match", "mismatch", "review", "not_found", "unverifiable", "not_applicable",
] as const;

export const SOC_HEADING_STATUSES = [
  "match", "mismatch", "unverifiable", "not_applicable",
] as const;

export type SocCheckStatus = (typeof SOC_CHECK_STATUSES)[number];
export type SocHeadingStatus = (typeof SOC_HEADING_STATUSES)[number];

export const SOC_STATUS_LABELS: Record<string, string> = {
  DRAFT: "แบบร่าง", QUEUED: "รอประมวลผล", PROCESSING: "กำลังตรวจสอบ",
  NEEDS_REVIEW: "รอตรวจทาน", CONFIRMED: "ยืนยันแล้ว", EXPORTING: "กำลังสร้างเอกสาร",
  COMPLETED: "เสร็จสิ้น", FAILED: "เกิดข้อผิดพลาด", EXPIRED: "หมดอายุ",
};

export const CHECK_LABELS: Record<string, string> = {
  match: "ตรง", mismatch: "ไม่ตรง", review: "ต้องตรวจทาน", not_found: "ไม่พบเลขหน้า",
  unverifiable: "ยืนยันไม่ได้", not_applicable: "ไม่ต้องตรวจ",
};

// Major item (ข้อใหญ่) check states of an Imported SOC Check. "confirmed" is
// not stored: an item shows as confirmed once every row has a Final Decision.
export const SOC_MAJOR_ITEM_STATE_LABELS: Record<string, string> = {
  not_checked: "ยังไม่ตรวจ", requested: "รอเครื่องของผู้ขอ", running: "กำลังตรวจ",
  paused_quota: "หยุดชั่วคราว", needs_documents: "ขาดเอกสาร", checked: "ตรวจแล้ว",
  failed: "ตรวจไม่สำเร็จ", confirmed: "ยืนยันแล้ว",
};

// "ตรวจแล้ว checked/total ข้อใหญ่" on the /soc list and the job page.
export function majorItemProgress(items: readonly { state: string }[]) {
  const checked = items.filter((item) => item.state === "checked").length;
  return { checked, total: items.length, percent: items.length ? Math.round((checked / items.length) * 100) : 0 };
}

export const SOC_RUN_SOURCE_LABELS: Record<string, string> = { manual: "นำเข้าด้วยมือ", runner: "SOC Runner" };

// Thai labels for the values of an imported row's axes, as the skill's
// SOC_Check document writes them (append_results_to_docx.py).
export const SOC_AXIS_VALUE_LABELS: Record<string, string> = {
  match: "ตรง", mismatch: "ไม่ตรง", not_found: "ไม่พบ", unverifiable: "ยืนยันไม่ได้", not_applicable: "ไม่เกี่ยวข้อง",
  complete: "ครบ", partial: "บางส่วน",
  fully_supported: "รองรับครบ", partially_supported: "รองรับบางส่วน", not_supported: "ไม่รองรับ", wording_conflict: "ถ้อยคำขัดกัน",
  compliant: "ผ่าน", better: "ดีกว่า", non_compliant: "ไม่ผ่าน", mixed: "ผสม",
  not_selected: "ไม่ได้เลือก", ambiguous: "กำกวม", both: "เลือกทั้งสอง",
};

// How a major item's skill version compares with the current hosted one, by
// upload order: "older"/"newer" for a hosted version uploaded before/after
// the current one, "unhosted" for a version the server doesn't hold (e.g. a
// manual run of a local copy). null when the item has no version or nothing
// is current.
export type SkillVersionStatus = "current" | "older" | "newer" | "unhosted";
export function skillVersionStatus(
  version: string | null,
  packages: readonly { version: string; createdAt: Date }[],
  currentVersion: string | null,
): SkillVersionStatus | null {
  if (!version || !currentVersion) return null;
  if (version === currentVersion) return "current";
  const hosted = packages.find((p) => p.version === version);
  const current = packages.find((p) => p.version === currentVersion);
  if (!hosted || !current) return "unhosted";
  return hosted.createdAt < current.createdAt ? "older" : "newer";
}
