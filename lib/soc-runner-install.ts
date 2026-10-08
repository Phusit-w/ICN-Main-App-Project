// SOC Runner install command (ADR 0008, ticket 16). Smart App Control is on
// for company PCs and blocks an unsigned .exe nobody else has run, and there
// is no code-signing certificate, so there is no installer program. /soc
// gives the signed-in user one line to paste into Windows PowerShell:
//
//   iex (irm '<server>/api/soc-runner/install/<one-time code>')
//
// (plus, over https, a pin of the server's own certificate). The script that
// comes back carries the user's runner config (a new link) and the runner
// files, then runs soc-runner/bootstrap.ps1: Python from NuGet, the skill's
// packages from PyPI, then soc-runner/install.py. Every program it runs is
// one Smart App Control accepts on its own (signed or reputable).
// See docs/SOC-RUNNER.md, "ติดตั้ง".
import { createHash, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { requireAccess } from "@/lib/authorization";
import { hasAccess } from "@/lib/access";
import { createSocRunnerLink, socRunnerCaCert } from "@/lib/soc-runner";
import { isSocRunnerInstallCode, newSocRunnerInstallCode } from "@/lib/soc-runner-token";

export const SOC_RUNNER_INSTALL_CODE_MINUTES = 30;
// Written into %LOCALAPPDATA%\SOCRunner\app\runner by bootstrap.ps1. The
// standalone build carries them (next.config.ts outputFileTracingIncludes).
const SOC_RUNNER_FILES = ["runner.py", "claude_cli.py", "server_client.py", "install.py", "requirements.txt"];
const SOURCE_DIR = path.join(process.cwd(), "soc-runner");

type SocActor = Awaited<ReturnType<typeof requireAccess>>;

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

// A new one-time install code for the user, and the command that uses it.
// Links nothing yet, so the user's working runner keeps working until the
// command is pasted; an unused older code of theirs stops working.
export async function createSocRunnerInstallCommand(actor: SocActor, serverUrl: string) {
  const pem = await socRunnerCaCert();
  const pin = pem && serverUrl.startsWith("https:") ? new X509Certificate(pem).fingerprint.replaceAll(":", "") : null;
  const code = newSocRunnerInstallCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SOC_RUNNER_INSTALL_CODE_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.socRunnerInstallCode.deleteMany({ where: { OR: [{ userId: actor.id }, { expiresAt: { lt: now } }] } }),
    prisma.socRunnerInstallCode.create({ data: { userId: actor.id, codeHash: hashCode(code), expiresAt } }),
  ]);
  return { command: socRunnerInstallCommand(`${serverUrl}/api/soc-runner/install/${code}`, pin), expiresAt: expiresAt.toISOString() };
}

// One line for Windows PowerShell 5.1. PowerShell 7 ignores
// ServicePointManager, so it is told to use Windows PowerShell instead of
// failing on the certificate. With a pin, a certificate Windows already
// trusts still passes (the script then downloads from NuGet and PyPI).
function socRunnerInstallCommand(scriptUrl: string, pin: string | null): string {
  return [
    "if($PSVersionTable.PSEdition -eq 'Core'){throw 'Open Windows PowerShell (not PowerShell 7) and paste this again'}",
    "[Net.ServicePointManager]::SecurityProtocol='Tls12'",
    ...(pin ? [`$p='${pin}'`, "[Net.ServicePointManager]::ServerCertificateValidationCallback={param($s,$c,$h,$e)$e -eq 'None' -or $c.GetCertHashString() -eq $p}"] : []),
    `iex (irm '${scriptUrl}')`,
  ].join(";");
}

// The install script for a code: the user's runner config (a new link that
// replaces their previous one) and the runner files, then bootstrap.ps1.
// A used, expired or unknown code, or a user who may no longer use SOC, gets
// a script that only says so.
export async function socRunnerInstallScript(code: string, serverUrl: string): Promise<string> {
  const user = isSocRunnerInstallCode(code) ? await redeem(code) : null;
  if (!user) return REFUSED;
  const config = await createSocRunnerLink(user, serverUrl);
  const files: [string, string | Buffer][] = [["soc-runner.json", `${JSON.stringify(config, null, 2)}\n`]];
  for (const name of SOC_RUNNER_FILES) files.push([name, await readFile(path.join(SOURCE_DIR, name))]);
  const table = files.map(([name, content]) => `    '${name}' = '${Buffer.from(content).toString("base64")}'`).join("\n");
  const bootstrap = await readFile(path.join(SOURCE_DIR, "bootstrap.ps1"), "utf8");
  return `& {\n$SocRunnerFiles = @{\n${table}\n}\n${bootstrap}\n}\n`;
}

const REFUSED = "Write-Host 'คำสั่งติดตั้งนี้ใช้ไปแล้วหรือหมดอายุ: สร้างคำสั่งใหม่ที่หน้า ตรวจสอบ SOC แล้ววางอีกครั้ง' -ForegroundColor Red\n";

// Marks the code used (once, before it expires) and returns its user, or
// null. A code is spent even when its user can't link any more.
async function redeem(code: string) {
  const now = new Date();
  const { count } = await prisma.socRunnerInstallCode.updateMany({
    where: { codeHash: hashCode(code), usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count === 0) return null;
  const { user } = await prisma.socRunnerInstallCode.findUniqueOrThrow({ where: { codeHash: hashCode(code) }, include: { user: true } });
  return user.isActive && hasAccess(user, "soc") ? user : null;
}
