// Evidence uploads that keep the job's folders (บทที่ 2/2.5 …/1.…/tc22.pdf):
// a SOC often cites a folder ("เอกสารส่วนที่ 2 2.5 … หน้า 3"), not a file, so
// the skill needs the folders to find the file. Used by the upload forms and
// the server, so no Node imports here.

// One request's share of an upload. IIS takes up to 300 MB per request
// (docs/DEPLOY-WINDOWS.md); the first request also carries the SOC (≤ 25 MB).
export const UPLOAD_BATCH_FILES = 50;
export const UPLOAD_BATCH_BYTES = 200 * 1024 * 1024;

const MAX_NAME = 240;

// A picked file's place in the job, as "folder/sub-folder/file.pdf": no drive,
// no "..", "/" between folders, characters Windows can't store replaced. Over
// 240 characters it drops the outermost folders first, then cuts the name.
export function evidencePath(raw: string): string {
  const segments = raw.split(/[\\/]+/)
    .map((segment) => segment.replace(/[<>:"|?*\x00-\x1f]/g, "_").trim())
    .filter((segment) => segment && segment !== "." && segment !== ".." && !/^[A-Za-z]_$/.test(segment));
  while (segments.length > 1 && segments.join("/").length > MAX_NAME) segments.shift();
  return segments.join("/").slice(-MAX_NAME) || "file";
}

// The parts of a dropped item (FileSystemEntry) that droppedFiles reads.
export type DropEntry =
  | { isFile: true; isDirectory: false; fullPath: string; file(ok: (file: File) => void, fail: (error: unknown) => void): void }
  | { isFile: false; isDirectory: true; fullPath: string; createReader(): { readEntries(ok: (entries: DropEntry[]) => void, fail: (error: unknown) => void): void } };

// Every file under what was dragged in (files and folders, several at once —
// a folder picker takes only one folder), each with its path from the dragged
// item down: "บทที่ 2/2.5 …/tc22.pdf", like a folder pick's webkitRelativePath.
// `folders: false` skips dragged folders.
export async function droppedFiles(entries: readonly DropEntry[], { folders = true } = {}): Promise<{ file: File; path: string }[]> {
  const found: { file: File; path: string }[] = [];
  async function walk(entry: DropEntry) {
    if (entry.isFile) {
      found.push({ file: await new Promise<File>((ok, fail) => entry.file(ok, fail)), path: entry.fullPath.replace(/^\/+/, "") });
      return;
    }
    const reader = entry.createReader();
    // readEntries hands a folder over in chunks (100 in Chrome) until it returns none.
    for (;;) {
      const chunk = await new Promise<DropEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (!chunk.length) break;
      for (const child of chunk) await walk(child);
    }
  }
  for (const entry of entries) if (entry.isFile || folders) await walk(entry);
  return found;
}

// Consecutive batches within UPLOAD_BATCH_FILES and UPLOAD_BATCH_BYTES. A file
// larger than a batch goes alone (the per-file limit is lower anyway).
export function uploadBatches<T extends { size: number }>(files: readonly T[]): T[][] {
  const batches: T[][] = [];
  let bytes = 0;
  for (const file of files) {
    const current = batches.at(-1);
    if (!current || current.length >= UPLOAD_BATCH_FILES || bytes + file.size > UPLOAD_BATCH_BYTES) {
      batches.push([file]);
      bytes = file.size;
    } else {
      current.push(file);
      bytes += file.size;
    }
  }
  return batches;
}
