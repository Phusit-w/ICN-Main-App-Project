// SOC Runner installer download (ADR 0008, ticket 16). The installer
// (SOCRunnerSetup.exe, built by soc-runner/installer/build.py) is the same
// file for everyone; the server appends the downloading user's runner config
// to it, and the installer stub reads it back from its own file's end:
//
//   <installer bytes> <config JSON, UTF-8> <JSON length: uint32 LE> "SOCRCFG1"
//
// The installer is unsigned, so appending doesn't break a signature.
// See docs/SOC-RUNNER.md, "ตัวติดตั้ง".
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { socStorageRoot } from "@/lib/soc";
import { SOC_RUNNER_INSTALLER_FILE } from "@/lib/soc-shared";

export { SOC_RUNNER_INSTALLER_FILE };
const MAGIC = Buffer.from("SOCRCFG1", "latin1");
const TRAILER = 4 + MAGIC.length;

// SOC_RUNNER_INSTALLER_PATH, or <SOC_STORAGE_ROOT>/runner/SOCRunnerSetup.exe.
export function socRunnerInstallerPath(): string {
  const configured = process.env.SOC_RUNNER_INSTALLER_PATH?.trim();
  return configured || path.join(socStorageRoot(), "runner", SOC_RUNNER_INSTALLER_FILE);
}

export async function socRunnerInstallerAvailable(): Promise<boolean> {
  return access(socRunnerInstallerPath()).then(() => true, () => false);
}

// The base installer, or null when none was put on the server yet.
export async function readSocRunnerInstaller(): Promise<Buffer | null> {
  try {
    return await readFile(socRunnerInstallerPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function appendRunnerConfig(installer: Uint8Array, config: object): Buffer {
  const json = Buffer.from(JSON.stringify(config), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length);
  return Buffer.concat([installer, json, length, MAGIC]);
}

// The config appended to an installer, or null if it carries none.
export function readRunnerConfig(bundle: Buffer): unknown {
  if (bundle.length < TRAILER || !bundle.subarray(-MAGIC.length).equals(MAGIC)) return null;
  const length = bundle.readUInt32LE(bundle.length - TRAILER);
  if (length > bundle.length - TRAILER) return null;
  const end = bundle.length - TRAILER;
  return JSON.parse(bundle.subarray(end - length, end).toString("utf8"));
}

// The root certificate the runner should trust for this server, from
// SOC_RUNNER_CA_CERT_FILE (e.g. Caddy's `tls internal` root.crt), or
// undefined when unset. A setting that isn't a PEM certificate throws, so a
// runner is never handed a config that can't reach the server.
export async function socRunnerCaCert(): Promise<string | undefined> {
  const file = process.env.SOC_RUNNER_CA_CERT_FILE?.trim();
  if (!file) return undefined;
  const pem = await readFile(file, "utf8");
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem)) {
    throw new Error(`SOC_RUNNER_CA_CERT_FILE (${file}) is not a PEM certificate`);
  }
  return pem;
}
