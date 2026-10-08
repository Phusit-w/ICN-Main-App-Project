// SOC Runner install command (ADR 0008, ticket 16). Smart App Control blocks
// an unsigned .exe of our own, so /soc gives the signed-in user a one-line
// PowerShell command instead: it carries a one-time install code, and
// fetching the install script with that code links the user's runner (a new
// token in the config inside the script) and replaces their previous link.
// Driven through the routes with the signed-in user stubbed.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { POST: commandRoute } = await import("@/app/api/soc/runner-install-command/route");
const { GET: scriptRoute } = await import("@/app/api/soc-runner/install/[code]/route");
const { POST: configRoute } = await import("@/app/api/soc/runner-link/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");
const { isSocRunnerInstallCode } = await import("@/lib/soc-runner-token");

// A throwaway self-signed certificate (its key was discarded), standing in
// for the server's own certificate behind IIS. SHA-1 thumbprint below.
const CERT = `-----BEGIN CERTIFICATE-----
MIIBmjCCAUGgAwIBAgIUEvY6Rh7Xup7MjkfiuVsQChWVwwUwCgYIKoZIzj0EAwIw
IjEgMB4GA1UEAwwXc29jLXJ1bm5lci10ZXN0LmV4YW1wbGUwIBcNMjYxMDA3MDk0
NjQzWhgPMjEyNjA5MTMwOTQ2NDNaMCIxIDAeBgNVBAMMF3NvYy1ydW5uZXItdGVz
dC5leGFtcGxlMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAELKNj+yzmjjvEgurM
/Vbazpq/kObomCpg1pk0ntHGofcJnvRvf6hixKcqD4vY6YTwtK3DEvuMJxiof3Sb
P5Tiy6NTMFEwHQYDVR0OBBYEFHNVRjgUQb0ol1gK1qBFh3hmynyBMB8GA1UdIwQY
MBaAFHNVRjgUQb0ol1gK1qBFh3hmynyBMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZI
zj0EAwIDRwAwRAIgfusOcwfb7a18C8O4OhqmXjugAsuciog5bGHqtrYSqXACIBvQ
oskyKPkPAlTbMNkOM2A3HvR9eUZg2JKhM0PM28kD
-----END CERTIFICATE-----
`;
const CERT_THUMBPRINT = "909B332E6876C27FBF69FEF317FE4EB689150395";
const dir = mkdtempSync(path.join(tmpdir(), "soc-runner-install-"));
const certPath = path.join(dir, "server.crt");
writeFileSync(certPath, CERT);

function withEnv(values: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  return () => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  };
}

function user(username: string, appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role: "USER", appAccess } });
}

const requestCommand = () => commandRoute(new Request("http://soc.example:3000/api/soc/runner-install-command", { method: "POST" }));

async function newCommand(): Promise<{ command: string; code: string; expiresAt: string }> {
  const response = await requestCommand();
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  const code = /\/api\/soc-runner\/install\/(soci_[A-Za-z0-9_-]+)'/.exec(body.command)?.[1];
  assert.ok(code, body.command);
  return { ...body, code };
}

async function fetchScript(code: string) {
  const response = await scriptRoute(new Request(`http://soc.example:3000/api/soc-runner/install/${code}`), { params: Promise.resolve({ code }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain; charset=utf-8/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.text();
}

// The base64 values the server put into the script's $SocRunner table.
function embedded(script: string, name: string): string | null {
  const match = new RegExp(`'${name.replace(".", "\\.")}' = '([A-Za-z0-9+/=]*)'`).exec(script);
  return match ? Buffer.from(match[1], "base64").toString("utf8") : null;
}

function heartbeat(token: string) {
  return heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ runnerVersion: "0.2.0", claudeLogin: "logged_in" }),
  }));
}

// ---- The command ------------------------------------------------------------------

test("the command is one line for Windows PowerShell that fetches and runs the install script", { skip }, async () => {
  const restore = withEnv({ SOC_RUNNER_CA_CERT_FILE: undefined, SOC_RUNNER_SERVER_URL: undefined });
  try {
    signedIn = await user("alice");
    const { command, code, expiresAt } = await newCommand();
    assert.ok(isSocRunnerInstallCode(code));
    assert.doesNotMatch(command, /[\r\n]/);
    assert.match(command, /PSEdition -eq 'Core'/, "PowerShell 7 is told to use Windows PowerShell");
    assert.ok(command.endsWith(`iex (irm 'http://soc.example:3000/api/soc-runner/install/${code}')`), command);
    assert.doesNotMatch(command, /ServerCertificateValidationCallback/, "plain http has no certificate to pin");
    const minutes = (Date.parse(expiresAt) - Date.now()) / 60_000;
    assert.ok(minutes > 29 && minutes <= 30, `expires in ${minutes} min`);
    // Asking for a command links nothing yet: a working runner keeps working.
    assert.equal(await prisma.socRunnerLink.count(), 0);
  } finally {
    restore();
  }
});

test("over https with the server's own certificate the command pins it", { skip }, async () => {
  const restore = withEnv({ SOC_RUNNER_CA_CERT_FILE: certPath, SOC_RUNNER_SERVER_URL: "https://psaidemo.example" });
  try {
    signedIn = await user("bob");
    const { command, code } = await newCommand();
    assert.ok(command.includes(`$p='${CERT_THUMBPRINT}'`), command);
    // A certificate Windows trusts still passes, so Python and PyPI downloads work.
    assert.ok(command.includes("[Net.ServicePointManager]::ServerCertificateValidationCallback={param($s,$c,$h,$e)$e -eq 'None' -or $c.GetCertHashString() -eq $p}"), command);
    assert.ok(command.endsWith(`iex (irm 'https://psaidemo.example/api/soc-runner/install/${code}')`), command);
  } finally {
    restore();
  }
});

test("a certificate setting that isn't a PEM certificate fails before any code is made", { skip }, async () => {
  const notPem = path.join(dir, "not.pem");
  writeFileSync(notPem, "hello");
  const restore = withEnv({ SOC_RUNNER_CA_CERT_FILE: notPem });
  try {
    signedIn = await user("carol");
    assert.equal((await requestCommand()).status, 500);
    assert.equal(await prisma.socRunnerInstallCode.count(), 0);
  } finally {
    restore();
  }
});

test("a user without soc access gets no command", { skip }, async () => {
  signedIn = await user("dave", []);
  assert.equal((await requestCommand()).status, 403);
  signedIn = null;
  assert.equal((await requestCommand()).status, 401);
  assert.equal(await prisma.socRunnerInstallCode.count(), 0);
});

// ---- The script -------------------------------------------------------------------

test("fetching the script with the code links the runner and replaces the previous link", { skip }, async () => {
  const restore = withEnv({ SOC_RUNNER_CA_CERT_FILE: certPath, SOC_RUNNER_SERVER_URL: undefined });
  try {
    signedIn = await user("erin");
    const old = await (await configRoute(new Request("http://soc.example:3000/api/soc/runner-link", { method: "POST" }))).json();
    const { code } = await newCommand();
    signedIn = null; // PowerShell has no session: the code is the proof.

    const script = await fetchScript(code);
    const config = JSON.parse(embedded(script, "soc-runner.json") ?? "null");
    assert.equal(config.format, "soc-runner-config/1");
    assert.equal(config.serverUrl, "http://soc.example:3000");
    assert.equal(config.username, "erin");
    assert.equal(config.caCert, CERT, "the runner trusts the server's own certificate too");
    assert.equal((await heartbeat(config.token)).status, 200);
    assert.equal((await heartbeat(old.token)).status, 401);
    assert.equal(await prisma.socRunnerLink.count({ where: { revokedAt: null } }), 1);
  } finally {
    restore();
  }
});

test("the script carries the runner files and the skill's packages from this server", { skip }, async () => {
  signedIn = await user("frank");
  const { code } = await newCommand();
  const script = await fetchScript(code);
  for (const name of ["runner.py", "claude_cli.py", "server_client.py", "install.py", "requirements.txt"]) {
    assert.equal(embedded(script, name), readFileSync(path.join("soc-runner", name), "utf8"), name);
  }
  assert.ok(script.includes(readFileSync(path.join("soc-runner", "bootstrap.ps1"), "utf8")), "the bootstrap follows the data");
  assert.match(script, /^& \{/, "runs in its own scope, so the token doesn't stay in the user's PowerShell");
});

test("a code works once, and not after it expires", { skip }, async () => {
  signedIn = await user("gina");
  const { code } = await newCommand();
  await fetchScript(code);
  const again = await fetchScript(code);
  assert.equal(embedded(again, "soc-runner.json"), null);
  assert.match(again, /Write-Host/);
  assert.match(again, /คำสั่งติดตั้งนี้ใช้ไปแล้วหรือหมดอายุ/);
  assert.equal(await prisma.socRunnerLink.count(), 1);

  const { code: late } = await newCommand();
  await prisma.socRunnerInstallCode.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(embedded(await fetchScript(late), "soc-runner.json"), null);
  assert.equal(await prisma.socRunnerLink.count(), 1);
});

test("a newer command replaces an unused older one", { skip }, async () => {
  signedIn = await user("hank");
  const first = await newCommand();
  const second = await newCommand();
  assert.equal(embedded(await fetchScript(first.code), "soc-runner.json"), null);
  assert.notEqual(embedded(await fetchScript(second.code), "soc-runner.json"), null);
});

test("a user who lost soc access or was deactivated can't use their code", { skip }, async () => {
  const ivy = await user("ivy");
  signedIn = ivy;
  const { code } = await newCommand();
  await prisma.user.update({ where: { id: ivy.id }, data: { appAccess: [] } });
  assert.equal(embedded(await fetchScript(code), "soc-runner.json"), null);

  const jack = await user("jack");
  signedIn = jack;
  const { code: jackCode } = await newCommand();
  await prisma.user.update({ where: { id: jack.id }, data: { isActive: false } });
  assert.equal(embedded(await fetchScript(jackCode), "soc-runner.json"), null);
  assert.equal(await prisma.socRunnerLink.count(), 0);
});

test("a malformed code is refused without touching the database", async () => {
  assert.equal(isSocRunnerInstallCode("soci_short"), false);
  assert.equal(isSocRunnerInstallCode(`socr_${"a".repeat(32)}`), false);
  const response = await scriptRoute(new Request("http://localhost/api/soc-runner/install/nope"), { params: Promise.resolve({ code: "nope" }) });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /คำสั่งติดตั้งนี้ใช้ไปแล้วหรือหมดอายุ/);
});

test("in production the proxy lets the install script through without a session or token, only with a well-formed code", async () => {
  const { proxy } = await import("@/proxy");
  const { NextRequest } = await import("next/server");
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, SESSION_SECRET: env.SESSION_SECRET };
  env.NODE_ENV = "production";
  env.SESSION_SECRET = "test-secret";
  try {
    const call = (code: string) => proxy(new NextRequest(`http://localhost/api/soc-runner/install/${code}`));
    assert.equal(call(`soci_${"a".repeat(32)}`).headers.get("x-middleware-next"), "1");
    assert.equal(call("nope").status, 401);
    assert.equal(call(`soci_${"a".repeat(32)}/x`).status, 401);
  } finally {
    env.NODE_ENV = saved.NODE_ENV;
    env.SESSION_SECRET = saved.SESSION_SECRET;
  }
});
