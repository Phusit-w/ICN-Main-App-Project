"""SOC Runner installer, the part after unpacking (ADR 0008, ticket 16).

SOCRunnerSetup.exe (installer/SocRunnerSetup.cs) stops a running runner,
unpacks the bundled Python and the runner into %LOCALAPPDATA%\\SOCRunner\\app,
writes the runner config it carries to soc-runner.json and then runs:

    app\\python\\python.exe app\\runner\\install.py <root>

which, all inside the user profile and without admin rights:

1. checks the config;
2. installs Claude Code (the native build, the way claude.ai/install.ps1
   does) unless a working one is already there; Claude Code 2.1.292 needs no
   Git for Windows (checked 2026-10-07), so none is installed;
3. puts Claude Code on the per-user PATH and registers the runner to start
   at login (HKCU Run);
4. opens the Claude sign-in once, if this PC isn't signed in;
5. starts the runner.

Running the installer again repeats all of it: that is the repair.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from claude_cli import NO_WINDOW
from runner import load_config

AUTOSTART_NAME = "SOCRunner"
CLAUDE_DOWNLOADS = "https://downloads.claude.ai/claude-code-releases"
CLAUDE_CHANNEL = "stable"
SIGN_IN_TIMEOUT_SECONDS = 15 * 60
VERSION = re.compile(r"^\d+\.\d+\.\d+\S*$")


class InstallFailed(Exception):
    """A Thai reason shown to the reviewer."""


def install(root: Path, windows, log=print, home: Path | None = None) -> None:
    root = Path(root)
    config_path = root / "soc-runner.json"
    try:
        config = load_config(config_path)
    except (OSError, ValueError) as error:
        raise InstallFailed(f"ตัวติดตั้งนี้ไม่มีไฟล์เชื่อมที่ใช้ได้ ({error}) ให้ดาวน์โหลดตัวติดตั้งจากหน้า /soc ใหม่") from None
    log(f"ติดตั้ง SOC Runner ให้ {config.username or '?'} เชื่อมกับ {config.server_url}")

    claude = _ensure_claude(root, windows, log, home or Path.home())
    # The native install leaves ~/.local/bin off PATH (Problem/install-claude-code-no-admin.md),
    # but the web tells a logged-out reviewer to open `claude` and type /login.
    if windows.add_to_user_path(str(Path(claude).parent)):
        log(f"เพิ่ม {Path(claude).parent} ใน PATH ของผู้ใช้แล้ว (พิมพ์ claude ได้ในหน้าต่างที่เปิดใหม่)")

    # SOCRunner.exe is the bundled pythonw.exe under the runner's own name (build.py), so
    # Task Manager shows "SOCRunner" rather than an unexplained Python.
    runner = [str(root / "app" / "python" / "SOCRunner.exe"), str(root / "app" / "runner" / "runner.py"),
              str(config_path), "--log", str(root / "runner.log")]
    windows.set_autostart(AUTOSTART_NAME, " ".join(f'"{part}"' for part in runner))
    log("ตั้งให้ SOC Runner เริ่มเองทุกครั้งที่เข้า Windows แล้ว")

    if _logged_in(windows, claude):
        log("Claude บนเครื่องนี้เข้าสู่ระบบอยู่แล้ว")
    else:
        log("เปิดหน้าต่างเข้าสู่ระบบ Claude: เข้าสู่ระบบด้วยบัญชี Claude ของคุณในเบราว์เซอร์ที่เปิดขึ้น แล้วกลับมาที่นี่")
        windows.run_in_new_console([claude, "auth", "login", "--claudeai"], SIGN_IN_TIMEOUT_SECONDS)
        log("เข้าสู่ระบบ Claude แล้ว" if _logged_in(windows, claude)
            else "ยังไม่ได้เข้าสู่ระบบ Claude: SOC Runner จะรอ เปิดโปรแกรม claude แล้วพิมพ์ /login เมื่อพร้อม")

    windows.start_detached(runner, cwd=root)
    log("SOC Runner ทำงานแล้ว กลับไปที่หน้า /soc ได้เลย")


def _ensure_claude(root: Path, windows, log, home: Path) -> str:
    existing = windows.which("claude")
    native = home / ".local" / "bin" / "claude.exe"
    for candidate in [existing, str(native) if native.is_file() else None]:
        if candidate and windows.run([candidate, "--version"], timeout=120)[0] == 0:
            log(f"มี Claude Code อยู่แล้ว ({candidate})")
            return candidate

    log("กำลังดาวน์โหลด Claude Code (ประมาณ 200 MB)…")
    platform = "win32-arm64" if os.environ.get("PROCESSOR_ARCHITECTURE") == "ARM64" else "win32-x64"
    downloads = root / "downloads"
    try:
        version = windows.fetch(f"{CLAUDE_DOWNLOADS}/latest").decode("utf-8", "replace").strip()
        if not VERSION.match(version):
            raise InstallFailed("ดาวน์โหลด Claude Code ไม่ได้: downloads.claude.ai ตอบกลับไม่ใช่เลขเวอร์ชัน (เครือข่ายอาจบล็อกไว้)")
        manifest = json.loads(windows.fetch(f"{CLAUDE_DOWNLOADS}/{version}/manifest.json"))
        checksum = manifest["platforms"][platform]["checksum"]
        binary = downloads / f"claude-{version}-{platform}.exe"
        windows.download(f"{CLAUDE_DOWNLOADS}/{version}/{platform}/claude.exe", binary)
    except InstallFailed:
        raise
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise InstallFailed(f"ดาวน์โหลด Claude Code ไม่ได้ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่ ({error})") from None
    try:
        if _sha256(binary) != checksum:
            raise InstallFailed("ดาวน์โหลด Claude Code ไม่สมบูรณ์ (checksum ไม่ตรง) ลองติดตั้งใหม่อีกครั้ง")
        log(f"กำลังติดตั้ง Claude Code {version}…")
        code, output = windows.run([str(binary), "install", CLAUDE_CHANNEL], timeout=600)
        if code != 0:
            raise InstallFailed(f"ติดตั้ง Claude Code ไม่สำเร็จ (exit {code}) {output.strip()[:300]}")
    finally:
        shutil.rmtree(downloads, ignore_errors=True)
    if not native.is_file():
        raise InstallFailed(f"ติดตั้ง Claude Code แล้วแต่ไม่พบ {native}")
    log("ติดตั้ง Claude Code แล้ว")
    return str(native)


def _logged_in(windows, claude: str) -> bool:
    try:
        _, output = windows.run([claude, "auth", "status", "--json"], timeout=60)
        return json.loads(output).get("loggedIn") is True
    except (OSError, ValueError, AttributeError, subprocess.TimeoutExpired):
        return False


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Windows:
    """The real machine: HTTP, processes and the per-user Run key."""

    def which(self, name: str):
        return shutil.which(name)

    def fetch(self, url: str) -> bytes:
        with urllib.request.urlopen(url, timeout=60) as response:
            return response.read()

    def download(self, url: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as response, open(destination, "wb") as out:
            shutil.copyfileobj(response, out, 1 << 20)

    def run(self, argv: list[str], timeout: float = 600) -> tuple[int, str]:
        done = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=timeout, creationflags=NO_WINDOW)
        return done.returncode, done.stdout + done.stderr if done.returncode else done.stdout

    def run_in_new_console(self, argv: list[str], timeout: float) -> None:
        process = subprocess.Popen(argv, creationflags=subprocess.CREATE_NEW_CONSOLE)
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            pass  # left open; the runner waits for the login on its own

    def set_autostart(self, name: str, command: str) -> None:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run") as key:
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, command)

    def add_to_user_path(self, directory: str) -> bool:
        """Appends to the per-user PATH (HKCU\\Environment, no admin); False if already there."""
        import ctypes
        import winreg
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, "Environment", 0,
                                winreg.KEY_READ | winreg.KEY_SET_VALUE) as key:
            try:
                current, kind = winreg.QueryValueEx(key, "Path")
            except FileNotFoundError:
                current, kind = "", winreg.REG_EXPAND_SZ
            parts = [p for p in str(current).split(";") if p]
            wanted = directory.rstrip("\\").lower()
            if any(os.path.expandvars(p).rstrip("\\").lower() == wanted for p in parts):
                return False
            winreg.SetValueEx(key, "Path", 0, kind, ";".join(parts + [directory]))
        # Tell Explorer, so terminals opened from now on see the new PATH.
        ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001A, 0, "Environment", 0x0002, 5000, None)
        return True

    def start_detached(self, argv: list[str], cwd: Path) -> None:
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_BREAKAWAY_FROM_JOB
        try:
            subprocess.Popen(argv, creationflags=flags, close_fds=True, cwd=str(cwd))
        except OSError:
            # Breakaway is refused inside a job that forbids it; the runner then
            # still runs, only tied to that job.
            subprocess.Popen(argv, creationflags=flags & ~subprocess.CREATE_BREAKAWAY_FROM_JOB, close_fds=True, cwd=str(cwd))


def main(argv: list[str]) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    if len(argv) != 2:
        print("ใช้: install.py <โฟลเดอร์ SOCRunner>", file=sys.stderr)
        return 2
    try:
        install(Path(argv[1]), Windows())
    except InstallFailed as error:
        print(f"ติดตั้งไม่สำเร็จ: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
