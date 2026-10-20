// Whether a SOC Runner is the latest version (tor-match ticket 09): the
// latest is read from the runner.py the install command serves, and each
// link's reported version is compared with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { latestSocRunnerVersion } from "@/lib/soc-runner-install";
import { socRunnerVersionNote } from "@/lib/soc-shared";

test("the latest version is the RUNNER_VERSION of the runner.py the install serves", async () => {
  const shipped = await latestSocRunnerVersion();
  assert.match(shipped ?? "", /^\d+\.\d+\.\d+$/);

  const dir = await mkdtemp(path.join(os.tmpdir(), "soc-runner-version-"));
  try {
    const file = path.join(dir, "runner.py");
    await writeFile(file, 'import os\n\nRUNNER_VERSION = "1.2.3"\n');
    assert.equal(await latestSocRunnerVersion(file), "1.2.3");
    await writeFile(file, "import os\n# no version here\n");
    assert.equal(await latestSocRunnerVersion(file), null);
    assert.equal(await latestSocRunnerVersion(path.join(dir, "missing.py")), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a runner's version is shown as the latest or as older than the latest", () => {
  assert.deepEqual(socRunnerVersionNote("0.8.0", "0.8.0"), { outdated: false, text: "ล่าสุดแล้ว" });
  assert.deepEqual(socRunnerVersionNote("0.9.0", "0.8.0"), { outdated: false, text: "ล่าสุดแล้ว" }); // run from a newer source
  assert.deepEqual(socRunnerVersionNote("0.7.0", "0.8.0"), { outdated: true, text: "มีรุ่นใหม่ 0.8.0" });
  assert.deepEqual(socRunnerVersionNote("0.8.0", "0.10.0"), { outdated: true, text: "มีรุ่นใหม่ 0.10.0" });
  assert.equal(socRunnerVersionNote(null, "0.8.0"), null); // not reported yet
  assert.equal(socRunnerVersionNote("0.8.0", null), null); // latest unknown
});
