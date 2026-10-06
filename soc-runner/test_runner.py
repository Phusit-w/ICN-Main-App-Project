"""SOC Runner core (seam 3) with a fake server and a fake Claude CLI.

Run: python -m unittest discover -s soc-runner -p "test_*.py"
"""
from __future__ import annotations

import hashlib
import io
import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from claude_cli import ClaudeFailed, ClaudeRun, pick_model
from runner import RUNNER_VERSION, SocRunner, carry_out, load_config
from server_client import NotClaimed, ServerError, SubmitRejected

SKILL_MD = "---\nname: tor-word-compliance-check\ndescription: test\n---\n# skill\n"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def skill_zip(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)
    return buffer.getvalue()


class FakeDownload:
    def __init__(self, content: bytes, headers: dict[str, str] | None = None):
        self.content = content
        self.headers = headers or {}


class FakeServer:
    """Records what the runner sends; serves files by URL like the runner API."""

    def __init__(self, request: dict | None, files: dict[str, FakeDownload]):
        self.pending = request
        self.files = files
        self.reports: list[tuple[str, dict]] = []
        self.submits: list[dict] = []
        self.heartbeats: list[dict] = []
        self.submit_error: Exception | None = None
        self.report_error: Exception | None = None

    def heartbeat(self, runner_version: str, claude_login: str) -> None:
        self.heartbeats.append({"runnerVersion": runner_version, "claudeLogin": claude_login})

    def claim(self) -> dict | None:
        request, self.pending = self.pending, None
        return request

    def download(self, url: str) -> FakeDownload:
        return self.files[url]

    def report(self, request_id: str, payload: dict) -> None:
        if self.report_error:
            raise self.report_error
        self.reports.append((request_id, payload))

    def submit(self, request_id: str, results: Path, soc_check: Path, model: str, skill_version: str) -> dict:
        if self.submit_error:
            raise self.submit_error
        self.submits.append({
            "id": request_id,
            "results": json.loads(results.read_text(encoding="utf-8")),
            "socCheckName": soc_check.name,
            "socCheck": soc_check.read_bytes(),
            "model": model,
            "skillVersion": skill_version,
        })
        return {"runId": "run-1", "rowCount": 1}


class FakeClaude:
    """Stands in for `claude -p`: records the task and writes the skill's outputs."""

    def __init__(self, writes: dict[str, bytes] | None = None, error: Exception | None = None, model: str = "claude-sonnet-5-5"):
        self.tasks = []
        self.seen_skill = None
        self.seen_inputs = None
        self.writes = writes if writes is not None else {
            "results.json": json.dumps(RESULTS).encode("utf-8"),
            "SOC_Check-2026-10-06-demo.docx": b"docx-bytes",
        }
        self.error = error
        self.model = model
        self.summary = ""

    def run(self, task):
        self.tasks.append(task)
        skill = task.cwd / ".claude" / "skills" / "tor-word-compliance-check" / "SKILL.md"
        self.seen_skill = skill.read_text(encoding="utf-8") if skill.exists() else None
        self.seen_inputs = sorted(p.name for p in (task.cwd / "inputs").iterdir())
        if self.error:
            raise self.error
        for name, data in self.writes.items():
            (task.out_dir / name).write_bytes(data)
        return ClaudeRun(model=self.model, summary=self.summary)


def quiet(*_):
    pass


RESULTS = {"mode": "full_audit", "options": ["evidence_support", "tor_decision"], "results": [{"row": 3, "item": "1.1"}]}


def make_request(skill: bytes, soc: bytes, pdf: bytes, acknowledged: list[str] | None = None):
    request = {
        "id": "req-1",
        "claimedAt": "2026-10-06T10:00:00.000Z",
        "job": {"id": "job-1", "title": "PEA demo"},
        "majorItem": {"id": "mi-1", "key": "1", "label": "๑", "title": "ระบบกล้อง"},
        "acknowledgedMissing": acknowledged or [],
        "skill": {"version": "v7", "fileName": "tor.skill", "sizeBytes": len(skill), "checksum": sha256(skill),
                  "url": "/api/soc-runner/requests/req-1/skill"},
        "documents": [
            {"id": "d1", "type": "SOC", "name": "SOC ภาคผนวก.docx", "sizeBytes": len(soc), "checksum": sha256(soc),
             "url": "/api/soc-runner/requests/req-1/documents/d1"},
            {"id": "d2", "type": "EVIDENCE", "name": "../Datasheet A.pdf", "sizeBytes": len(pdf), "checksum": sha256(pdf),
             "url": "/api/soc-runner/requests/req-1/documents/d2"},
        ],
    }
    files = {
        request["skill"]["url"]: FakeDownload(skill, {"X-Soc-Skill-Version": "v7"}),
        request["documents"][0]["url"]: FakeDownload(soc),
        request["documents"][1]["url"]: FakeDownload(pdf),
    }
    return request, files


class CarryOutTest(unittest.TestCase):
    def setUp(self):
        self.work_root = Path(tempfile.mkdtemp(prefix="soc-runner-test-"))
        self.skill = skill_zip({"tor-word-compliance-check/SKILL.md": SKILL_MD,
                                "tor-word-compliance-check/HEADLESS.md": "headless",
                                "tor-word-compliance-check/scripts/a.py": "print(1)"})
        self.request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4")
        self.server = FakeServer(self.request, files)

    def tearDown(self):
        shutil.rmtree(self.work_root, ignore_errors=True)

    def test_happy_path_submits_results_with_model_and_skill_version(self):
        claude = FakeClaude()
        outcome = carry_out(self.request, self.server, claude, self.work_root, quiet)

        self.assertEqual(outcome, "submitted")
        self.assertEqual(len(self.server.submits), 1)
        submit = self.server.submits[0]
        self.assertEqual(submit["id"], "req-1")
        self.assertEqual(submit["results"], RESULTS)
        self.assertEqual(submit["socCheck"], b"docx-bytes")
        self.assertTrue(submit["socCheckName"].startswith("SOC_Check"))
        self.assertEqual(submit["model"], "claude-sonnet-5-5")
        self.assertEqual(submit["skillVersion"], "v7")
        # The web shows progress while Claude runs, and nothing reports failed.
        self.assertTrue(self.server.reports)
        self.assertTrue(all(p["state"] == "running" for _, p in self.server.reports))
        # The work folder is removed after a successful submit.
        self.assertEqual(list(self.work_root.iterdir()), [])

    def test_claude_runs_with_the_downloaded_skill_and_documents(self):
        claude = FakeClaude()
        carry_out(self.request, self.server, claude, self.work_root, quiet)

        self.assertEqual(claude.seen_skill, SKILL_MD)
        # Names from the server never escape the inputs folder.
        self.assertEqual(claude.seen_inputs, ["Datasheet A.pdf", "SOC ภาคผนวก.docx"])
        prompt = claude.tasks[0].prompt
        self.assertIn("SOC_RUNNER_HEADLESS=1", prompt)
        self.assertIn("๑", prompt)
        self.assertIn("full_audit", prompt)
        self.assertIn("evidence_support", prompt)
        self.assertIn("tor_decision", prompt)
        self.assertIn("acknowledged_missing: []", prompt)
        self.assertIn("inputs/SOC ภาคผนวก.docx", prompt)

    def test_acknowledged_missing_documents_are_passed_to_the_skill(self):
        request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4", ["Section 3.2 Datasheet"])
        server = FakeServer(request, files)
        claude = FakeClaude()
        carry_out(request, server, claude, self.work_root, quiet)
        self.assertIn('acknowledged_missing: ["Section 3.2 Datasheet"]', claude.tasks[0].prompt)

    def test_the_downloaded_skill_version_is_recorded_over_the_claim(self):
        self.server.files[self.request["skill"]["url"]].headers = {"X-Soc-Skill-Version": "v8-pinned"}
        carry_out(self.request, self.server, FakeClaude(), self.work_root, quiet)
        self.assertEqual(self.server.submits[0]["skillVersion"], "v8-pinned")

    def test_a_corrupt_download_fails_without_running_claude(self):
        self.server.files[self.request["documents"][1]["url"]] = FakeDownload(b"truncated")
        claude = FakeClaude()
        outcome = carry_out(self.request, self.server, claude, self.work_root, quiet)

        self.assertEqual(outcome, "failed")
        self.assertEqual(claude.tasks, [])
        self.assertEqual(self.server.submits, [])
        state, reason = self.server.reports[-1][1]["state"], self.server.reports[-1][1]["reason"]
        self.assertEqual(state, "failed")
        self.assertIn("Datasheet A.pdf", reason)

    def test_a_skill_package_with_unsafe_paths_is_refused(self):
        bad = skill_zip({"SKILL.md": SKILL_MD, "../evil.py": "x"})
        request, files = make_request(bad, b"soc-docx", b"%PDF-1.4")
        server = FakeServer(request, files)
        claude = FakeClaude()
        self.assertEqual(carry_out(request, server, claude, self.work_root, quiet), "failed")
        self.assertEqual(claude.tasks, [])
        self.assertEqual(server.reports[-1][1]["state"], "failed")
        self.assertFalse((self.work_root.parent / "evil.py").exists())

    def test_a_skill_package_at_the_zip_root_is_installed_under_its_name(self):
        flat = skill_zip({"SKILL.md": SKILL_MD, "HEADLESS.md": "h"})
        request, files = make_request(flat, b"soc-docx", b"%PDF-1.4")
        claude = FakeClaude()
        self.assertEqual(carry_out(request, FakeServer(request, files), claude, self.work_root, quiet), "submitted")
        self.assertEqual(claude.seen_skill, SKILL_MD)

    def test_missing_results_file_reports_failed_in_thai(self):
        claude = FakeClaude(writes={"SOC_Check.docx": b"x"})
        outcome = carry_out(self.request, self.server, claude, self.work_root, quiet)
        self.assertEqual(outcome, "failed")
        self.assertEqual(self.server.submits, [])
        self.assertEqual(self.server.reports[-1][1]["state"], "failed")
        self.assertIn("results.json", self.server.reports[-1][1]["reason"])

    def test_claudes_last_message_explains_missing_outputs(self):
        claude = FakeClaude(writes={})
        claude.summary = "รัน Python ไม่ได้ เพราะคำสั่งต้องได้รับอนุมัติ"
        carry_out(self.request, self.server, claude, self.work_root, quiet)
        self.assertIn("รัน Python ไม่ได้", self.server.reports[-1][1]["reason"])

    def test_missing_soc_check_document_reports_failed(self):
        claude = FakeClaude(writes={"results.json": b"{}"})
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet), "failed")
        self.assertIn("SOC_Check", self.server.reports[-1][1]["reason"])

    def test_a_claude_failure_reports_failed_and_keeps_the_work_folder(self):
        claude = FakeClaude(error=ClaudeFailed("Claude หยุดทำงานก่อนตรวจเสร็จ"))
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet), "failed")
        self.assertEqual(self.server.reports[-1][1], {"state": "failed", "reason": "Claude หยุดทำงานก่อนตรวจเสร็จ"})
        self.assertEqual(len(list(self.work_root.iterdir())), 1)

    def test_a_request_no_longer_claimed_is_dropped_quietly(self):
        self.server.submit_error = NotClaimed("NOT_CLAIMED")
        self.assertEqual(carry_out(self.request, self.server, FakeClaude(), self.work_root, quiet), "dropped")
        self.assertFalse(any(p["state"] == "failed" for _, p in self.server.reports))

    def test_a_request_cancelled_before_claude_runs_is_dropped(self):
        self.server.report_error = NotClaimed("NOT_CLAIMED")
        claude = FakeClaude()
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet), "dropped")
        self.assertEqual(claude.tasks, [])

    def test_a_rejected_submit_is_not_reported_again(self):
        # The server already closed the request as failed with the import's errors.
        self.server.submit_error = SubmitRejected(["row 3: ขาด tor_decision"])
        self.assertEqual(carry_out(self.request, self.server, FakeClaude(), self.work_root, quiet), "rejected")
        self.assertEqual([p["state"] for _, p in self.server.reports if p["state"] == "failed"], [])

    def test_a_server_error_during_the_run_reports_failed(self):
        # Without this the server would hand the same running request back forever.
        def broken(url):
            raise ServerError("HTTP 500 SERVER_ERROR", 500, "SERVER_ERROR")
        self.server.download = broken
        self.assertEqual(carry_out(self.request, self.server, FakeClaude(), self.work_root, quiet), "failed")
        self.assertEqual(self.server.reports[-1][1]["state"], "failed")
        self.assertIn("server", self.server.reports[-1][1]["reason"])

    def test_a_malformed_request_reports_failed_instead_of_crashing(self):
        self.request["skill"] = None
        claude = FakeClaude()
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet), "failed")
        self.assertEqual(claude.tasks, [])
        self.assertEqual(self.server.reports[-1][1]["state"], "failed")

    def test_windows_reserved_names_are_renamed(self):
        self.request["documents"][1]["name"] = "NUL.pdf"
        claude = FakeClaude()
        carry_out(self.request, self.server, claude, self.work_root, quiet)
        self.assertIn("_NUL.pdf", claude.seen_inputs)


class SocRunnerTest(unittest.TestCase):
    def setUp(self):
        self.work_root = Path(tempfile.mkdtemp(prefix="soc-runner-test-"))

    def tearDown(self):
        shutil.rmtree(self.work_root, ignore_errors=True)

    def test_poll_once_does_nothing_when_there_is_no_request(self):
        server, claude = FakeServer(None, {}), FakeClaude()
        runner = SocRunner(server, claude, self.work_root, log=lambda *_: None)
        self.assertIsNone(runner.poll_once())
        self.assertEqual(claude.tasks, [])

    def test_poll_once_carries_out_the_claimed_request(self):
        skill = skill_zip({"SKILL.md": SKILL_MD})
        request, files = make_request(skill, b"soc", b"pdf")
        server = FakeServer(request, files)
        runner = SocRunner(server, FakeClaude(), self.work_root, log=lambda *_: None)
        self.assertEqual(runner.poll_once(), "submitted")
        self.assertEqual(len(server.submits), 1)

    def test_heartbeat_sends_the_runner_version(self):
        server = FakeServer(None, {})
        SocRunner(server, FakeClaude(), self.work_root, log=lambda *_: None).heartbeat()
        self.assertEqual(server.heartbeats, [{"runnerVersion": RUNNER_VERSION, "claudeLogin": "unknown"}])


class ConfigTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="soc-runner-config-"))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def write(self, data) -> Path:
        path = self.dir / "soc-runner.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_reads_the_downloaded_config(self):
        path = self.write({"format": "soc-runner-config/1", "serverUrl": "https://soc.example/", "token": "socr_abc",
                           "linkId": "l1", "username": "u", "displayName": "U", "createdAt": "x"})
        config = load_config(path)
        self.assertEqual(config.server_url, "https://soc.example")
        self.assertEqual(config.token, "socr_abc")

    def test_rejects_another_format(self):
        with self.assertRaises(ValueError):
            load_config(self.write({"format": "other", "serverUrl": "https://x", "token": "socr_a"}))

    def test_rejects_a_missing_token(self):
        with self.assertRaises(ValueError):
            load_config(self.write({"format": "soc-runner-config/1", "serverUrl": "https://x"}))


class PickModelTest(unittest.TestCase):
    def test_picks_the_model_that_wrote_the_most(self):
        output = {"modelUsage": {"claude-haiku-4-5": {"outputTokens": 30}, "claude-sonnet-5-5": {"outputTokens": 900}}}
        self.assertEqual(pick_model(output), "claude-sonnet-5-5")

    def test_unknown_without_usage(self):
        self.assertEqual(pick_model({}), "unknown")


if __name__ == "__main__":
    unittest.main()
