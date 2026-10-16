import { test } from "node:test";
import assert from "node:assert/strict";
import { createTyphoonReader, cleanCell, OcrNotSetUpError, TyphoonError } from "@/lib/soc-typhoon";

const AT = { page: 1, row: 0, column: 0 };
const IMAGE = new Uint8Array([1, 2, 3]);
const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

// A clock the fake sleep moves forward to the waker's time, so the tests take
// no real time and concurrent sleepers do not add up.
function clock() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms: number) => { const until = t + ms; await Promise.resolve(); t = Math.max(t, until); } };
}

test("returns the cell text, and null for a figure-only answer", async () => {
  const texts = ["<table><tr><td>กล้อง</td><td>PTZ</td></tr></table>", "<figure>เส้น</figure>", "---", "สวัสดี"];
  const read = createTyphoonReader({ apiKey: "k", ...clock(), fetch: async () => reply(texts.shift()!) });
  assert.equal(await read(IMAGE, AT), "กล้อง | PTZ");
  assert.equal(await read(IMAGE, AT), null);
  assert.equal(await read(IMAGE, AT), "");
  assert.equal(await read(IMAGE, AT), "สวัสดี");
});

test("sends the image with the key and never more than 20 calls in 60 seconds, even from concurrent callers", async () => {
  const c = clock();
  const times: number[] = [];
  const read = createTyphoonReader({ apiKey: "secret", ...c, fetch: async (_url, init) => {
    times.push(c.now());
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.model, "typhoon-ocr");
    assert.match(sent.messages[0].content[1].image_url.url, /^data:image\/png;base64,AQID$/);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
    return reply("x");
  } });
  await Promise.all(Array.from({ length: 45 }, () => read(IMAGE, AT)));
  assert.equal(times.length, 45);
  for (const t of times) assert.ok(times.filter((u) => u > t - 60_000 && u <= t).length <= 20);
});

test("a rate limit or outage is retried after a delay; Retry-After is obeyed", async () => {
  const c = clock();
  const answers = [new Response("", { status: 429, headers: { "retry-after": "30" } }), new Response("", { status: 503 }), reply("ok")];
  const times: number[] = [];
  const read = createTyphoonReader({ apiKey: "k", ...c, fetch: async () => { times.push(c.now()); return answers.shift()!; } });
  assert.equal(await read(IMAGE, AT), "ok");
  assert.equal(times[1] - times[0], 30_000);
  assert.ok(times[2] - times[1] >= 5_000);
});

test("a network failure is retried; calls that keep failing surface as an error", async () => {
  let calls = 0;
  const read = createTyphoonReader({ apiKey: "k", ...clock(), fetch: async () => { calls++; throw new Error("down"); } });
  await assert.rejects(read(IMAGE, AT), (e) => e instanceof TyphoonError && /ลองแล้ว/.test(e.message));
  assert.ok(calls > 1);
});

test("a refused request is not retried and the error does not contain the key", async () => {
  let calls = 0;
  const read = createTyphoonReader({ apiKey: "top-secret-key", ...clock(), fetch: async () => { calls++; return new Response("bad key top-secret-key", { status: 401 }); } });
  await assert.rejects(read(IMAGE, AT), (e) => e instanceof TyphoonError && !e.message.includes("top-secret-key"));
  assert.equal(calls, 1);
});

test("with no key the reader says OCR is not set up and makes no call", async () => {
  let calls = 0;
  const read = createTyphoonReader({ apiKey: "", ...clock(), fetch: async () => { calls++; return reply("x"); } });
  await assert.rejects(read(IMAGE, AT), OcrNotSetUpError);
  assert.equal(calls, 0);
});

test("cleanCell keeps text next to a figure and line breaks inside a cell", () => {
  assert.equal(cleanCell("ข้อ ๑<br>ต่อ <figure>รูป</figure>"), "ข้อ ๑\nต่อ");
  assert.equal(cleanCell("a &amp; b"), "a & b");
});
