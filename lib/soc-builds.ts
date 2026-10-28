// SOC Builds of สร้าง SOC (ADR 0011): a TOR PDF, the pages the user chose and a
// SOC Template in, a Generated SOC Draft out, kept as a SocBuild for 30 days.
// A build is its own record, separate from SOC check jobs. This file creates,
// lists, downloads, cancels, resumes and deletes builds; the splitting and
// template filling are lib/soc-builder.ts. A scanned TOR is read by the
// outside OCR for the chosen pages only, in the server's one OCR line
// (lib/soc-ocr-queue.ts), and the draft is built when the read ends.
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireAccess, writeAudit } from "@/lib/authorization";
import { assertSocTemplate, buildSocDraft, pageNumbers, type PageRange } from "@/lib/soc-builder";
import { cleanSocTitle, OCR_CONFIRM_REQUIRED, requireSocActor, resolveStorageKey, socStorageRoot, storeSocFile } from "@/lib/soc";
import { queueOcrRead, stopOcrRead, type OcrRun } from "@/lib/soc-ocr-queue";
import type { CellReader } from "@/lib/soc-pdf-soc";
import { DOCX_MIME, toArabicDigits } from "@/lib/soc-shared";
import { assertTemplateFile } from "@/lib/soc-templates";
import { readScannedTor, readTextTor } from "@/lib/soc-tor-read";
import { configuredOcrReader, OCR_NOT_SET_UP } from "@/lib/soc-typhoon";

type SocActor = Awaited<ReturnType<typeof requireAccess>>;
type Upload = { name: string; bytes: Uint8Array };

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const NO_TEMPLATE = "ไม่พบเทมเพลตนี้ในรายการ กรุณาเลือกเทมเพลตใหม่";
const READING_STAGE = "กำลังอ่าน TOR";
const WAITING_STAGE = "รอคิว";
const OPEN_STATES = ["QUEUED", "READING"];
const STOP_READING = new Error("the TOR is no longer being read");

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

// Where a scanned TOR's chosen pages are saved as the OCR reads them, so a
// read that stopped goes on without sending a page twice. In the build's folder: gone with it.
const buildPagesFile = (id: string) => path.join(socStorageRoot(), "builds", id, "tor-pages.jsonl");

// Creates a build and keeps it. The TOR file must already be checked as a PDF
// (validateUpload). A text TOR is built at once (READY). A scanned TOR goes
// to the outside OCR: the user must confirm that each time (`ocrConfirmed`,
// else OCR_CONFIRM_REQUIRED and nothing is stored or sent), it needs the OCR
// key, and it is read in the background (startBuildRead) after the reads
// already in line. Nothing is kept if any step before that fails.
export async function createSocBuild(
  actor: SocActor,
  input: { title?: unknown; tor: Upload; pageRanges: string; template: { id: string } | { file: Upload } },
  { readPage = configuredOcrReader(), ocrConfirmed = false }: { readPage?: CellReader; ocrConfirmed?: boolean } = {},
) {
  const title = buildTitle(input.title, input.tor.name);
  const tor = readTextTor(input.tor.bytes);
  const ranges = parsePageRanges(input.pageRanges, tor.pageCount);
  if (!tor.pages) {
    if (!readPage) throw new Error(OCR_NOT_SET_UP);
    if (!ocrConfirmed) throw new Error(OCR_CONFIRM_REQUIRED);
  }
  const template = await templateFile(input.template);
  assertSocTemplate(template.bytes); // a scanned build must not fail on its template an hour later
  const draft = tor.pages ? buildSocDraft(template.bytes, tor.pages, ranges) : null;
  const chosen = pageNumbers(ranges).length;

  const id = randomUUID();
  const folder = `builds/${id}`;
  try {
    const torFile = await storeSocFile(folder, input.tor.name, ".pdf", input.tor.bytes);
    const templateStored = await storeSocFile(folder, template.name, ".docx", template.bytes);
    const output = draft ? await storeSocFile(folder, `SOC-${title}.docx`, ".docx", draft.bytes) : null;
    const build = await prisma.socBuild.create({
      data: {
        id, title, ownerId: actor.id, status: draft ? "READY" : "QUEUED", scanned: !draft, stage: draft ? null : WAITING_STAGE,
        pageRanges: input.pageRanges.trim(), pageRangeList: ranges.map(([from, to]) => [from, to]),
        pagesDone: draft ? tor.pageCount : 0, pagesTotal: draft ? tor.pageCount : chosen, warnings: draft?.warnings ?? [], rowCount: draft?.rowCount ?? null,
        torName: torFile.originalName, torStorageKey: torFile.storageKey, templateName: template.name, templateStorageKey: templateStored.storageKey,
        outputStorageKey: output?.storageKey ?? null, purgeAfter: new Date(Date.now() + RETENTION_MS),
      },
    });
    await writeAudit({
      actorId: actor.id, action: "SOC_BUILD_CREATED", entityType: "SOC_BUILD", entityId: id,
      summary: draft ? `สร้าง SOC ${title} (${draft.rowCount} แถว)` : `สร้าง SOC ${title} จาก TOR สแกน (อ่านด้วย OCR ${chosen} หน้า)`,
      metadata: { title, torName: torFile.originalName, pageRanges: build.pageRanges, scanned: !draft, rowCount: draft?.rowCount ?? null },
    });
    if (!draft) void startBuildRead(id, readPage!);
    return build;
  } catch (error) {
    await rm(resolveStorageKey(folder), { recursive: true, force: true });
    throw error;
  }
}

// A scanned build's read waits in the server's one OCR line, after the scanned
// SOCs, TORs and builds started before it. Resolves when the read has ended
// (ready, failed or stopped); never rejects.
export function startBuildRead(id: string, readPage: CellReader): Promise<void> {
  return queueOcrRead(`build:${id}`, {
    waiting: (place) => prisma.socBuild.updateMany({ where: { id, status: "QUEUED" }, data: { stage: `${WAITING_STAGE}ที่ ${place}` } }),
    read: (run) => finishBuildRead(id, readPage, run),
  });
}

// Reads the build's chosen pages and builds the draft. Each write is made only
// while the build is still being read (not cancelled or deleted); otherwise the
// read stops quietly.
async function finishBuildRead(id: string, readPage: CellReader, run: OcrRun) {
  const build = await prisma.socBuild.findUnique({ where: { id } });
  if (!build || run.stopped || !OPEN_STATES.includes(build.status)) return;
  const reading = { id, status: "READING" };
  const claimed = await prisma.socBuild.updateMany({ where: { id, status: { in: OPEN_STATES } }, data: { status: "READING", stage: READING_STAGE, errorMessage: null } });
  if (!claimed.count) return;
  let storedOutput: string | null = null;
  try {
    const ranges = build.pageRangeList as unknown as PageRange[];
    const pages = await readScannedTor(
      new Uint8Array(await readFile(resolveStorageKey(build.torStorageKey))),
      buildPagesFile(id),
      (image, at) => {
        if (run.stopped) throw STOP_READING;
        return readPage(image, at);
      },
      async (done, total) => {
        const { count } = await prisma.socBuild.updateMany({ where: reading, data: { pagesDone: done, pagesTotal: total, stage: `${READING_STAGE} หน้า ${done}/${total}` } });
        if (!count) throw STOP_READING;
      },
      pageNumbers(ranges),
    );
    if (run.stopped) throw STOP_READING; // a cancel that came with the last page wins
    const template = new Uint8Array(await readFile(resolveStorageKey(build.templateStorageKey)));
    const draft = buildSocDraft(template, pages, ranges);
    const output = await storeSocFile(path.posix.dirname(build.torStorageKey), `SOC-${build.title}.docx`, ".docx", draft.bytes);
    storedOutput = output.storageKey;
    const { count } = await prisma.socBuild.updateMany({ where: reading, data: { status: "READY", stage: null, errorMessage: null, outputStorageKey: output.storageKey, rowCount: draft.rowCount, warnings: draft.warnings } });
    if (!count) throw STOP_READING;
    await writeAudit({ actorId: null, action: "SOC_BUILD_READ_COMPLETED", entityType: "SOC_BUILD", entityId: id, summary: `อ่าน TOR สแกนครบและสร้าง SOC ${build.title} (${draft.rowCount} แถว)`, metadata: { title: build.title, rowCount: draft.rowCount } });
  } catch (error) {
    if (storedOutput) await rm(resolveStorageKey(storedOutput), { force: true }).catch(() => undefined);
    if (error === STOP_READING) return;
    // The reason is shown to the user, so a message that is not Thai gets a plain one.
    const reason = error instanceof Error && /[฀-๿]/.test(error.message) ? error.message : "เกิดข้อผิดพลาดระหว่างอ่าน TOR";
    console.error("Scanned TOR build failed", id, error);
    await prisma.socBuild.updateMany({ where: reading, data: { status: "FAILED", stage: null, errorMessage: `${reason} · หน้าที่อ่านแล้วยังเก็บไว้ กด "อ่านต่อ" เมื่อพร้อม` } }).catch(() => undefined);
  }
}

// Cancel by the build's owner (or an ADMIN): the read stops, and the build
// waits as CANCELLED with its saved pages, to be resumed. False when it was no
// longer being read.
export async function cancelBuildRead(id: string) {
  const { actor, build } = await authorizeSocBuild(id);
  await stopOcrRead(`build:${id}`);
  const { count } = await prisma.socBuild.updateMany({ where: { id, status: { in: OPEN_STATES } }, data: { status: "CANCELLED", stage: null, errorMessage: "ยกเลิกการอ่าน TOR แล้ว หน้าที่อ่านแล้วยังเก็บไว้ กด \"อ่านต่อ\" เมื่อพร้อม" } });
  if (count) await writeAudit({ actorId: actor.id, action: "SOC_BUILD_READ_CANCELLED", entityType: "SOC_BUILD", entityId: id, summary: `ยกเลิกการอ่าน TOR ของ SOC ที่สร้าง ${build.title}` });
  return count > 0;
}

// Resume: a failed or cancelled read goes on from its saved pages, back in the
// OCR line. False when it was not failed or cancelled.
export async function resumeBuildRead(id: string, readPage = configuredOcrReader()) {
  const { actor, build } = await authorizeSocBuild(id);
  if (!readPage) throw new Error(OCR_NOT_SET_UP);
  const { count } = await prisma.socBuild.updateMany({ where: { id, status: { in: ["FAILED", "CANCELLED"] } }, data: { status: "QUEUED", stage: WAITING_STAGE, errorMessage: null } });
  if (!count) return false;
  void startBuildRead(id, readPage);
  await writeAudit({ actorId: actor.id, action: "SOC_BUILD_READ_RESUMED", entityType: "SOC_BUILD", entityId: id, summary: `อ่าน TOR ต่อของ SOC ที่สร้าง ${build.title}` });
  return true;
}

// Picks up the builds a restart left waiting or being read; their saved pages are not read again.
export async function resumeBuildReads(readPage = configuredOcrReader()) {
  if (!readPage) return;
  const builds = await prisma.socBuild.findMany({ where: { status: { in: OPEN_STATES } }, orderBy: { updatedAt: "asc" }, select: { id: true } });
  for (const { id } of builds) void startBuildRead(id, readPage);
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
  return builds.map(({ id, title, status, scanned, stage, pagesDone, pagesTotal, pageRanges, rowCount, warnings, errorMessage, createdAt, purgeAfter }) => ({ id, title, status, scanned, stage, pagesDone, pagesTotal, pageRanges, rowCount, warnings: (warnings as string[] | null) ?? [], errorMessage, createdAt, purgeAfter }));
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
  await stopOcrRead(`build:${id}`); // no page is sent to the OCR once this returns
  await prisma.socBuild.delete({ where: { id } });
  await rm(resolveStorageKey(path.posix.dirname(build.torStorageKey)), { recursive: true, force: true });
  await writeAudit({ actorId: actor.id, action: "SOC_BUILD_DELETED", entityType: "SOC_BUILD", entityId: id, summary: `ลบ SOC ที่สร้าง ${build.title}`, metadata: { title: build.title, ownerId: build.ownerId } });
}
