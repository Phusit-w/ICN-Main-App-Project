// SOC Runner links (ADR 0008, ticket 12): a user downloads a runner config
// that already carries a token bound to them (only its hash is stored); the
// runner's heartbeat reports its version and Claude login state; the user
// sees whether their runner is online; an admin lists and revokes links.
// Driven through the routes and lib functions with the signed-in user stubbed.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";
import { socRunnerState } from "@/lib/soc-shared";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { listSocRunnerLinks, revokeSocRunnerLink, mySocRunner } = await import("@/lib/soc-runner");
const { POST: downloadRoute } = await import("@/app/api/soc/runner-link/route");
const { POST: heartbeatRoute } = await import("@/app/api/soc-runner/heartbeat/route");

function user(username: string, role = "USER", appAccess: string[] = ["soc"]) {
  return prisma.user.create({ data: { username, displayName: `คุณ ${username}`, passwordHash: "x", role, appAccess } });
}

type RunnerConfig = { format: string; serverUrl: string; token: string; linkId: string; username: string };

async function download(): Promise<RunnerConfig> {
  const response = await downloadRoute(new Request("http://soc.example:3000/api/soc/runner-link", { method: "POST" }));
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="soc-runner\.json"/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}

function heartbeat(token: string | null, body: unknown = { runnerVersion: "0.1.0", claudeLogin: "logged_in" }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return heartbeatRoute(new Request("http://localhost/api/soc-runner/heartbeat", { method: "POST", headers, body: JSON.stringify(body) }));
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// ---- Download -----------------------------------------------------------------

test("downloading creates a token bound to the user, and only its hash is stored", { skip }, async () => {
  const alice = await user("alice");
  signedIn = alice;
  const config = await download();
  assert.equal(config.format, "soc-runner-config/1");
  assert.equal(config.serverUrl, "http://soc.example:3000");
  assert.equal(config.username, "alice");
  assert.match(config.token, /^socr_[A-Za-z0-9_-]{43}$/);

  const links = await prisma.socRunnerLink.findMany();
  assert.equal(links.length, 1);
  assert.equal(links[0].id, config.linkId);
  assert.equal(links[0].userId, alice.id);
  assert.equal(links[0].tokenHash, sha256(config.token));
  assert.ok(!JSON.stringify(links[0]).includes(config.token), "the token itself is not stored");
  assert.equal(links[0].revokedAt, null);

  const audit = await prisma.auditLog.findMany({ where: { action: "SOC_RUNNER_LINKED" } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorId, alice.id);
  assert.equal(audit[0].entityId, config.linkId);
  assert.ok(!JSON.stringify(audit[0]).includes(config.token), "the token is not in the audit trail");
});

test("SOC_RUNNER_SERVER_URL overrides the address written into the config", { skip }, async () => {
  signedIn = await user("alice");
  process.env.SOC_RUNNER_SERVER_URL = "https://192.168.51.43/";
  try {
    assert.equal((await download()).serverUrl, "https://192.168.51.43");
  } finally {
    delete process.env.SOC_RUNNER_SERVER_URL;
  }
});

test("downloading again replaces the user's link: the old token stops working", { skip }, async () => {
  const alice = await user("alice");
  signedIn = alice;
  const first = await download();
  const second = await download();
  assert.notEqual(first.token, second.token);

  assert.equal((await heartbeat(first.token)).status, 401);
  assert.equal((await heartbeat(second.token)).status, 200);
  const active = await prisma.socRunnerLink.findMany({ where: { userId: alice.id, revokedAt: null } });
  assert.deepEqual(active.map((l) => l.id), [second.linkId]);
  const old = await prisma.socRunnerLink.findUniqueOrThrow({ where: { id: first.linkId } });
  assert.equal(old.revokeReason, "replaced");

  const audit = await prisma.auditLog.findMany({ where: { action: "SOC_RUNNER_LINKED" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual((audit[1].metadata as { replacedLinkIds: string[] }).replacedLinkIds, [first.linkId]);
});

test("another user's download does not touch my link", { skip }, async () => {
  signedIn = await user("alice");
  const alice = await download();
  signedIn = await user("bob");
  await download();
  assert.equal((await heartbeat(alice.token)).status, 200);
});

test("only a signed-in user with soc access may download", { skip }, async () => {
  signedIn = await user("expense-only", "USER", ["expense"]);
  assert.equal((await downloadRoute(new Request("http://localhost/api/soc/runner-link", { method: "POST" }))).status, 403);
  signedIn = null;
  assert.equal((await downloadRoute(new Request("http://localhost/api/soc/runner-link", { method: "POST" }))).status, 401);
  assert.equal(await prisma.socRunnerLink.count(), 0);
});

// ---- Heartbeat ----------------------------------------------------------------

test("a heartbeat with a valid token records the version, Claude login and last-seen time", { skip }, async () => {
  const alice = await user("alice");
  signedIn = alice;
  const config = await download();
  assert.deepEqual(await mySocRunner(alice.id), { state: "never_seen", lastSeenAt: null, runnerVersion: null, claudeLogin: null, linkedAt: (await prisma.socRunnerLink.findUniqueOrThrow({ where: { id: config.linkId } })).createdAt });

  const before = Date.now();
  const response = await heartbeat(config.token, { runnerVersion: "0.2.0", claudeLogin: "logged_out" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.username, "alice");

  const link = await prisma.socRunnerLink.findUniqueOrThrow({ where: { id: config.linkId } });
  assert.equal(link.runnerVersion, "0.2.0");
  assert.equal(link.claudeLogin, "logged_out");
  assert.ok(link.lastSeenAt && link.lastSeenAt.getTime() >= before - 1000);

  const mine = await mySocRunner(alice.id);
  assert.equal(mine?.state, "online");
  assert.equal(mine?.runnerVersion, "0.2.0");
  assert.equal(mine?.claudeLogin, "logged_out");
});

test("an unknown, missing or malformed token is refused", { skip }, async () => {
  signedIn = await user("alice");
  const config = await download();
  assert.equal((await heartbeat("socr_" + "A".repeat(43))).status, 401);
  assert.equal((await heartbeat(null)).status, 401);
  assert.equal((await heartbeat(config.token.slice(0, -1))).status, 401);
  const link = await prisma.socRunnerLink.findUniqueOrThrow({ where: { id: config.linkId } });
  assert.equal(link.lastSeenAt, null);
});

test("a heartbeat for a user who was deactivated or lost soc access is refused", { skip }, async () => {
  const alice = await user("alice");
  signedIn = alice;
  const config = await download();
  await prisma.user.update({ where: { id: alice.id }, data: { appAccess: ["expense"] } });
  assert.equal((await heartbeat(config.token)).status, 403);
  await prisma.user.update({ where: { id: alice.id }, data: { appAccess: ["soc"], isActive: false } });
  assert.equal((await heartbeat(config.token)).status, 401);
});

test("a heartbeat with a bad body is refused and changes nothing", { skip }, async () => {
  signedIn = await user("alice");
  const config = await download();
  assert.equal((await heartbeat(config.token, { runnerVersion: "", claudeLogin: "logged_in" })).status, 400);
  assert.equal((await heartbeat(config.token, { runnerVersion: "0.1.0", claudeLogin: "maybe" })).status, 400);
  assert.equal((await heartbeat(config.token, { runnerVersion: "x".repeat(65), claudeLogin: "unknown" })).status, 400);
  assert.equal((await prisma.socRunnerLink.findUniqueOrThrow({ where: { id: config.linkId } })).lastSeenAt, null);
});

// ---- Online state ----------------------------------------------------------------

test("a runner is online while its last heartbeat is recent, offline after", () => {
  const now = new Date("2026-10-06T10:00:00Z");
  assert.equal(socRunnerState(null, now), "never_seen");
  assert.equal(socRunnerState(new Date("2026-10-06T09:59:00Z"), now), "online");
  assert.equal(socRunnerState(new Date("2026-10-06T09:57:00Z"), now), "offline");
});

test("a user with no active link has no runner", { skip }, async () => {
  const alice = await user("alice");
  assert.equal(await mySocRunner(alice.id), null);
});

// ---- Admin -----------------------------------------------------------------------

test("an admin sees every link and revokes one; its token is then refused", { skip }, async () => {
  const alice = await user("alice");
  signedIn = alice;
  const config = await download();
  await heartbeat(config.token);

  const admin = await user("admin", "ADMIN");
  signedIn = admin;
  const links = await listSocRunnerLinks();
  assert.equal(links.length, 1);
  assert.equal(links[0].userDisplayName, "คุณ alice");
  assert.equal(links[0].state, "online");
  assert.equal(links[0].runnerVersion, "0.1.0");
  assert.equal(links[0].revokedAt, null);

  assert.deepEqual(await revokeSocRunnerLink(config.linkId), { ok: true });
  assert.equal((await heartbeat(config.token)).status, 401);
  assert.equal(await mySocRunner(alice.id), null);

  const revoked = await prisma.socRunnerLink.findUniqueOrThrow({ where: { id: config.linkId } });
  assert.equal(revoked.revokeReason, "admin");
  assert.equal(revoked.revokedById, admin.id);
  const audit = await prisma.auditLog.findMany({ where: { action: "SOC_RUNNER_REVOKED" } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorId, admin.id);
  assert.equal(audit[0].targetUserId, alice.id);

  const listed = await listSocRunnerLinks();
  assert.ok(listed[0].revokedAt);
  assert.equal(listed[0].revokedByName, "คุณ admin");
});

test("revoking an unknown or already revoked link is refused and not audited twice", { skip }, async () => {
  signedIn = await user("alice");
  const config = await download();
  signedIn = await user("admin", "ADMIN");
  assert.equal((await revokeSocRunnerLink("no-such-link")).ok, false);
  assert.deepEqual(await revokeSocRunnerLink(config.linkId), { ok: true });
  assert.equal((await revokeSocRunnerLink(config.linkId)).ok, false);
  assert.equal(await prisma.auditLog.count({ where: { action: "SOC_RUNNER_REVOKED" } }), 1);
});

test("only ADMIN may list or revoke links", { skip }, async () => {
  signedIn = await user("alice");
  const config = await download();
  await assert.rejects(listSocRunnerLinks(), /FORBIDDEN/);
  await assert.rejects(revokeSocRunnerLink(config.linkId), /FORBIDDEN/);
  assert.equal((await heartbeat(config.token)).status, 200);
});
