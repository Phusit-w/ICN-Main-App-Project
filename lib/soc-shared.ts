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
  not_checked: "ยังไม่ตรวจ", requested: "รอคิวตรวจ", running: "กำลังตรวจ",
  paused_quota: "หยุดชั่วคราว", needs_login: "รอเข้าสู่ระบบ Claude", needs_documents: "ขาดเอกสาร",
  checked: "ตรวจแล้ว", failed: "ตรวจไม่สำเร็จ", confirmed: "ยืนยันแล้ว",
};

// Check Requests (ticket 13). An open request belongs to its major item until
// it is done, cancelled or closed with needs_documents/failed; the item's
// state mirrors it. A user may ask for a check when the item is in one of
// SOC_REQUESTABLE_ITEM_STATES.
export const SOC_CHECK_REQUEST_OPEN_STATES = ["requested", "running", "paused_quota", "needs_login"] as const;
export const SOC_REQUESTABLE_ITEM_STATES = ["not_checked", "checked", "failed", "needs_documents"] as const;
export const isOpenCheckRequestState = (state: string) => (SOC_CHECK_REQUEST_OPEN_STATES as readonly string[]).includes(state);
export const isRequestableItemState = (state: string) => (SOC_REQUESTABLE_ITEM_STATES as readonly string[]).includes(state);

// A running request returns to `requested` when its runner has shown no sign
// of life (claim, report or heartbeat) for this long.
export const SOC_CHECK_REQUEST_STALE_MS = 2 * 60 * 1000;

// The open request on a major item, as the job page shows it.
export type SocCheckRequestView = {
  id: string; state: string; requestedById: string; requestedByName: string;
  // The requester's SOC Runner, or null when they have no active link.
  runnerState: SocRunnerState | null;
  progressNote: string | null; resumeAt: string | null;
};

// "๑๓" → "13".
export function toArabicDigits(value: string): string {
  return value.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

// "HH:MM" in Thai time, the same on the server and in the browser.
export function socClockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

// A major item's state in Thai, for the viewer: the label, plus a detail line
// when there is one. "รอเครื่องของคุณเปิด" when the requester's runner is off.
export function majorItemStateText(
  item: { state: string; missingDocuments?: readonly string[] | null; failureReason?: string | null; request?: SocCheckRequestView | null; confirmed?: boolean },
  viewerId: string,
): { label: string; detail: string | null } {
  const request = item.request ?? null;
  const self = !request || request.requestedById === viewerId;
  const machine = `เครื่องของ${self ? "คุณ" : ` ${request.requestedByName}`}`;
  switch (item.state) {
    case "requested":
      if (request && request.runnerState !== "online") {
        return { label: `รอ${machine}เปิด`, detail: request.runnerState ? null : `${self ? "คุณ" : request.requestedByName}ยังไม่ได้เชื่อม SOC Runner` };
      }
      return { label: SOC_MAJOR_ITEM_STATE_LABELS.requested, detail: request ? `บน${machine}` : null };
    case "running":
      return { label: SOC_MAJOR_ITEM_STATE_LABELS.running, detail: request?.progressNote ?? null };
    case "paused_quota":
      return { label: SOC_MAJOR_ITEM_STATE_LABELS.paused_quota, detail: request?.resumeAt ? `จะตรวจต่อประมาณ ${socClockTime(request.resumeAt)}` : "รอโควตา Claude กลับมา" };
    case "needs_login":
      return { label: SOC_MAJOR_ITEM_STATE_LABELS.needs_login, detail: `SOC Runner บน${machine}ต้องเข้าสู่ระบบ Claude ใหม่: เปิดโปรแกรม claude แล้วพิมพ์ /login แล้วจะตรวจต่อเอง` };
    case "needs_documents":
      return { label: SOC_MAJOR_ITEM_STATE_LABELS.needs_documents, detail: item.missingDocuments?.length ? `ไม่มีไฟล์: ${item.missingDocuments.join(", ")}` : null };
    case "failed":
      return { label: SOC_MAJOR_ITEM_STATE_LABELS.failed, detail: item.failureReason ?? null };
    case "checked":
      // Checked after [ตรวจต่อโดยไม่มีไฟล์นี้]: rows citing these are unverifiable.
      // Shows as confirmed once every row has a Final Decision (ticket 08).
      return { label: SOC_MAJOR_ITEM_STATE_LABELS[item.confirmed ? "confirmed" : "checked"], detail: item.missingDocuments?.length ? `ตรวจโดยไม่มีไฟล์: ${item.missingDocuments.join(", ")}` : null };
    default:
      return { label: SOC_MAJOR_ITEM_STATE_LABELS[item.state] || item.state, detail: null };
  }
}

// "ตรวจแล้ว checked/total ข้อใหญ่" on the /soc list and the job page. Items
// set to ไม่ต้องตรวจ don't count.
export function majorItemProgress(items: readonly { state: string; skipped?: boolean }[]) {
  const counted = items.filter((item) => !item.skipped);
  const checked = counted.filter((item) => item.state === "checked").length;
  return { checked, total: counted.length, percent: counted.length ? Math.round((checked / counted.length) * 100) : 0 };
}

export const SOC_RUN_SOURCE_LABELS: Record<string, string> = { manual: "นำเข้าด้วยมือ", runner: "SOC Runner" };

// Thai labels for the values of an imported row's axes, as the skill's
// SOC_Check document writes them (append_results_to_docx.py).
// Upload limits, checked by the server (lib/soc.ts) and, before sending, by
// the upload forms.
export const MAX_SOC_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_EVIDENCE_FILE_BYTES = 120 * 1024 * 1024;
export const MAX_EVIDENCE_TOTAL_BYTES = 250 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 10;

// Why the chosen PDFs can't be sent, or null. The server checks the same.
export function evidenceSelectionProblem(files: readonly { name: string; size: number }[]): string | null {
  if (files.length < 1 || files.length > MAX_EVIDENCE_FILES) return `กรุณาแนบ PDF 1–${MAX_EVIDENCE_FILES} ไฟล์`;
  const tooBig = files.find((f) => f.size > MAX_EVIDENCE_FILE_BYTES);
  if (tooBig) return `ไฟล์ ${tooBig.name} ต้องมีขนาดไม่เกิน ${MAX_EVIDENCE_FILE_BYTES / 1024 / 1024} MB`;
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_EVIDENCE_TOTAL_BYTES) return `ไฟล์ Datasheet / Catalog รวมกันต้องมีขนาดไม่เกิน ${MAX_EVIDENCE_TOTAL_BYTES / 1024 / 1024} MB`;
  return null;
}

export const SOC_AXIS_VALUE_LABELS: Record<string, string> = {
  match: "ตรง", mismatch: "ไม่ตรง", not_found: "ไม่พบ", unverifiable: "ยืนยันไม่ได้", not_applicable: "ไม่เกี่ยวข้อง",
  complete: "ครบ", partial: "บางส่วน", partial_visible: "ครบตามที่เห็นในหน้า (บางคำไม่ได้ highlight)", related: "ตรงเรื่อง", unrelated: "ไม่ตรงเรื่อง",
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

// SOC Runner links (ticket 12). A runner is online while its latest
// heartbeat is under SOC_RUNNER_ONLINE_MS old; runners send one every 30 s
// (docs/SOC-RUNNER.md), so this allows a few missed beats.
export const SOC_RUNNER_ONLINE_MS = 2 * 60 * 1000;
export type SocRunnerState = "online" | "offline" | "never_seen";
export function socRunnerState(lastSeenAt: Date | null, now = new Date()): SocRunnerState {
  if (!lastSeenAt) return "never_seen";
  return now.getTime() - lastSeenAt.getTime() < SOC_RUNNER_ONLINE_MS ? "online" : "offline";
}

export const SOC_RUNNER_STATE_LABELS: Record<SocRunnerState, string> = {
  online: "ออนไลน์", offline: "ออฟไลน์", never_seen: "ยังไม่เคยเชื่อมต่อ",
};

// The name of the runner config a user downloads from /soc.
export const SOC_RUNNER_CONFIG_FILE = "soc-runner.json";

// The Claude login state a runner reports in its heartbeat.
export const SOC_CLAUDE_LOGINS = ["logged_in", "logged_out", "unknown"] as const;
export type SocClaudeLogin = (typeof SOC_CLAUDE_LOGINS)[number];
export const SOC_CLAUDE_LOGIN_LABELS: Record<SocClaudeLogin, string> = {
  logged_in: "เข้าสู่ระบบ Claude แล้ว", logged_out: "ต้องเข้าสู่ระบบ Claude ใหม่", unknown: "ไม่ทราบสถานะ Claude",
};

// Why a Runner Link stopped working: the user downloaded a new config, or an
// admin revoked it.
export type SocRunnerRevokeReason = "replaced" | "admin";
export const SOC_RUNNER_REVOKE_REASON_LABELS: Record<SocRunnerRevokeReason, string> = {
  replaced: "ผู้ใช้ดาวน์โหลดใหม่", admin: "ผู้ดูแลยกเลิก",
};

// A Runner Link as /soc and the admin page show it (dates as ISO strings).
export type SocRunnerView = {
  state: SocRunnerState; lastSeenAt: string | null; runnerVersion: string | null;
  claudeLogin: SocClaudeLogin | null; linkedAt: string;
  revokedAt: string | null; revokeReason: SocRunnerRevokeReason | null;
};

// A major item with more SOC rows than this is split on import into its
// second-level sub-sections, one major item record each: one Local Check Run
// of a whole large item (MOF_RFID ๕, about 240 rows) uses about half a Claude
// Pro window. One with no sub-sections stays whole, with a warning.
export const SPLIT_MAJOR_ITEM_ROWS = 60;

// A major item over the split threshold that stayed whole (no sub-sections
// to split into): the job page warns it may use a lot of quota. Null rowCount
// = imported before splitting, no warning.
export const isLargeUnsplitMajorItem = (item: { groupLabel: string | null; rowCount: number | null }) =>
  !item.groupLabel && (item.rowCount ?? 0) > SPLIT_MAJOR_ITEM_ROWS;
