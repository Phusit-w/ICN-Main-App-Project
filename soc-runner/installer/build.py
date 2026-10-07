"""Builds soc-runner/dist/SOCRunnerSetup.exe (ADR 0008, ticket 16). Windows only.

    npm run soc:runner:build                       # -> soc-runner/dist/SOCRunnerSetup.exe
    python soc-runner/installer/build.py --deploy-to <path>   # deploy/windows/update.ps1

`--deploy-to` builds and places the installer at <path> only when its sources
(source_files) changed since the one already there (a .sources-sha256 marker).

1. Python 3.12 from the official NuGet package `python` (a normal, relocatable
   layout with pythonw.exe and pip; checksum pinned), cached in installer/.cache;
2. the skill's packages (requirements.txt, wheels only) installed into it;
3. the runner (runner.py, claude_cli.py, server_client.py, install.py);
4. all of it zipped as payload.zip and embedded in SocRunnerSetup.cs, compiled
   with the csc of .NET Framework 4.x that ships with Windows.

The result carries no runner config: the server appends one per download
(lib/soc-runner-installer.ts). Put it on the server at SOC_RUNNER_INSTALLER_PATH
(default <SOC_STORAGE_ROOT>/runner/SOCRunnerSetup.exe), see docs/SOC-RUNNER.md.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNNER = HERE.parent
CACHE = HERE / ".cache"
BUILD = HERE / ".build"
DIST = RUNNER / "dist"
PYTHON_VERSION = "3.12.10"
PYTHON_NUPKG = f"https://api.nuget.org/v3-flatcontainer/python/{PYTHON_VERSION}/python.{PYTHON_VERSION}.nupkg"
PYTHON_SHA256 = "0eb85c2dfccccf1b17352de4c397f69194035b7d37149eacc16f1147d93de3b8"
RUNNER_FILES = ["runner.py", "claude_cli.py", "server_client.py", "install.py"]
CSC = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe"
# %LOCALAPPDATA%\SOCRunner\app\ on a long user name; Windows' classic path limit is 260.
INSTALL_PREFIX_LENGTH = len(r"C:\Users\firstname.lastname\AppData\Local\SOCRunner\app.new\\")


def main(argv: list[str]) -> int:
    if os.name != "nt":
        print("build.py builds a Windows installer; run it on Windows", file=sys.stderr)
        return 2
    if len(argv) == 3 and argv[1] == "--deploy-to":
        # deploy/windows/update.ps1: rebuild only when the sources changed.
        target = Path(argv[2])
        if not deploy(target, sources_digest(), build_installer):
            print(f"{target} is up to date")
        return 0
    if len(argv) != 1:
        print("usage: build.py [--deploy-to <path of SOCRunnerSetup.exe the server serves>]", file=sys.stderr)
        return 2
    build_installer()
    return 0


def source_files() -> list[Path]:
    """Everything that ends up in, or shapes, the installer."""
    return [RUNNER / name for name in RUNNER_FILES] + [
        HERE / name for name in ["SocRunnerSetup.cs", "build.py", "requirements.txt", "app.manifest"]]


def sources_digest() -> str:
    digest = hashlib.sha256()
    for path in source_files():
        digest.update(path.name.encode() + b"\0" + path.read_bytes().replace(b"\r\n", b"\n") + b"\0")
    return digest.hexdigest()


def deploy(target: Path, digest: str, build_fn) -> bool:
    """Puts a freshly built installer at target unless the one there came from these sources. True if it built."""
    marker = target.with_name(target.name + ".sources-sha256")
    if target.is_file() and marker.is_file() and marker.read_text(encoding="ascii").strip() == digest:
        return False
    built = build_fn()
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".partial")
    shutil.copyfile(built, partial)
    os.replace(partial, target)  # a download in progress never sees half a file
    marker.write_text(digest, encoding="ascii")
    print(f"deployed {target}")
    return True


def build_installer() -> Path:
    nupkg = fetch_python()
    shutil.rmtree(BUILD, ignore_errors=True)
    payload = BUILD / "payload"
    python_dir = payload / "python"
    print(f"unpacking Python {PYTHON_VERSION}")
    with zipfile.ZipFile(nupkg) as archive:
        for entry in archive.infolist():
            if entry.filename.startswith("tools/") and not entry.is_dir():
                target = python_dir / entry.filename[len("tools/"):]
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(entry))
    python = python_dir / "python.exe"
    print("installing the skill's packages")
    subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check", "--no-warn-script-location",
                    "--only-binary=:all:", "--no-cache-dir", "-r", str(HERE / "requirements.txt")], check=True)
    subprocess.run([str(python), "-c", "import docx, pymupdf, openpyxl; print('packages ok', pymupdf.VersionBind)"], check=True)
    # pip's launchers in Scripts\ hold this build folder's absolute path; useless once moved.
    shutil.rmtree(python_dir / "Scripts", ignore_errors=True)
    for cache in python_dir.rglob("__pycache__"):
        shutil.rmtree(cache, ignore_errors=True)
    shutil.rmtree(python_dir / "include", ignore_errors=True)
    # The runner's process, named for Task Manager (install.py starts it).
    shutil.copy2(python_dir / "pythonw.exe", python_dir / "SOCRunner.exe")
    (payload / "runner").mkdir()
    for name in RUNNER_FILES:
        shutil.copy2(RUNNER / name, payload / "runner" / name)

    longest = max((str(p.relative_to(payload)) for p in payload.rglob("*")), key=len)
    if INSTALL_PREFIX_LENGTH + len(longest) >= 260:
        raise SystemExit(f"path too long once installed: {longest}")

    zipped = BUILD / "payload.zip"
    print("zipping the payload")
    with zipfile.ZipFile(zipped, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(payload.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(payload).as_posix())

    DIST.mkdir(exist_ok=True)
    output = DIST / "SOCRunnerSetup.exe"
    print("compiling the installer stub")
    subprocess.run([str(CSC), "/nologo", "/codepage:65001", "/optimize+", "/target:exe", "/platform:x64",
                    f"/out:{output}", f"/win32manifest:{HERE / 'app.manifest'}", f"/resource:{zipped},payload.zip",
                    "/reference:System.IO.Compression.dll", "/reference:System.IO.Compression.FileSystem.dll",
                    "/reference:System.Windows.Forms.dll", str(HERE / "SocRunnerSetup.cs")], check=True)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"built {output} ({output.stat().st_size / 1e6:.1f} MB, sha256 {digest})")
    return output


def fetch_python() -> Path:
    CACHE.mkdir(exist_ok=True)
    nupkg = CACHE / f"python.{PYTHON_VERSION}.nupkg"
    if not nupkg.is_file() or sha256(nupkg) != PYTHON_SHA256:
        print(f"downloading {PYTHON_NUPKG}")
        with urllib.request.urlopen(PYTHON_NUPKG, timeout=120) as response, open(nupkg, "wb") as out:
            shutil.copyfileobj(response, out, 1 << 20)
    if sha256(nupkg) != PYTHON_SHA256:
        nupkg.unlink()
        raise SystemExit("the Python package's checksum doesn't match the pinned one")
    return nupkg


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
