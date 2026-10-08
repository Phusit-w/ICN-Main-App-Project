// The SOC Runner token's shape, kept free of server-only imports so that
// proxy.ts can refuse a malformed token before any route runs. Whether the
// token is valid (known, not revoked) is checked in lib/soc-runner.ts.
import { randomBytes } from "node:crypto";

const TOKEN = /^socr_[A-Za-z0-9_-]{43}$/;

export function newSocRunnerToken(): string {
  return `socr_${randomBytes(32).toString("base64url")}`;
}

// The token from `Authorization: Bearer <token>` (scheme case-insensitive),
// or null when the header is missing or the token isn't a SOC Runner token.
export function socRunnerBearerToken(request: Pick<Request, "headers">): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") || "");
  return match && TOKEN.test(match[1]) ? match[1] : null;
}

// The one-time code in the install command /soc gives a user (ticket 16).
// Checked by proxy.ts too, so the install script route needs no session.
const INSTALL_CODE = /^soci_[A-Za-z0-9_-]{32}$/;

export function newSocRunnerInstallCode(): string {
  return `soci_${randomBytes(24).toString("base64url")}`;
}

export function isSocRunnerInstallCode(code: string): boolean {
  return INSTALL_CODE.test(code);
}
