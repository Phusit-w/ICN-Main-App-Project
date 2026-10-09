"""Runs one Local Check Run with `claude -p` under the reviewer's own login.

The runner core only sees `run(task) -> ClaudeRun`, `login_state()` and the
exceptions below, so the tests swap this for a fake.

How the CLI signals a used-up quota and a lost login (ticket 15, checked on
Claude Code 2.1.291; details in docs/SOC-RUNNER.md): with
`--output-format stream-json --verbose` every message is one JSON line. A run
that hits an API error ends with a `result` line where `is_error` is true, and
the synthetic assistant message before it carries `error` with the kind:
`authentication_failed` for a missing/expired login ("Not logged in · Please
run /login", "Login expired · Please run /login"), `rate_limit` or
`billing_error` for the plan's limit. The CLI also emits `rate_limit_event`
lines whose `rate_limit_info` has `status` ("allowed", "rejected", ...) and
`resetsAt` (Unix seconds), which gives the time the quota comes back.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

# The skill reads Word/PDF and runs its own Python scripts, and writes into out/.
# On Windows Claude Code runs shell commands through its PowerShell tool, not Bash.
ALLOWED_TOOLS = "Bash,PowerShell,Read,Write,Edit,Glob,Grep,Skill,TodoWrite"
# Vendor PDFs are untrusted input: no web access from a check.
DISALLOWED_TOOLS = "WebFetch,WebSearch"

# The installed runner runs on pythonw (no console): without this every
# `claude` it starts would open a console window on the reviewer's desktop.
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

LOGIN_ERRORS = {"authentication_failed", "oauth_org_not_allowed"}
# Not billing_error ("credit balance too low"): it doesn't reset on its own, so it is `failed`.
QUOTA_ERRORS = {"rate_limit"}
LOGIN_TEXT = re.compile(r"/login|not logged in|login expired|oauth token (has expired|revoked)|invalid_grant", re.I)
# Not "Context limit reached" or "Subagent nesting limit reached".
QUOTA_TEXT = re.compile(r"usage limit|hit your [a-z ]{0,20}limit|(session|weekly|opus|sonnet|fable) limit reached", re.I)


@dataclass
class ClaudeTask:
    prompt: str
    cwd: Path
    out_dir: Path
    # A new run starts the session with this id; a resumed one continues it.
    session_id: str = ""
    resume: bool = False
    # Appended to Claude Code's system prompt (the skill docs of the packet flow, ticket 06). The CLI
    # builds the system prompt anew for every process, so a resume of a packet session passes it again.
    system_prompt_file: Path | None = None


@dataclass
class ClaudeRun:
    model: str
    summary: str = ""  # Claude's last message, shown when the outputs are missing
    session_id: str = ""


class ClaudeFailed(Exception):
    """The run did not finish. The message is a Thai reason shown on the web."""


class ClaudeQuotaExhausted(Exception):
    """The reviewer's Claude plan is used up until `resets_at` (None when the CLI didn't say)."""

    def __init__(self, resets_at: datetime | None, session_id: str = ""):
        super().__init__(f"Claude quota used up until {resets_at.isoformat() if resets_at else '?'}")
        self.resets_at = resets_at
        self.session_id = session_id


class ClaudeLoggedOut(Exception):
    """Claude Code on this machine is not signed in, or its login expired."""


class ClaudeSessionMissing(ClaudeFailed):
    """`--resume` found no such session on this machine (stderr "No conversation found with session ID: ...")."""


def pick_model(output: dict) -> str:
    """The model that wrote most of the run (sub-agents may use a smaller one)."""
    usage = output.get("modelUsage")
    if not isinstance(usage, dict) or not usage:
        return "unknown"
    return max(usage, key=lambda name: (usage[name] or {}).get("outputTokens", 0) if isinstance(usage[name], dict) else 0)


class RunStream:
    """What the runner needs from a stream-json run, fed one line at a time."""

    def __init__(self):
        self.session_id = ""
        self.result: dict | None = None
        self.rate_limit: dict | None = None
        self.api_errors: set[str] = set()

    def feed(self, line: str) -> None:
        try:
            message = json.loads(line)
        except ValueError:
            return
        if not isinstance(message, dict):
            return
        if isinstance(message.get("session_id"), str) and message["session_id"]:
            self.session_id = message["session_id"]
        kind = message.get("type")
        if kind == "result":
            self.result = message
        elif kind == "rate_limit_event" and isinstance(message.get("rate_limit_info"), dict):
            self.rate_limit = message["rate_limit_info"]
        elif kind == "assistant" and isinstance(message.get("error"), str):
            self.api_errors.add(message["error"])


def interpret_stream(lines, returncode: int, stderr: str = "") -> ClaudeRun:
    stream = RunStream()
    for line in lines:
        stream.feed(line)
    return interpret(stream, returncode, stderr)


def interpret(stream: RunStream, returncode: int, stderr: str = "") -> ClaudeRun:
    result = stream.result or {}
    text = str(result.get("result") or "").strip()
    if returncode == 0 and result and not result.get("is_error"):
        return ClaudeRun(model=pick_model(result), summary=text, session_id=stream.session_id)
    if "No conversation found" in stderr or "No conversation found" in text:
        raise ClaudeSessionMissing("ไม่พบการตรวจรอบก่อนของคำขอนี้บนเครื่องนี้")
    status = result.get("api_error_status")
    # The message text is only trusted when the run ended on an API error, not
    # when Claude itself merely wrote "/login" or "limit" in its last message.
    api_error = bool(stream.api_errors) or status is not None or result.get("terminal_reason") == "api_error"
    if stream.api_errors & LOGIN_ERRORS or status == 401 or (api_error and LOGIN_TEXT.search(text)):
        raise ClaudeLoggedOut(text or "Not logged in")
    rejected = (stream.rate_limit or {}).get("status") == "rejected"
    if stream.api_errors & QUOTA_ERRORS or status == 429 or rejected or (api_error and QUOTA_TEXT.search(text)):
        resets_at = (stream.rate_limit or {}).get("resetsAt") if rejected else None
        when = datetime.fromtimestamp(resets_at, timezone.utc) if isinstance(resets_at, (int, float)) and resets_at > 0 else None
        raise ClaudeQuotaExhausted(when, stream.session_id)
    detail = (text or stderr or "").strip()[:300]
    raise ClaudeFailed(f"Claude หยุดทำงานก่อนตรวจเสร็จ (exit {returncode}): {detail}")


def run_arguments(executable: str, model: str, task: ClaudeTask) -> list[str]:
    argv = [executable, "-p", "--output-format", "stream-json", "--verbose", "--model", model,
            "--permission-mode", "acceptEdits", "--allowedTools", ALLOWED_TOOLS,
            "--disallowedTools", DISALLOWED_TOOLS]
    if task.session_id:
        argv += ["--resume", task.session_id] if task.resume else ["--session-id", task.session_id]
    if task.system_prompt_file:
        argv += ["--append-system-prompt-file", str(task.system_prompt_file)]
    return argv


def find_claude(which=shutil.which, home: Path | None = None) -> str:
    """`claude` on PATH, else the native install in the user profile.

    The install command (ticket 16) installs Claude Code to ~/.local/bin, and a
    runner started at login may not see the PATH that install added yet.
    """
    found = which("claude")
    if found:
        return found
    native = (home or Path.home()) / ".local" / "bin" / "claude.exe"
    return str(native) if native.is_file() else "claude"


def child_env(base: dict, python_dir: Path) -> dict:
    """The environment `claude -p` runs in.

    The skill's scripts run `python` and need python-docx and PyMuPDF; the
    install command puts them in the Python the runner itself runs on, so that
    Python comes first on PATH. Auto memory is off: every run shares one work
    folder, so one run's memory notes would reach the next (ticket 06).
    """
    env = {**base, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}
    key = next((k for k in env if k.upper() == "PATH"), "PATH")
    env[key] = os.pathsep.join(p for p in (str(python_dir), env.get(key, "")) if p)
    return env


class ClaudeCli:
    def __init__(self, model: str = "sonnet", timeout_seconds: float = 3 * 3600, executable: str | None = None):
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.executable = executable or find_claude()

    def run(self, task: ClaudeTask) -> ClaudeRun:
        env = child_env(dict(os.environ), Path(sys.executable).parent)
        try:
            process = subprocess.Popen(run_arguments(self.executable, self.model, task), stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=task.cwd, env=env,
                                       text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW)
        except FileNotFoundError:
            raise ClaudeFailed("ไม่พบโปรแกรม Claude Code (claude) บนเครื่องนี้") from None
        timed_out = threading.Event()

        def stop():
            timed_out.set()
            _kill_tree(process)

        timer = threading.Timer(self.timeout_seconds, stop)
        stderr_tail: list[str] = []
        reader = threading.Thread(target=_tail, args=(process.stderr, stderr_tail), daemon=True)
        timer.start()
        reader.start()
        # Streamed rather than collected: a long run's tool output can be large.
        stream = RunStream()
        try:
            try:
                process.stdin.write(task.prompt)
                process.stdin.close()
            except OSError:
                pass  # Claude exited early; its output says why
            for line in process.stdout:
                stream.feed(line)
            process.wait()
        finally:
            timer.cancel()
        reader.join(timeout=10)
        if timed_out.is_set():
            raise ClaudeFailed(f"Claude ตรวจนานเกิน {int(self.timeout_seconds // 60)} นาที จึงหยุด")
        return interpret(stream, process.returncode, "".join(stderr_tail))

    def login_state(self) -> str:
        """logged_in | logged_out | unknown, from `claude auth status` (local; costs no quota).

        It reads the stored login only: an expired login still on disk shows as
        logged_in until a run fails with ClaudeLoggedOut.
        """
        try:
            done = subprocess.run([self.executable, "auth", "status", "--json"], capture_output=True, text=True,
                                  encoding="utf-8", errors="replace", timeout=60, creationflags=NO_WINDOW)
            status = json.loads(done.stdout)
        except (OSError, subprocess.TimeoutExpired, ValueError):
            return "unknown"
        if not isinstance(status, dict) or not isinstance(status.get("loggedIn"), bool):
            return "unknown"
        return "logged_in" if status["loggedIn"] else "logged_out"


def _tail(stream, sink: list[str], keep: int = 4000) -> None:
    for chunk in stream:
        sink.append(chunk)
        while sum(map(len, sink)) > keep and len(sink) > 1:
            sink.pop(0)


def _kill_tree(process: subprocess.Popen) -> None:
    # `claude` may be a .cmd shim; killing only the child would leave Claude running on the user's quota.
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, creationflags=NO_WINDOW)
    else:
        process.kill()
