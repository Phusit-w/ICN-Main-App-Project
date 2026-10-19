import { test } from "node:test";
import assert from "node:assert/strict";
import { queueOcrRead } from "@/lib/soc-ocr-queue";

test("a read that throws does not stop the reads queued behind it", async () => {
  const done: string[] = [];
  const waiting = async () => undefined;
  const failing = queueOcrRead("throws", { waiting, read: async () => { throw new Error("database down"); } });
  const next = queueOcrRead("next", { waiting, read: async () => { done.push("next"); } });
  await failing; // resolves, never rejects
  await next;
  assert.deepEqual(done, ["next"]);
});
