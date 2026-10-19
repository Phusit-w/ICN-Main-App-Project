// The one line of OCR reads on the server (ADR 0010): scanned PDF SOCs and
// scanned TOR ต้นฉบับ are read one at a time, in the order they were started.
// The OCR's rate limit is shared, so reading two at once would be no faster.
// Kept on globalThis: the server's startup hook and its routes may load this
// module separately.

// One scheduled read; a stop sets `stopped`, and `started` says the read has begun.
export type OcrRun = { promise: Promise<void>; stopped: boolean; started: boolean };
// `waiting(place)` shows "รอคิวที่ N" on whatever the read is for.
type Entry = { key: string; run: OcrRun; waiting: (place: number) => Promise<unknown> };
type OcrLine = { queue: Promise<unknown>; running: Map<string, OcrRun>; order: Entry[]; labels: Promise<unknown> };
const line = ((globalThis as { socOcrLine?: OcrLine }).socOcrLine ??= { queue: Promise.resolve(), running: new Map(), order: [] as Entry[], labels: Promise.resolve() });

// Tells the waiting reads their place (one after another, each from the order as it is then).
function labelWaiting() {
  line.labels = line.labels.then(async () => {
    for (const [place, entry] of line.order.entries()) if (place) await entry.waiting(place).catch(() => undefined);
  });
  return line.labels;
}

// Puts `read` in the line under `key` (one read per key: a key already
// waiting or reading gets that read's promise). Resolves when the read ends,
// never rejects. `read` is handed its run, to stop when `run.stopped`.
export function queueOcrRead(key: string, { waiting, read }: { waiting: Entry["waiting"]; read: (run: OcrRun) => Promise<void> }): Promise<void> {
  const current = line.running.get(key);
  if (current && !current.stopped) return current.promise;
  const run: OcrRun = { stopped: false, started: false, promise: Promise.resolve() };
  line.order.push({ key, run, waiting });
  void labelWaiting();
  run.promise = line.queue.then(async () => {
    if (run.stopped) return; // stopped while waiting: already out of the line
    run.started = true;
    await line.labels;
    // A read that throws anyway must not stop every read queued behind it.
    await read(run).catch((error) => console.error("OCR read failed", key, error));
    line.order = line.order.filter((entry) => entry.run !== run);
    await labelWaiting();
  });
  line.queue = run.promise;
  line.running.set(key, run);
  void run.promise.finally(() => { if (line.running.get(key) === run) line.running.delete(key); });
  return run.promise;
}

// Stops the read under `key`: no new page or cell is sent to the OCR once
// this returns (a call already sent is waited for). A read still waiting
// leaves the line at once and the reads behind it move up.
export async function stopOcrRead(key: string) {
  const run = line.running.get(key);
  if (!run || run.stopped) return;
  run.stopped = true;
  if (run.started) return run.promise;
  line.order = line.order.filter((entry) => entry.run !== run);
  line.running.delete(key);
  await labelWaiting();
}
