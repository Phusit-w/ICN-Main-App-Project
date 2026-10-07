// SOC Runner installer download (ADR 0008, ticket 16): /soc hands the
// signed-in user the prebuilt SOCRunnerSetup.exe with their runner config
// (a new link's token) appended, so installing needs no pairing step.
// Driven through the route with the signed-in user stubbed.
import { after, mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { appendRunnerConfig, readRunnerConfig, socRunnerInstallerAvailable } = await import("@/lib/soc-runner-installer");
const { POST: installerRoute } = await import("@/app/api/soc/runner-installer/route");
const { POST: configRoute } = await import("@/app/api/soc/runner-link/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");

const dir = mkdtempSync(path.join(tmpdir(), "soc-runner-installer-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const BASE = Buffer.from("MZ fake installer bytes \u0000\u0001\u0002");
const basePath = path.join(dir, "SOCRunnerSetup.exe");
writeFileSync(basePath, BASE);
const caPath = path.join(dir, "root.crt");
const CA = "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n";
writeFileSync(caPath, CA);

function withEnv(values: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  for (const [k, v] of Object.entries(values)) if (v === undefined) delete process.env[k];
  return () => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  };
}

function user(username: string, appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role: "USER", appAccess } });
}

const download = () => installerRoute(new Request("http://soc.example:3000/api/soc/runner-installer", { method: "POST" }));

function heartbeat(token: string) {
  return heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ runnerVersion: "0.2.0", claudeLogin: "logged_in" }),
  }));
}

// ---- The appended config ----------------------------------------------------------

test("the config is appended after the installer bytes and reads back", () => {
  const config = { format: "soc-runner-config/1", serverUrl: "https://soc", token: "socr_x", displayName: "คุณ ทดสอบ" };
  const bundle = appendRunnerConfig(BASE, config);
  assert.deepEqual(bundle.subarray(0, BASE.length), BASE);
  assert.deepEqual(readRunnerConfig(bundle), config);
  assert.equal(readRunnerConfig(BASE), null);
});

test("the trailer ends with the length and the magic the installer stub looks for", () => {
  const bundle = appendRunnerConfig(BASE, { a: 1 });
  const json = Buffer.from(JSON.stringify({ a: 1 }), "utf8");
  assert.equal(bundle.subarray(-8).toString("latin1"), "SOCRCFG1");
  assert.equal(bundle.readUInt32LE(bundle.length - 12), json.length);
  assert.deepEqual(bundle.subarray(BASE.length, BASE.length + json.length), json);
});

// ---- Download -------------------------------------------------------------------

test("downloading the installer links the user's runner and carries the token", { skip }, async () => {
  const restore = withEnv({ SOC_RUNNER_INSTALLER_PATH: basePath, SOC_RUNNER_CA_CERT_FILE: undefined });
  try {
    signedIn = await user("alice");
    const old = await (await configRoute(new Request("http://soc.example:3000/api/soc/runner-link", { method: "POST" }))).json();

    const response = await download();
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("content-type"), "application/vnd.microsoft.portable-executable");
    assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="SOCRunnerSetup\.exe"/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(body.subarray(0, BASE.length), BASE);
    const config = readRunnerConfig(body) as { format: string; serverUrl: string; token: string; username: string; caCert?: string };
    assert.equal(config.format, "soc-runner-config/1");
    assert.equal(config.serverUrl, "http://soc.example:3000");
    assert.equal(config.username, "alice");
    assert.equal(config.caCert, undefined);

    assert.equal((await heartbeat(config.token)).status, 200);
    // Installing again is the repair path: the previous config stops working.
    assert.equal((await heartbeat(old.token)).status, 401);
    const audit = await prisma.auditLog.findMany({ where: { action: "SOC_RUNNER_LINKED" } });
    assert.equal(audit.length, 2);
  } finally {
    restore();
  }
});

test("without a built installer on the server nothing is linked", { skip }, async () => {
  const restore = withEnv({ SOC_RUNNER_INSTALLER_PATH: path.join(dir, "missing.exe") });
  try {
    signedIn = await user("bob");
    assert.equal(await socRunnerInstallerAvailable(), false);
    const response = await download();
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /ยังไม่มีตัวติดตั้ง/);
    assert.equal(await prisma.socRunnerLink.count(), 0);
  } finally {
    restore();
  }
});

test("a user without soc access gets no installer and no link", { skip }, async () => {
  const restore = withEnv({ SOC_RUNNER_INSTALLER_PATH: basePath });
  try {
    signedIn = await user("carol", []);
    assert.equal((await download()).status, 403);
    signedIn = null;
    assert.equal((await download()).status, 401);
    assert.equal(await prisma.socRunnerLink.count(), 0);
  } finally {
    restore();
  }
});

test("the server's own CA certificate rides along so the runner trusts `tls internal`", { skip }, async () => {
  const restore = withEnv({ SOC_RUNNER_INSTALLER_PATH: basePath, SOC_RUNNER_CA_CERT_FILE: caPath });
  try {
    signedIn = await user("dave");
    assert.equal(await socRunnerInstallerAvailable(), true);
    const installer = readRunnerConfig(Buffer.from(await (await download()).arrayBuffer())) as { caCert?: string };
    assert.equal(installer.caCert, CA);
    const config = await (await configRoute(new Request("http://soc.example:3000/api/soc/runner-link", { method: "POST" }))).json();
    assert.equal(config.caCert, CA);
  } finally {
    restore();
  }
});

test("a CA setting that isn't a PEM certificate fails loudly instead of linking", { skip }, async () => {
  const notPem = path.join(dir, "not.pem");
  writeFileSync(notPem, "hello");
  const restore = withEnv({ SOC_RUNNER_INSTALLER_PATH: basePath, SOC_RUNNER_CA_CERT_FILE: notPem });
  try {
    signedIn = await user("erin");
    const response = await download();
    assert.equal(response.status, 500);
    assert.equal(await prisma.socRunnerLink.count(), 0);
  } finally {
    restore();
  }
});
