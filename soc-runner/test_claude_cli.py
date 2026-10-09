"""How a `claude -p --output-format stream-json` run is read (ticket 15).

The sample lines are trimmed copies of real Claude Code 2.1.291 output: a
logged-out run (empty CLAUDE_CONFIG_DIR) and a normal run's rate_limit_event.
The quota case uses the same event with status "rejected", as the CLI emits
it when the Pro plan's window is used up (see docs/SOC-RUNNER.md).
"""
from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from claude_cli import (ClaudeFailed, ClaudeLoggedOut, ClaudeQuotaExhausted, ClaudeSessionMissing, ClaudeTask, child_env,
                        find_claude, interpret_stream, run_arguments)

SESSION = "5aa7306e-bce2-4edc-822e-c5ba3e00f205"


def line(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


INIT = line({"type": "system", "subtype": "init", "session_id": SESSION, "tools": ["Read"]})
LOGGED_OUT = [
    INIT,
    line({"type": "assistant", "session_id": SESSION, "error": "authentication_failed", "is_api_error_message": True,
          "message": {"model": "<synthetic>", "content": [{"type": "text", "text": "Not logged in · Please run /login"}]}}),
    line({"type": "result", "subtype": "success", "is_error": True, "terminal_reason": "api_error", "api_error_status": None,
          "result": "Not logged in · Please run /login", "session_id": SESSION, "modelUsage": {}}),
]


def rate_limit(status: str, resets_at: int) -> str:
    return line({"type": "rate_limit_event", "session_id": SESSION,
                 "rate_limit_info": {"status": status, "resetsAt": resets_at, "rateLimitType": "five_hour",
                                     "overageStatus": "rejected", "isUsingOverage": False}})


def result(is_error: bool, text: str, status=None, usage=None) -> str:
    return line({"type": "result", "subtype": "success", "is_error": is_error, "api_error_status": status,
                 "terminal_reason": "api_error" if is_error else "completed", "result": text, "session_id": SESSION,
                 "modelUsage": usage if usage is not None else {}})


RESET = 1791283800  # 2026-10-06T11:30:00Z


class InterpretStreamTest(unittest.TestCase):
    def test_a_finished_run_gives_the_model_session_and_last_message(self):
        lines = [INIT, rate_limit("allowed", RESET),
                 result(False, "เสร็จแล้ว", usage={"claude-sonnet-5-5": {"outputTokens": 900}, "claude-haiku-4-5": {"outputTokens": 10}})]
        run = interpret_stream(lines, returncode=0)
        self.assertEqual((run.model, run.summary, run.session_id), ("claude-sonnet-5-5", "เสร็จแล้ว", SESSION))

    def test_not_logged_in_is_a_logged_out_error(self):
        with self.assertRaises(ClaudeLoggedOut):
            interpret_stream(LOGGED_OUT, returncode=1)

    def test_an_expired_login_message_is_a_logged_out_error(self):
        for text in ("Login expired · Please run /login", "OAuth token revoked · Please run /login",
                     "Failed to authenticate. API Error: 401 {\"error\":\"invalid_grant\"}"):
            with self.subTest(text=text), self.assertRaises(ClaudeLoggedOut):
                interpret_stream([INIT, result(True, text, status=401)], returncode=1)

    def test_a_used_up_quota_pauses_until_the_window_resets(self):
        lines = [INIT, rate_limit("rejected", RESET),
                 line({"type": "assistant", "session_id": SESSION, "error": "rate_limit", "is_api_error_message": True,
                       "message": {"content": [{"type": "text", "text": "You've hit your session limit · resets 6:30pm"}]}}),
                 result(True, "You've hit your session limit · resets 6:30pm", status=429)]
        with self.assertRaises(ClaudeQuotaExhausted) as caught:
            interpret_stream(lines, returncode=1)
        self.assertEqual(caught.exception.resets_at, datetime.fromtimestamp(RESET, timezone.utc))
        self.assertEqual(caught.exception.session_id, SESSION)

    def test_a_quota_error_without_a_reset_time_still_pauses(self):
        with self.assertRaises(ClaudeQuotaExhausted) as caught:
            interpret_stream([INIT, result(True, "Claude AI usage limit reached", status=429)], returncode=1)
        self.assertIsNone(caught.exception.resets_at)

    def test_an_allowed_rate_limit_event_on_a_failed_run_is_not_quota(self):
        with self.assertRaises(ClaudeFailed) as caught:
            interpret_stream([INIT, rate_limit("allowed", RESET), result(True, "Prompt is too long")], returncode=1)
        self.assertNotIsInstance(caught.exception, (ClaudeQuotaExhausted, ClaudeLoggedOut))
        self.assertIn("Prompt is too long", str(caught.exception))

    def test_claude_writing_login_in_its_own_answer_is_not_a_login_error(self):
        with self.assertRaises(ClaudeFailed) as caught:
            interpret_stream([INIT, line({"type": "result", "is_error": True, "terminal_reason": "max_turns",
                                          "result": "ผู้ใช้ต้องรัน /login ของระบบผู้ขาย", "session_id": SESSION})], returncode=1)
        self.assertNotIsInstance(caught.exception, ClaudeLoggedOut)

    def test_a_billing_error_does_not_reset_so_it_fails(self):
        lines = [INIT, line({"type": "assistant", "session_id": SESSION, "error": "billing_error", "is_api_error_message": True,
                             "message": {"content": [{"type": "text", "text": "Credit balance is too low"}]}}),
                 result(True, "Credit balance is too low", status=400)]
        with self.assertRaises(ClaudeFailed) as caught:
            interpret_stream(lines, returncode=1)
        self.assertNotIsInstance(caught.exception, ClaudeQuotaExhausted)

    def test_resuming_an_unknown_session_says_so(self):
        # Real output of `claude -p --resume <unknown id>`: exit 1, the reason on stderr.
        lines = [line({"type": "result", "subtype": "error_during_execution", "is_error": True, "session_id": SESSION})]
        with self.assertRaises(ClaudeSessionMissing):
            interpret_stream(lines, returncode=1, stderr=f"No conversation found with session ID: {SESSION}\n")

    def test_a_context_limit_is_not_quota(self):
        with self.assertRaises(ClaudeFailed):
            interpret_stream([INIT, result(True, "Context limit reached")], returncode=1)

    def test_a_crash_without_output_is_a_plain_failure_with_stderr(self):
        with self.assertRaises(ClaudeFailed) as caught:
            interpret_stream([], returncode=3, stderr="segfault")
        self.assertNotIsInstance(caught.exception, (ClaudeQuotaExhausted, ClaudeLoggedOut))
        self.assertIn("segfault", str(caught.exception))

    def test_non_json_lines_are_ignored(self):
        run = interpret_stream(["warning: something\n", INIT, result(False, "ok")], returncode=0)
        self.assertEqual(run.session_id, SESSION)


class RunArgumentsTest(unittest.TestCase):
    def test_a_new_run_starts_a_named_session_with_stream_output(self):
        argv = run_arguments("claude", "sonnet", ClaudeTask(prompt="p", cwd=Path("."), out_dir=Path("out"), session_id=SESSION))
        self.assertIn("stream-json", argv)
        self.assertIn("--verbose", argv)
        self.assertEqual(argv[argv.index("--session-id") + 1], SESSION)
        self.assertNotIn("--resume", argv)

    def test_a_resumed_run_continues_its_session(self):
        argv = run_arguments("claude", "sonnet", ClaudeTask(prompt="p", cwd=Path("."), out_dir=Path("out"), session_id=SESSION, resume=True))
        self.assertEqual(argv[argv.index("--resume") + 1], SESSION)
        self.assertNotIn("--session-id", argv)

    def test_the_skill_docs_go_into_the_system_prompt_when_given(self):
        docs = Path("work/current/.claude/runner-system.md")
        first = run_arguments("claude", "sonnet", ClaudeTask(prompt="p", cwd=Path("."), out_dir=Path("out"),
                                                             session_id=SESSION, system_prompt_file=docs))
        self.assertEqual(first[first.index("--append-system-prompt-file") + 1], str(docs))
        # The CLI doesn't keep it with the session, so a resume passes it again.
        resumed = run_arguments("claude", "sonnet", ClaudeTask(prompt="p", cwd=Path("."), out_dir=Path("out"),
                                                               session_id=SESSION, resume=True, system_prompt_file=docs))
        self.assertEqual(resumed[resumed.index("--append-system-prompt-file") + 1], str(docs))
        plain = run_arguments("claude", "sonnet", ClaudeTask(prompt="p", cwd=Path("."), out_dir=Path("out"), session_id=SESSION))
        self.assertNotIn("--append-system-prompt-file", plain)


class InstalledClaudeTest(unittest.TestCase):
    """The runner starts at login, before a new PATH from the Claude Code install reaches it."""

    def test_claude_on_path_wins(self):
        self.assertEqual(find_claude(which=lambda name: r"C:\tools\claude.exe", home=Path("/nowhere")), r"C:\tools\claude.exe")

    def test_falls_back_to_the_native_install_in_the_profile(self):
        import tempfile
        home = Path(tempfile.mkdtemp(prefix="soc-runner-home-"))
        try:
            self.assertEqual(find_claude(which=lambda name: None, home=home), "claude")
            exe = home / ".local" / "bin" / "claude.exe"
            exe.parent.mkdir(parents=True)
            exe.write_bytes(b"")
            self.assertEqual(find_claude(which=lambda name: None, home=home), str(exe))
        finally:
            import shutil
            shutil.rmtree(home, ignore_errors=True)

    def test_the_skill_scripts_get_the_runners_own_python_first(self):
        env = child_env({"PATH": r"C:\Windows", "OTHER": "1"}, python_dir=Path(r"C:\SOCRunner\app\python"))
        self.assertEqual(env["PATH"].split(";" if sys.platform == "win32" else ":")[0], str(Path(r"C:\SOCRunner\app\python")))
        self.assertEqual(env["OTHER"], "1")
        self.assertEqual(env["PYTHONUTF8"], "1")

    def test_auto_memory_is_off(self):
        # Every run shares work/current, so one run's memory notes would reach the next.
        self.assertEqual(child_env({"PATH": ""}, python_dir=Path("p"))["CLAUDE_CODE_DISABLE_AUTO_MEMORY"], "1")


if __name__ == "__main__":
    unittest.main()
