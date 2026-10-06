// SOC Runner links (ADR 0008, ticket 12). A user downloads a runner config
// from /soc that already carries a token bound to them (no pairing code);
// the server keeps only the token's sha256. The runner authenticates every
// call with `Authorization: Bearer <token>`, starting with the heartbeat that
// reports its version and Claude login state. A user has at most one active
// link: downloading again replaces it (ADR 0008). An admin can list and
// revoke links. See docs/SOC-RUNNER.md.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess, requireRole, writeAudit } from "@/lib/authorization";
import { hasAccess } from "@/lib/access";
import { newSocRunnerToken, socRunnerBearerToken } from "@/lib/soc-runner-token";
import { SOC_CLAUDE_LOGINS, socRunnerState, type SocClaudeLogin, type SocRunnerRevokeReason, type SocRunnerView } from "@/lib/soc-shared";

export const SOC_RUNNER_CONFIG_FORMAT = "soc-runner-config/1";
const RUNNER_VERSION = /^[A-Za-z0-9._+-]{1,64}$/;

type SocActor = Awaited<ReturnType<typeof requireAccess>>;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const iso = (value: Date | null) => value?.toISOString() ?? null;

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
  const token = newSocRunnerToken();
  const link = await serializable(async (tx) => {
    const active = await tx.socRunnerLink.findMany({ where: { userId: actor.id, revokedAt: null }, select: { id: true } });
    const replacedLinkIds = active.map((l) => l.id);
    if (replacedLinkIds.length) {
      await tx.socRunnerLink.updateMany({ where: { id: { in: replacedLinkIds } }, data: { revokedAt: new Date(), revokeReason: "replaced", revokedById: actor.id } });
    }
    const link = await tx.socRunnerLink.create({ data: { userId: actor.id, tokenHash: hashToken(token) } });
    await writeAudit({
      actorId: actor.id, targetUserId: actor.id, action: "SOC_RUNNER_LINKED", entityType: "SOC_RUNNER", entityId: link.id,
      summary: `ดาวน์โหลดไฟล์เชื่อม SOC Runner${replacedLinkIds.length ? " (แทนลิงก์เดิม)" : ""}`,
      metadata: { replacedLinkIds },
    }, tx);
    return link;
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
// the user no longer has `soc` access. Ticket 13's endpoints use it too; a
// write that must not happen after a revoke should also filter on
// `revokedAt: null`, as recordSocRunnerHeartbeat does.
export async function authenticateSocRunner(request: Request) {
  const token = socRunnerBearerToken(request);
  if (!token) throw new Error("UNAUTHORIZED");
  const link = await prisma.socRunnerLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!link || link.revokedAt || !link.user.isActive) throw new Error("UNAUTHORIZED");
  if (!hasAccess(link.user, "soc")) throw new Error("FORBIDDEN");
  return link;
}

export type SocRunnerHeartbeat = { runnerVersion: string; claudeLogin: SocClaudeLogin };

// A heartbeat body, or null when it isn't one.
export function parseSocRunnerHeartbeat(body: unknown): SocRunnerHeartbeat | null {
  const { runnerVersion, claudeLogin } = (body ?? {}) as Record<string, unknown>;
  if (typeof runnerVersion !== "string" || !RUNNER_VERSION.test(runnerVersion)) return null;
  if (typeof claudeLogin !== "string" || !(SOC_CLAUDE_LOGINS as readonly string[]).includes(claudeLogin)) return null;
  return { runnerVersion, claudeLogin: claudeLogin as SocClaudeLogin };
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

type SocRunnerLinkRow = Awaited<ReturnType<typeof prisma.socRunnerLink.findFirstOrThrow>>;

function socRunnerView(link: SocRunnerLinkRow, now = new Date()): SocRunnerView {
  return {
    state: socRunnerState(link.lastSeenAt, now), lastSeenAt: iso(link.lastSeenAt), runnerVersion: link.runnerVersion,
    claudeLogin: link.claudeLogin as SocClaudeLogin | null, linkedAt: link.createdAt.toISOString(),
    revokedAt: iso(link.revokedAt), revokeReason: link.revokeReason as SocRunnerRevokeReason | null,
  };
}

// The user's latest link for /soc: the active one, or the revoked one when
// an admin revoked it (so the page can say so). null if they never linked.
export async function mySocRunner(userId: string): Promise<SocRunnerView | null> {
  const link = await prisma.socRunnerLink.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  return link ? socRunnerView(link) : null;
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
    ...socRunnerView(l, now),
    id: l.id, username: l.user.username, userDisplayName: l.user.displayName, revokedByName: l.revokedBy?.displayName ?? null,
  }));
}

// ADMIN only. Revokes an active link; its runner is refused from the next call.
export async function revokeSocRunnerLink(linkId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireRole("ADMIN");
  const revoked = await prisma.$transaction(async (tx) => {
    const { count } = await tx.socRunnerLink.updateMany({
      where: { id: linkId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "admin", revokedById: actor.id },
    });
    if (count === 0) return false;
    const link = await tx.socRunnerLink.findUniqueOrThrow({ where: { id: linkId }, include: { user: { select: { displayName: true } } } });
    await writeAudit({
      actorId: actor.id, targetUserId: link.userId, action: "SOC_RUNNER_REVOKED", entityType: "SOC_RUNNER", entityId: link.id,
      summary: `ยกเลิกลิงก์ SOC Runner ของ ${link.user.displayName}`,
      metadata: { linkCreatedAt: link.createdAt.toISOString(), lastSeenAt: iso(link.lastSeenAt), runnerVersion: link.runnerVersion },
    }, tx);
    return true;
  });
  return revoked ? { ok: true } : { ok: false, error: "ไม่พบลิงก์นี้ หรือถูกยกเลิกไปแล้ว" };
}
