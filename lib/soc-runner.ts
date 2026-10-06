// SOC Runner links (ADR 0008, ticket 12). A user downloads a runner config
// from /soc that already carries a token bound to them (no pairing code);
// the server keeps only the token's sha256. The runner authenticates every
// call with `Authorization: Bearer <token>`, starting with the heartbeat that
// reports its version and Claude login state. A user has at most one active
// link: downloading again replaces it. An admin can list and revoke links.
// See docs/SOC-RUNNER.md.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess, requireRole, writeAudit } from "@/lib/authorization";
import { hasAccess } from "@/lib/access";
import { SOC_CLAUDE_LOGINS, socRunnerState } from "@/lib/soc-shared";

export const SOC_RUNNER_CONFIG_FORMAT = "soc-runner-config/1";
export const SOC_RUNNER_CONFIG_FILE = "soc-runner.json";
const TOKEN_PREFIX = "socr_";
const RUNNER_VERSION = /^[A-Za-z0-9._+-]{1,64}$/;

type SocActor = Awaited<ReturnType<typeof requireAccess>>;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// The address the runner calls back: SOC_RUNNER_SERVER_URL when set (e.g.
// behind Caddy, where the app sees its internal address), else the origin
// the download was requested on.
export function socRunnerServerUrl(request: Request): string {
  const configured = process.env.SOC_RUNNER_SERVER_URL?.trim();
  return (configured || new URL(request.url).origin).replace(/\/+$/, "");
}

// Creates a new link for the signed-in user and revokes their previous one
// ("replaced"), so an old config, e.g. on a lost PC, stops working. Returns
// the config file's content; this is the only place the token exists.
export async function createSocRunnerLink(actor: SocActor, serverUrl: string) {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const { link, replacedLinkIds } = await serializable(async (tx) => {
    const active = await tx.socRunnerLink.findMany({ where: { userId: actor.id, revokedAt: null }, select: { id: true } });
    const replacedLinkIds = active.map((l) => l.id);
    if (replacedLinkIds.length) {
      await tx.socRunnerLink.updateMany({ where: { id: { in: replacedLinkIds } }, data: { revokedAt: new Date(), revokeReason: "replaced", revokedById: actor.id } });
    }
    const link = await tx.socRunnerLink.create({ data: { userId: actor.id, tokenHash: hashToken(token) } });
    return { link, replacedLinkIds };
  });
  await writeAudit({
    actorId: actor.id, targetUserId: actor.id, action: "SOC_RUNNER_LINKED", entityType: "SOC_RUNNER", entityId: link.id,
    summary: `ดาวน์โหลดไฟล์เชื่อม SOC Runner${replacedLinkIds.length ? " (แทนลิงก์เดิม)" : ""}`,
    metadata: { replacedLinkIds },
  });
  return {
    format: SOC_RUNNER_CONFIG_FORMAT, serverUrl, token, linkId: link.id,
    username: actor.username, displayName: actor.displayName, createdAt: link.createdAt.toISOString(),
  };
}

// Two downloads at once (a double click) both read "no active link"; under
// Serializable one of them fails and is retried, so only one link stays active.
async function serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 3) throw error;
    }
  }
}

// The runner calling: its active link and user. Throws "UNAUTHORIZED" for a
// missing, unknown or revoked token or a deactivated user, "FORBIDDEN" when
// the user no longer has `soc` access. Ticket 13's endpoints use it too.
export async function authenticateSocRunner(request: Request) {
  const [scheme, token] = (request.headers.get("authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token?.startsWith(TOKEN_PREFIX)) throw new Error("UNAUTHORIZED");
  const link = await prisma.socRunnerLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!link || link.revokedAt || !link.user.isActive) throw new Error("UNAUTHORIZED");
  if (!hasAccess(link.user, "soc")) throw new Error("FORBIDDEN");
  return link;
}

export type SocRunnerHeartbeat = { runnerVersion: string; claudeLogin: (typeof SOC_CLAUDE_LOGINS)[number] };

// A heartbeat body, or null when it isn't one.
export function parseSocRunnerHeartbeat(body: unknown): SocRunnerHeartbeat | null {
  const { runnerVersion, claudeLogin } = (body ?? {}) as Record<string, unknown>;
  if (typeof runnerVersion !== "string" || !RUNNER_VERSION.test(runnerVersion)) return null;
  if (typeof claudeLogin !== "string" || !(SOC_CLAUDE_LOGINS as readonly string[]).includes(claudeLogin)) return null;
  return { runnerVersion, claudeLogin: claudeLogin as SocRunnerHeartbeat["claudeLogin"] };
}

// Records a heartbeat on an active link. Not audited: it arrives every 30 s.
// Throws "UNAUTHORIZED" when the link was revoked since it was authenticated.
export async function recordSocRunnerHeartbeat(linkId: string, heartbeat: SocRunnerHeartbeat) {
  const lastSeenAt = new Date();
  const { count } = await prisma.socRunnerLink.updateMany({
    where: { id: linkId, revokedAt: null },
    data: { lastSeenAt, runnerVersion: heartbeat.runnerVersion, claudeLogin: heartbeat.claudeLogin },
  });
  if (count === 0) throw new Error("UNAUTHORIZED");
  return { lastSeenAt };
}

// The user's own runner for /soc, or null when they have no active link.
export async function mySocRunner(userId: string) {
  const link = await prisma.socRunnerLink.findFirst({ where: { userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  if (!link) return null;
  return {
    state: socRunnerState(link.lastSeenAt), lastSeenAt: link.lastSeenAt, runnerVersion: link.runnerVersion,
    claudeLogin: link.claudeLogin, linkedAt: link.createdAt,
  };
}

// ADMIN only. Every link, active ones first, newest first.
export async function listSocRunnerLinks() {
  await requireRole("ADMIN");
  const links = await prisma.socRunnerLink.findMany({
    orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: { user: { select: { username: true, displayName: true } }, revokedBy: { select: { displayName: true } } },
  });
  const now = new Date();
  return links.map((l) => ({
    id: l.id, username: l.user.username, userDisplayName: l.user.displayName, createdAt: l.createdAt,
    state: socRunnerState(l.lastSeenAt, now), lastSeenAt: l.lastSeenAt, runnerVersion: l.runnerVersion, claudeLogin: l.claudeLogin,
    revokedAt: l.revokedAt, revokeReason: l.revokeReason, revokedByName: l.revokedBy?.displayName ?? null,
  }));
}

// ADMIN only. Revokes an active link; its runner is refused from the next call.
export async function revokeSocRunnerLink(linkId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireRole("ADMIN");
  const revokedAt = new Date();
  const { count } = await prisma.socRunnerLink.updateMany({
    where: { id: linkId, revokedAt: null },
    data: { revokedAt, revokeReason: "admin", revokedById: actor.id },
  });
  if (count === 0) return { ok: false, error: "ไม่พบลิงก์นี้ หรือถูกยกเลิกไปแล้ว" };
  const link = await prisma.socRunnerLink.findUniqueOrThrow({ where: { id: linkId }, include: { user: { select: { displayName: true } } } });
  await writeAudit({
    actorId: actor.id, targetUserId: link.userId, action: "SOC_RUNNER_REVOKED", entityType: "SOC_RUNNER", entityId: link.id,
    summary: `ยกเลิกลิงก์ SOC Runner ของ ${link.user.displayName}`,
    metadata: { linkCreatedAt: link.createdAt.toISOString(), lastSeenAt: link.lastSeenAt?.toISOString() ?? null, runnerVersion: link.runnerVersion },
  });
  return { ok: true };
}
