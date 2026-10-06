"""Runs one Local Check Run with `claude -p` under the reviewer's own login.

The runner core only sees `run(task) -> ClaudeRun` and `ClaudeFailed`, so the
tests swap this for a fake. How the CLI signals quota and an expired login is
ticket 15; here every failure is a plain ClaudeFailed.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

# The skill reads Word/PDF and runs its own Python scripts, and writes into out/.
# On Windows Claude Code runs shell commands through its PowerShell tool, not Bash.
ALLOWED_TOOLS = "Bash,PowerShell,Read,Write,Edit,Glob,Grep,Skill,TodoWrite"
# Vendor PDFs are untrusted input: no web access from a check.
DISALLOWED_TOOLS = "WebFetch,WebSearch"


@dataclass
class ClaudeTask:
    prompt: str
    cwd: Path
    out_dir: Path


@dataclass
class ClaudeRun:
    model: str
    summary: str = ""  # Claude's last message, shown when the outputs are missing


class ClaudeFailed(Exception):
    """The run did not finish. The message is a Thai reason shown on the web."""


def pick_model(output: dict) -> str:
    """The model that wrote most of the run (sub-agents may use a smaller one)."""
    usage = output.get("modelUsage")
    if not isinstance(usage, dict) or not usage:
        return "unknown"
    return max(usage, key=lambda name: (usage[name] or {}).get("outputTokens", 0) if isinstance(usage[name], dict) else 0)


class ClaudeCli:
    def __init__(self, model: str = "sonnet", timeout_seconds: float = 3 * 3600, executable: str | None = None):
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.executable = executable or shutil.which("claude") or "claude"

    def run(self, task: ClaudeTask) -> ClaudeRun:
        argv = [self.executable, "-p", "--output-format", "json", "--model", self.model,
                "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED_TOOLS,
                "--disallowedTools", DISALLOWED_TOOLS]
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
        try:
            process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       cwd=task.cwd, env=env, text=True, encoding="utf-8", errors="replace")
        except FileNotFoundError:
            raise ClaudeFailed("ไม่พบโปรแกรม Claude Code (claude) บนเครื่องนี้") from None
        try:
            stdout, stderr = process.communicate(task.prompt, timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired:
            _kill_tree(process)
            raise ClaudeFailed(f"Claude ตรวจนานเกิน {int(self.timeout_seconds // 60)} นาที จึงหยุด") from None
        try:
            output = json.loads(stdout)
        except ValueError:
            output = {}
        if process.returncode != 0 or output.get("is_error"):
            detail = str(output.get("result") or stderr or stdout or "").strip()[:300]
            raise ClaudeFailed(f"Claude หยุดทำงานก่อนตรวจเสร็จ (exit {process.returncode}): {detail}")
        return ClaudeRun(model=pick_model(output), summary=str(output.get("result") or "").strip())


def _kill_tree(process: subprocess.Popen) -> None:
    # `claude` may be a .cmd shim; killing only the child would leave Claude running on the user's quota.
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
    else:
        process.kill()
    try:
        process.communicate(timeout=30)
    except subprocess.TimeoutExpired:
        pass
