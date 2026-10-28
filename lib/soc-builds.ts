// SOC Builds of สร้าง SOC (ADR 0011): a TOR PDF, the pages the user chose and a
// SOC Template in, a Generated SOC Draft out, kept as a SocBuild for 30 days.
// A build is its own record, separate from SOC check jobs. This file creates,
// lists, downloads and deletes builds; the splitting and template filling are
// lib/soc-builder.ts.
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { buildSocDraft, type PageRange } from "@/lib/soc-builder";
import { cleanSocTitle, requireSocActor, resolveStorageKey, storeSocFile } from "@/lib/soc";
import { DOCX_MIME, toArabicDigits } from "@/lib/soc-shared";
import { assertTemplateFile } from "@/lib/soc-templates";
import { readTextTor } from "@/lib/soc-tor-read";

type SocActor = Awaited<ReturnType<typeof requireAccess>>;
type Upload = { name: string; bytes: Uint8Array };

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SCANNED_TOR = "TOR นี้เป็นไฟล์สแกน ตอนนี้สร้าง SOC ได้เฉพาะ TOR ที่เป็นข้อความ (PDF ที่เลือกข้อความในไฟล์ได้)";
const NO_TEMPLATE = "ไม่พบเทมเพลตนี้ในรายการ กรุณาเลือกเทมเพลตใหม่";

// "12-40, 55-60" or "7" (Thai digits too) as inclusive [from, to] pairs, kept
// in the order typed. Throws the message the form shows: a range that is
// malformed, backwards, or beyond the TOR's last page.
export function parsePageRanges(text: string, pageCount: number): PageRange[] {
  const parts = toArabicDigits(text).split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) throw new Error("กรุณาใส่ช่วงหน้าของ TOR ที่ต้องการ เช่น 12-40, 55-60");
  return parts.map((part) => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) throw new Error(`ช่วงหน้า "${part}" ไม่ถูกต้อง ใช้รูปแบบ 12-40, 55-60`);
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (from < 1 || to < from) throw new Error(`ช่วงหน้า "${part}" ไม่ถูกต้อง เลขหน้าแรกต้องไม่มากกว่าหน้าสุดท้าย และเริ่มที่หน้า 1`);
    if (to > pageCount) throw new Error(`ช่วงหน้า "${part}" เกินหน้าสุดท้ายของ TOR (TOR มี ${pageCount} หน้า)`);
    return [from, to] as const;
  });
}

// The build's title: as typed, else the TOR file's name without .pdf. Duplicates are allowed.
const buildTitle = (typed: unknown, torName: string) => cleanSocTitle(String(typed ?? "").trim() || torName.replace(/\.pdf$/i, ""));

async function templateFile(template: { id: string } | { file: Upload }): Promise<{ name: string; bytes: Uint8Array }> {
  if ("file" in template) {
    assertTemplateFile(template.file);
    return template.file;
  }
  const stored = await prisma.socTemplate.findUnique({ where: { id: template.id } });
  if (!stored) throw new Error(NO_TEMPLATE);
  return { name: stored.name, bytes: new Uint8Array(await readFile(resolveStorageKey(stored.storageKey))) };
}

// Builds the draft from a text TOR and keeps it. The TOR file must already be
// checked as a PDF (validateUpload). Nothing is kept if any step fails.
export async function createSocBuild(actor: SocActor, input: { title?: unknown; tor: Upload; pageRanges: string; template: { id: string } | { file: Upload } }) {
  const title = buildTitle(input.title, input.tor.name);
  const tor = readTextTor(input.tor.bytes);
  if (!tor.pages) throw new Error(SCANNED_TOR);
  const ranges = parsePageRanges(input.pageRanges, tor.pageCount);
  const template = await templateFile(input.template);
  const draft = buildSocDraft(template.bytes, tor.pages, ranges);

  const id = randomUUID();
  const folder = `builds/${id}`;
  try {
    const torFile = await storeSocFile(folder, input.tor.name, ".pdf", input.tor.bytes);
    const templateStored = await storeSocFile(folder, template.name, ".docx", template.bytes);
    const output = await storeSocFile(folder, `SOC-${title}.docx`, ".docx", draft.bytes);
    const build = await prisma.socBuild.create({
      data: {
        id, title, ownerId: actor.id, status: "READY", pageRanges: input.pageRanges.trim(), pageRangeList: ranges.map(([from, to]) => [from, to]),
        pagesDone: tor.pageCount, pagesTotal: tor.pageCount, warnings: draft.warnings, rowCount: draft.rowCount,
        torName: torFile.originalName, torStorageKey: torFile.storageKey, templateName: template.name, templateStorageKey: templateStored.storageKey,
        outputStorageKey: output.storageKey, purgeAfter: new Date(Date.now() + RETENTION_MS),
      },
    });
    await writeAudit({ actorId: actor.id, action: "SOC_BUILD_CREATED", entityType: "SOC_BUILD", entityId: id, summary: `สร้าง SOC ${title} (${draft.rowCount} แถว)`, metadata: { title, torName: torFile.originalName, pageRanges: build.pageRanges, rowCount: draft.rowCount } });
    return build;
  } catch (error) {
    await rm(resolveStorageKey(folder), { recursive: true, force: true });
    throw error;
  }
}

// A build opens for its owner and ADMIN; anyone else gets NOT_FOUND.
export async function authorizeSocBuild(id: string) {
  const actor = await requireSocActor();
  const build = await prisma.socBuild.findUnique({ where: { id } });
  if (!build || (build.ownerId !== actor.id && actor.role !== "ADMIN")) throw new Error("NOT_FOUND");
  return { actor, build };
}

export async function listSocBuilds(actor: SocActor) {
  const builds = await prisma.socBuild.findMany({ where: { ownerId: actor.id }, orderBy: { createdAt: "desc" } });
  return builds.map(({ id, title, status, scanned, pageRanges, rowCount, warnings, errorMessage, createdAt, purgeAfter }) => ({ id, title, status, scanned, pageRanges, rowCount, warnings: (warnings as string[] | null) ?? [], errorMessage, createdAt, purgeAfter }));
}

// The draft as `SOC-<title>.docx`, or null while there is none (not READY).
export async function downloadSocBuild(id: string) {
  const { build } = await authorizeSocBuild(id);
  if (build.status !== "READY" || !build.outputStorageKey) return null;
  const fileName = `SOC-${build.title.replace(/[\\/:*?"<>|]/g, "_")}.docx`;
  return { fileName, mimeType: DOCX_MIME, bytes: new Uint8Array(await readFile(resolveStorageKey(build.outputStorageKey))) };
}

export async function deleteSocBuild(id: string) {
  const { actor, build } = await authorizeSocBuild(id);
  await prisma.socBuild.delete({ where: { id } });
  await rm(resolveStorageKey(path.posix.dirname(build.torStorageKey)), { recursive: true, force: true });
  await writeAudit({ actorId: actor.id, action: "SOC_BUILD_DELETED", entityType: "SOC_BUILD", entityId: id, summary: `ลบ SOC ที่สร้าง ${build.title}`, metadata: { title: build.title, ownerId: build.ownerId } });
}
