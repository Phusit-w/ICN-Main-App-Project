"""install.py, the install steps after bootstrap.ps1 put Python and the runner in place (ticket 16), with a fake Windows.

Run: python -m unittest discover -s soc-runner -p "test_*.py"
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from install import AUTOSTART_NAME, CLAUDE_DOWNLOADS, InstallFailed, install

CONFIG = {"format": "soc-runner-config/1", "serverUrl": "https://soc.example", "token": "socr_abc", "username": "alice"}
CLAUDE_BYTES = b"pretend claude.exe"


class FakeWindows:
    """What install() asks of the machine, recorded."""

    def __init__(self, home: Path):
        self.home = home
        self.on_path: str | None = None
        self.files = {
            f"{CLAUDE_DOWNLOADS}/latest": b"2.1.292\n",
            f"{CLAUDE_DOWNLOADS}/2.1.292/manifest.json": json.dumps(
                {"platforms": {"win32-x64": {"checksum": hashlib.sha256(CLAUDE_BYTES).hexdigest()}}}).encode(),
            f"{CLAUDE_DOWNLOADS}/2.1.292/win32-x64/claude.exe": CLAUDE_BYTES,
        }
        self.logged_in = False
        self.version_works = True
        self.install_exit = 0
        self.ran: list[list[str]] = []
        self.consoles: list[list[str]] = []
        self.started: list[list[str]] = []
        self.autostart: dict[str, str] = {}
        self.user_path: list[str] = [r"C:\Users\x\.local\nodejs"]

    def add_to_user_path(self, directory: str) -> bool:
        if any(p.rstrip("\\").lower() == directory.rstrip("\\").lower() for p in self.user_path):
            return False
        self.user_path.append(directory)
        return True

    @property
    def native_claude(self) -> Path:
        return self.home / ".local" / "bin" / "claude.exe"

    def which(self, name: str):
        return self.on_path

    def fetch(self, url: str) -> bytes:
        if url not in self.files:
            raise OSError(f"404 {url}")
        return self.files[url]

    def download(self, url: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(self.fetch(url))

    def run(self, argv: list[str], timeout: float = 600) -> tuple[int, str]:
        self.ran.append([str(a) for a in argv])
        if argv[1:] == ["--version"]:
            return (0, "2.1.292 (Claude Code)") if self.version_works else (1, "")
        if argv[1:] == ["install", "stable"]:
            if self.install_exit == 0:
                self.native_claude.parent.mkdir(parents=True, exist_ok=True)
                self.native_claude.write_bytes(Path(argv[0]).read_bytes())
            return self.install_exit, ""
        if argv[1:] == ["auth", "status", "--json"]:
            return (0 if self.logged_in else 1), json.dumps({"loggedIn": self.logged_in})
        raise AssertionError(f"unexpected command {argv}")

    def run_in_new_console(self, argv: list[str], timeout: float) -> None:
        self.consoles.append([str(a) for a in argv])
        self.logged_in = True

    def set_autostart(self, name: str, command: str) -> None:
        self.autostart[name] = command

    def start_detached(self, argv: list[str], cwd: Path) -> None:
        assert Path(cwd).is_dir()
        self.started.append([str(a) for a in argv])


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="soc-runner-install-"))
        self.root = self.dir / "SOCRunner"
        (self.root / "app" / "python").mkdir(parents=True)
        (self.root / "app" / "runner").mkdir(parents=True)
        (self.root / "soc-runner.json").write_text(json.dumps(CONFIG), encoding="utf-8")
        self.windows = FakeWindows(self.dir / "home")
        self.lines: list[str] = []

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def install(self):
        return install(self.root, self.windows, log=self.lines.append, home=self.windows.home)

    def test_a_fresh_pc_gets_claude_code_autostart_sign_in_and_a_running_runner(self):
        self.install()
        claude = str(self.windows.native_claude)
        self.assertTrue(self.windows.native_claude.is_file())
        self.assertFalse(any((self.root / "downloads").glob("*.exe")), "the downloaded setup binary is removed")
        # Sign-in opens once, in its own window, before the runner starts.
        self.assertEqual(self.windows.consoles, [[claude, "auth", "login", "--claudeai"]])
        runner = [str(self.root / "app" / "python" / "SOCRunner.exe"), str(self.root / "app" / "runner" / "runner.py"),
                  str(self.root / "soc-runner.json"), "--log", str(self.root / "runner.log")]
        self.assertEqual(self.windows.started, [runner])
        self.assertEqual(self.windows.autostart, {AUTOSTART_NAME: " ".join(f'"{a}"' for a in runner)})

    def test_claude_is_put_on_the_user_path_so_the_reviewer_can_type_claude_to_log_in_again(self):
        # Problem/install-claude-code-no-admin.md: the native install leaves ~/.local/bin off PATH.
        self.install()
        bin_dir = str(self.windows.native_claude.parent)
        self.assertEqual(self.windows.user_path, [r"C:\Users\x\.local\nodejs", bin_dir])
        self.install()
        self.assertEqual(self.windows.user_path.count(bin_dir), 1)

    def test_reinstalling_on_a_signed_in_pc_keeps_claude_and_does_not_ask_to_sign_in(self):
        self.windows.on_path = r"C:\Users\x\.local\bin\claude.exe"
        self.windows.logged_in = True
        self.install()
        self.assertFalse(any(cmd[1:] == ["install", "stable"] for cmd in self.windows.ran))
        self.assertEqual(self.windows.consoles, [])
        self.assertEqual(len(self.windows.started), 1)

    def test_a_broken_claude_code_is_installed_again(self):
        self.windows.on_path = r"C:\broken\claude.exe"
        self.windows.version_works = False
        self.install()
        self.assertTrue(any(cmd[1:] == ["install", "stable"] for cmd in self.windows.ran))
        self.assertEqual(self.windows.consoles[0][0], str(self.windows.native_claude))

    def test_a_corrupt_claude_download_is_refused_and_nothing_is_registered(self):
        self.windows.files[f"{CLAUDE_DOWNLOADS}/2.1.292/win32-x64/claude.exe"] = b"tampered"
        with self.assertRaises(InstallFailed) as caught:
            self.install()
        self.assertIn("checksum", str(caught.exception))
        self.assertFalse(any(cmd[1:] == ["install", "stable"] for cmd in self.windows.ran))
        self.assertEqual(self.windows.autostart, {})
        self.assertEqual(self.windows.started, [])

    def test_a_version_answer_that_is_not_a_version_is_refused(self):
        self.windows.files[f"{CLAUDE_DOWNLOADS}/latest"] = b"<html>blocked</html>"
        with self.assertRaises(InstallFailed):
            self.install()

    def test_claude_codes_own_install_failing_stops_the_install(self):
        self.windows.install_exit = 3
        with self.assertRaises(InstallFailed):
            self.install()
        self.assertEqual(self.windows.started, [])

    def test_no_internet_for_claude_code_says_so_in_thai(self):
        self.windows.files.clear()
        with self.assertRaises(InstallFailed) as caught:
            self.install()
        self.assertIn("ดาวน์โหลด Claude Code", str(caught.exception))

    def test_an_install_without_a_valid_config_stops_before_touching_anything(self):
        (self.root / "soc-runner.json").write_text("{}", encoding="utf-8")
        with self.assertRaises(InstallFailed):
            self.install()
        self.assertEqual(self.windows.ran, [])
        self.assertEqual(self.windows.autostart, {})


if __name__ == "__main__":
    unittest.main()
