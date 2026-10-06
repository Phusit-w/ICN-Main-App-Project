// Versioned SOC skill packages (ADR 0008, ticket 11). An admin uploads the
// skill (`.skill`/zip), sees the versions and marks one current; SOC Runners
// fetch the current one for each check (ticket 13). The server stores the
// package as it serves it: the upload plus the headless step-0 instruction
// (lib/soc-skill-headless.ts). See docs/SOC-SKILL-HOSTING.md.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireRole, writeAudit } from "@/lib/authorization";
import { resolveStorageKey, socStorageRoot } from "@/lib/soc";
import { readZip, writeZip, type ZipEntry } from "@/lib/zip";
import { HEADLESS_FILE, HEADLESS_INSTRUCTION, SKILL_NOTE, SKILL_NOTE_BEGIN, SKILL_NOTE_END } from "@/lib/soc-skill-headless";

export { HEADLESS_FILE } from "@/lib/soc-skill-headless";

export const MAX_SKILL_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
const VERSION = /^[A-Za-z0-9._:+-]{1,100}$/;
const STORAGE_DIR = "skill-packages";

// A name that would land outside the folder it is extracted into.
function unsafeEntryName(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  return normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..");
}

// Inserts SKILL_NOTE as "\n<note>\n" right after the YAML frontmatter (which
// must stay first for the skill to load), first removing a note an earlier
// pass put there, so a served package passed through again is unchanged.
function withSkillNote(skillMd: string): string {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = skillMd.replace(new RegExp(`\\n?${escape(SKILL_NOTE_BEGIN)}[\\s\\S]*?${escape(SKILL_NOTE_END)}\\n?`), "");
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  if (!frontmatter) return `${SKILL_NOTE}\n${text}`;
  return `${frontmatter[0]}\n${SKILL_NOTE}\n${text.slice(frontmatter[0].length)}`;
}

// The package as SOC Runners get it: every file of the upload unchanged,
// SKILL.md with a note pointing to HEADLESS.md after its frontmatter, and
// HEADLESS.md next to SKILL.md. Running it on its own output changes nothing.
// Throws a Thai message when the file isn't a usable skill package.
export function prepareServedPackage(bytes: Uint8Array): { bytes: Uint8Array<ArrayBuffer>; rootDir: string } {
  let entries: ZipEntry[];
  try {
    entries = readZip(bytes, { maxTotalBytes: MAX_UNPACKED_BYTES });
  } catch {
    throw new Error("ไฟล์ skill ต้องเป็นไฟล์ .skill หรือ .zip ที่อ่านได้");
  }
  const unsafe = entries.find((e) => unsafeEntryName(e.name));
  if (unsafe) throw new Error(`ชื่อไฟล์ใน package ไม่ปลอดภัย: ${unsafe.name}`);
  const skillFiles = entries.filter((e) => /^([^/]+\/)?SKILL\.md$/.test(e.name));
  if (skillFiles.length !== 1) throw new Error("package ต้องมี SKILL.md หนึ่งไฟล์ ที่รากของ zip หรือในโฟลเดอร์ของ skill");
  const skill = skillFiles[0];
  const rootDir = skill.name.slice(0, -"SKILL.md".length);
  const headlessName = `${rootDir}${HEADLESS_FILE}`;
  const served = entries
    .filter((e) => e.name !== headlessName)
    .map((e) => (e === skill ? { name: e.name, data: Buffer.from(withSkillNote(e.data.toString("utf8")), "utf8") } : e));
  served.push({ name: headlessName, data: Buffer.from(HEADLESS_INSTRUCTION, "utf8") });
  return { bytes: writeZip(served), rootDir };
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type UploadResult =
  | { ok: true; id: string; version: string; isCurrent: boolean }
  | { ok: false; error: string };

// ADMIN only. Stores a new version; the first one uploaded becomes current,
// later ones stay until an admin sets them current. A blank version is named
// `sha256:<first 16 hex>` of the uploaded file, the form earlier runs used.
export async function uploadSocSkillPackage(input: { name: string; bytes: Uint8Array; version?: string }): Promise<UploadResult> {
  const actor = await requireRole("ADMIN");
  if (input.bytes.byteLength > MAX_SKILL_PACKAGE_BYTES) return { ok: false, error: `ไฟล์ skill ต้องมีขนาดไม่เกิน ${MAX_SKILL_PACKAGE_BYTES / 1024 / 1024} MB` };
  const sourceChecksum = sha256(input.bytes);
  const version = input.version?.trim() || `sha256:${sourceChecksum.slice(0, 16)}`;
  if (!VERSION.test(version)) return { ok: false, error: "เวอร์ชันใช้ได้เฉพาะ A-Z a-z 0-9 . _ : + - ไม่เกิน 100 ตัว" };
  let served: ReturnType<typeof prepareServedPackage>;
  try {
    served = prepareServedPackage(input.bytes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "อ่านไฟล์ skill ไม่ได้" };
  }
  const duplicate = { ok: false as const, error: `มี skill เวอร์ชัน ${version} อยู่แล้ว กรุณาตั้งชื่อเวอร์ชันใหม่` };
  if (await prisma.socSkillPackage.findUnique({ where: { version } })) return duplicate;

  const id = randomUUID();
  const storageKey = path.posix.join(STORAGE_DIR, `${id}.skill`);
  const absolute = path.join(socStorageRoot(), STORAGE_DIR, `${id}.skill`);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, served.bytes, { flag: "wx" });
  const record = {
    id, version, storageKey, rootDir: served.rootDir,
    originalName: path.basename(input.name).slice(0, 240),
    sizeBytes: served.bytes.byteLength, checksum: sha256(served.bytes), sourceChecksum,
    uploadedById: actor.id,
  };
  let isCurrent: boolean;
  try {
    isCurrent = await prisma.$transaction(async (tx) => {
      await tx.socSkillPackage.create({ data: record });
      // Only when no version is current yet; never replaces one.
      await tx.socCurrentSkill.createMany({ data: [{ packageId: id }], skipDuplicates: true });
      return (await tx.socCurrentSkill.findUnique({ where: { key: "current" } }))?.packageId === id;
    });
  } catch (error) {
    await rm(absolute, { force: true }).catch(() => undefined);
    if ((error as { code?: string }).code === "P2002") return duplicate;
    throw error;
  }
  await writeAudit({
    actorId: actor.id, action: "SOC_SKILL_UPLOADED", entityType: "SOC_SKILL", entityId: id,
    summary: `อัปโหลด SOC skill เวอร์ชัน ${version}${isCurrent ? " (ตั้งเป็นเวอร์ชันปัจจุบัน)" : ""}`,
    metadata: { version, originalName: record.originalName, sizeBytes: record.sizeBytes, checksum: record.checksum, sourceChecksum, isCurrent },
  });
  return { ok: true, id, version, isCurrent };
}

// ADMIN only. Every version, newest upload first.
export async function listSocSkillPackages() {
  await requireRole("ADMIN");
  const packages = await prisma.socSkillPackage.findMany({
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { displayName: true } }, current: { select: { key: true } } },
  });
  return packages.map((p) => ({
    id: p.id, version: p.version, originalName: p.originalName, sizeBytes: p.sizeBytes, checksum: p.checksum,
    createdAt: p.createdAt, uploadedByName: p.uploadedBy?.displayName ?? null, isCurrent: Boolean(p.current),
  }));
}

// ADMIN only. Makes `packageId` the one current version.
export async function setCurrentSocSkillPackage(packageId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireRole("ADMIN");
  const target = await prisma.socSkillPackage.findUnique({ where: { id: packageId } });
  if (!target) return { ok: false, error: "ไม่พบ skill เวอร์ชันนี้" };
  // Read and switch in one transaction, so the audit's "before" is the
  // version this call actually replaced.
  const previous = await prisma.$transaction(async (tx) => {
    const before = await tx.socCurrentSkill.findUnique({ where: { key: "current" }, include: { package: { select: { version: true } } } });
    if (before?.packageId !== target.id) await tx.socCurrentSkill.upsert({ where: { key: "current" }, create: { packageId: target.id }, update: { packageId: target.id } });
    return before;
  }, { isolationLevel: "Serializable" });
  if (previous?.packageId === target.id) return { ok: true };
  await writeAudit({
    actorId: actor.id, action: "SOC_SKILL_SET_CURRENT", entityType: "SOC_SKILL", entityId: target.id,
    summary: `ตั้ง SOC skill เวอร์ชัน ${target.version} เป็นเวอร์ชันปัจจุบัน${previous ? ` (แทน ${previous.package.version})` : ""}`,
    before: previous ? { version: previous.package.version } : null,
    metadata: { version: target.version },
  });
  return { ok: true };
}

// The version SOC Runners use, or null before any upload. No access check:
// callers (the runner API, the job page) do their own.
export async function currentSocSkillPackage() {
  const current = await prisma.socCurrentSkill.findUnique({ where: { key: "current" }, include: { package: true } });
  return current?.package ?? null;
}

// Every hosted version in upload order, and the current one, for comparing
// a major item's skill version (skillVersionStatus in lib/soc-shared.ts).
export async function socSkillVersions() {
  const [packages, current] = await Promise.all([
    prisma.socSkillPackage.findMany({ orderBy: { createdAt: "asc" }, select: { version: true, createdAt: true } }),
    currentSocSkillPackage(),
  ]);
  return { packages, currentVersion: current?.version ?? null };
}

// The stored (served) package file. No access check; see the callers.
export async function readSocSkillPackage(packageId: string) {
  const record = await prisma.socSkillPackage.findUnique({ where: { id: packageId } });
  if (!record) return null;
  return { record, bytes: await readFile(resolveStorageKey(record.storageKey)) };
}

// e.g. "tor-word-compliance-check-sha256-66938c26cb0ed5ae.skill"
export function socSkillDownloadName(record: { rootDir: string; version: string }) {
  const base = record.rootDir.replace(/\/$/, "") || "soc-skill";
  return `${base}-${record.version}.skill`.replace(/[^A-Za-z0-9._+-]/g, "-");
}
