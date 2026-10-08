import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { requireIngestKey } from "@/lib/project-card";
import { isSocRunnerInstallCode, socRunnerBearerToken } from "@/lib/soc-runner-token";

// Per-user login (see actions/auth.ts, lib/auth.ts, lib/session.ts,
// app/login/page.tsx): every request needs a valid signed session cookie or
// it's redirected to /login. Replaces the single shared HTTP Basic Auth
// pair (AUTH_USERNAME/AUTH_PASSWORD) this app used to gate every route
// with — see docs/PROJECT-OVERVIEW.md for why that changed. This only
// checks that a session exists; which apps a user may open is checked by
// the pages and actions themselves (docs/adr/0007-per-app-access.md).
//
// Named/filed as `proxy.ts` (not `middleware.ts`) — this Next.js version
// (16) renamed the convention; see node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/proxy.md. The exported function
// must be named `proxy`, not `middleware`. Also as of v16, Proxy defaults
// to the Node.js runtime (not Edge) — see that same doc's "Runtime"
// section — which is why lib/auth.ts can use node:crypto directly.
const LOGIN_PATH = "/login";

// The Project Card ingest script is an external crawler, not a browser —
// it has no session cookie to check and never will (see
// docs/adr/0005-project-card-push-based-ingest.md). Checked here, ahead of
// the session-cookie check below, so a bad/missing key gets a clean 401
// instead of being redirected to /login like every other unauthenticated
// route.
const PROJECT_CARD_INGEST_PATH = "/api/project-card/ingest";

// SOC Runner endpoints (ADR 0008, docs/SOC-RUNNER.md) are called by the
// program on a reviewer's PC, which has no session cookie. A request without
// a well-formed runner token is refused here (fail closed, even for a route
// that forgot its own check); each route then checks the token is known and
// not revoked (lib/soc-runner.ts authenticateSocRunner).
const SOC_RUNNER_API_PREFIX = "/api/soc-runner/";
// Except the install script (ticket 16): Windows PowerShell fetches it with
// the one-time code from the user's install command, which the route checks.
const SOC_RUNNER_INSTALL_PREFIX = "/api/soc-runner/install/";

// Per-IP rate limit — a plain sliding-ish window counter kept in memory.
// Checked BEFORE the session check below so it also throttles someone
// script-guessing a password against /login, not just authenticated abuse.
// In-memory state is fine for this app's deployment shape (exactly
// one `app` replica — see docker-compose.yml, there's no load balancer
// splitting traffic across multiple instances to keep this in sync with);
// it would need moving to something shared (e.g. Redis) if that ever
// changed. The map is never proactively pruned — for an intranet tool the
// number of distinct client IPs ever seen is small and bounded, so the
// worst case is a few dozen stale entries sitting in memory, not a real
// leak.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const requestCounts = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function clientIp(request: NextRequest): string {
  // Caddy (docker-compose.yml) sets X-Forwarded-For on every request it
  // proxies; the first entry is the original client. Falls back to a
  // constant key if it's ever missing (e.g. hit directly, bypassing
  // Caddy) — still rate-limits, just as one shared bucket instead of
  // per-IP in that case, rather than not rate-limiting at all.
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export function proxy(request: NextRequest) {
  // Local development: skip the prompt entirely rather than forcing every
  // `npm run dev` session to configure credentials just to load the page.
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  if (isRateLimited(clientIp(request))) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000) },
    });
  }

  if (!process.env.SESSION_SECRET) {
    // Misconfigured production deploy — fail loud and closed (refuse every
    // request with a clear message) rather than silently letting the app
    // run wide open because someone forgot to set this.
    return new NextResponse(
      "Server misconfigured: SESSION_SECRET is not set. Refusing all requests until it is configured — see DEPLOY.md.",
      { status: 500 }
    );
  }

  // Always reachable without a session — otherwise nobody could ever log
  // in (redirecting here would just redirect right back).
  if (request.nextUrl.pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === PROJECT_CARD_INGEST_PATH) {
    try {
      requireIngestKey(request);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  }

  if (request.nextUrl.pathname.startsWith(SOC_RUNNER_INSTALL_PREFIX)) {
    if (isSocRunnerInstallCode(request.nextUrl.pathname.slice(SOC_RUNNER_INSTALL_PREFIX.length))) return NextResponse.next();
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (request.nextUrl.pathname.startsWith(SOC_RUNNER_API_PREFIX)) {
    if (socRunnerBearerToken(request)) return NextResponse.next();
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    return NextResponse.next();
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except Next's own static-asset routes — those carry no
    // real data, and skipping them avoids an extra redirect round-trip per
    // JS/CSS chunk before the session cookie kicks in.
    // icn-logo.png (public/) is excluded for a different reason: next/image
    // (Header.tsx, FA017Form.tsx, FA018Form.tsx) optimizes it via an
    // internal server-to-server fetch back to this same app — that fetch
    // carries no session cookie, so in production it was hitting this
    // middleware, getting redirected instead of image bytes, and every
    // logo on the site silently failed to render ("The requested resource
    // isn't a valid image"). Only a problem in production — dev skips
    // auth entirely, which is why this wasn't caught until real auth was
    // turned on. If more files are ever added to public/, add them here
    // too rather than widening this to a whole extension pattern —
    // public/ is meant for genuinely public assets, so naming them
    // explicitly keeps that assumption visible rather than silent.
    // icn-logo-white.png: the transparent logo shown on the redesigned
    // /login split-panel and the app-shell rail — /login renders it before
    // any session exists, so it must be reachable unauthenticated too.
    "/((?!_next/static|_next/image|favicon.ico|icn-logo\\.png|icn-logo-white\\.png).*)",
  ],
};
