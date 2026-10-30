// The Datasheets of a Proposal: PDFs uploaded once with their folders kept
// (the SOC cites folders as well as files), added to or removed at any time.
// Each has a ชื่อที่ใช้อ้างอิง (Citation Name) that แบบอังกฤษ references use.
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/authorization";
import { authorizeProposal } from "@/lib/proposal";
import { resolveStorageKey, storeSocFile } from "@/lib/soc";

const CITATION_NAME_MAX = 120;

// "บทที่ 2/08 CASRI Product brochure - surat-1_….pdf" → "CASRI Product brochure":
// the file name without its folders, extension, leading number and anything
// after " - ". A name that leaves nothing keeps the file name.
export function defaultCitationName(path: string): string {
  const base = (path.split("/").pop() ?? path).replace(/\.pdf$/i, "").trim();
  const name = base.replace(/^\d+[\s._-]+/, "").split(" - ")[0].trim();
  return (name || base).slice(0, CITATION_NAME_MAX);
}

// What the Proposal's Datasheets already hold, for the upload limits.
export async function datasheetTotals(proposalId: string) {
  const { _count, _sum } = await prisma.proposalDatasheet.aggregate({ where: { proposalId, removedAt: null }, _count: true, _sum: { sizeBytes: true } });
  return { count: _count, bytes: _sum.sizeBytes ?? 0 };
}

// Adds PDFs validateUpload() has already checked. Nothing is kept if the rows
// can't be written.
export async function addProposalDatasheets(proposalId: string, uploads: { name: string; bytes: Uint8Array }[]) {
  const { actor, proposal } = await authorizeProposal(proposalId);
  const stored: Awaited<ReturnType<typeof storeSocFile>>[] = [];
  try {
    for (const upload of uploads) stored.push(await storeSocFile(`proposals/${proposalId}`, upload.name, ".pdf", upload.bytes));
    await prisma.$transaction([
      prisma.proposalDatasheet.createMany({ data: stored.map((file) => ({ proposalId, ...file, citationName: defaultCitationName(file.originalName), uploadedById: actor.id })) }),
      prisma.proposal.update({ where: { id: proposalId }, data: { updatedAt: new Date() } }),
    ]);
  } catch (error) {
    await Promise.all(stored.map((file) => rm(resolveStorageKey(file.storageKey), { force: true }).catch(() => undefined)));
    throw error;
  }
  await writeAudit({
    actorId: actor.id, action: "PROPOSAL_DATASHEETS_ADDED", entityType: "PROPOSAL", entityId: proposalId,
    summary: `เพิ่ม Datasheet ${stored.length} ไฟล์ใน Proposal ${proposal.title}`, metadata: { names: stored.map((file) => file.originalName) },
  });
  return stored.length;
}

async function findDatasheet(proposalId: string, datasheetId: string) {
  const datasheet = await prisma.proposalDatasheet.findUnique({ where: { id: datasheetId } });
  if (!datasheet || datasheet.proposalId !== proposalId || datasheet.removedAt) throw new Error("NOT_FOUND");
  return datasheet;
}

export async function renameDatasheetCitation(proposalId: string, datasheetId: string, rawName: unknown): Promise<string> {
  const { actor, proposal } = await authorizeProposal(proposalId);
  const datasheet = await findDatasheet(proposalId, datasheetId);
  const name = String(rawName ?? "").trim();
  if (!name || name.length > CITATION_NAME_MAX) throw new Error(`ชื่อที่ใช้อ้างอิงต้องมี 1–${CITATION_NAME_MAX} ตัวอักษร`);
  if (name === datasheet.citationName) return name;
  await prisma.$transaction([
    prisma.proposalDatasheet.update({ where: { id: datasheetId }, data: { citationName: name } }),
    prisma.proposal.update({ where: { id: proposalId }, data: { updatedAt: new Date() } }),
  ]);
  await writeAudit({
    actorId: actor.id, action: "PROPOSAL_DATASHEET_RENAMED", entityType: "PROPOSAL", entityId: proposalId,
    summary: `เปลี่ยนชื่อที่ใช้อ้างอิงของ ${datasheet.originalName} เป็น ${name} ใน Proposal ${proposal.title}`, metadata: { from: datasheet.citationName, to: name },
  });
  return name;
}

export const DATASHEET_RUNNER_BUSY = "SOC Runner กำลังตรวจ Proposal นี้อยู่ ลบ Datasheet ได้หลังตรวจเสร็จ";

// Off the list at once, but refused while a SOC Runner is running on any job of
// the Proposal (it may be downloading Datasheets). Once any check result of the
// Proposal exists the row and file stay, marked removed: the review page still
// opens what a result cites. Before that the file goes with the row.
export async function removeProposalDatasheet(proposalId: string, datasheetId: string) {
  const { actor, proposal } = await authorizeProposal(proposalId);
  const datasheet = await findDatasheet(proposalId, datasheetId);
  if (await prisma.socCheckRequest.count({ where: { state: "running", job: { proposalId } } })) throw new Error(DATASHEET_RUNNER_BUSY);
  const cited = await prisma.socCheckResult.count({ where: { job: { proposalId } } }) > 0;
  await prisma.$transaction([
    cited ? prisma.proposalDatasheet.update({ where: { id: datasheetId }, data: { removedAt: new Date() } }) : prisma.proposalDatasheet.delete({ where: { id: datasheetId } }),
    prisma.proposal.update({ where: { id: proposalId }, data: { updatedAt: new Date() } }),
  ]);
  if (!cited) await rm(resolveStorageKey(datasheet.storageKey), { force: true }).catch(() => undefined);
  await writeAudit({
    actorId: actor.id, action: "PROPOSAL_DATASHEET_REMOVED", entityType: "PROPOSAL", entityId: proposalId,
    summary: `ลบ Datasheet ${datasheet.originalName} จาก Proposal ${proposal.title}`, metadata: { name: datasheet.originalName, citationName: datasheet.citationName },
  });
}
