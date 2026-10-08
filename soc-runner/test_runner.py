"""SOC Runner core (seam 3) with a fake server and a fake Claude CLI.

Run: python -m unittest discover -s soc-runner -p "test_*.py"
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from datetime import datetime, timedelta, timezone

from claude_cli import ClaudeFailed, ClaudeLoggedOut, ClaudeQuotaExhausted, ClaudeRun, ClaudeSessionMissing, pick_model
from runner import RUNNER_VERSION, SocRunner, build_evidence_packet, carry_out, load_config, open_log, parse_args, single_instance
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

    def submit(self, request_id: str, results: Path, soc_check: Path, model: str, skill_version: str,
               packet_fallback: str = "") -> dict:
        if self.submit_error:
            raise self.submit_error
        self.submits.append({
            "id": request_id,
            "results": json.loads(results.read_text(encoding="utf-8")),
            "socCheckName": soc_check.name,
            "socCheck": soc_check.read_bytes(),
            "model": model,
            "skillVersion": skill_version,
            "packetFallback": packet_fallback,
        })
        return {"runId": "run-1", "rowCount": 1}


class FakeClaude:
    """Stands in for `claude -p`: records the task and writes the skill's outputs."""

    def __init__(self, writes: dict[str, bytes] | None = None, error: Exception | None = None, model: str = "claude-sonnet-5-5"):
        self.tasks = []
        self.seen_skill = None
        self.seen_inputs = None
        self.seen_input_files = None
        self.writes = writes if writes is not None else {
            "results.json": json.dumps(RESULTS).encode("utf-8"),
            "SOC_Check-2026-10-06-demo.docx": b"docx-bytes",
        }
        self.error = error
        self.model = model
        self.summary = ""
        self.login = "logged_in"
        self.login_checks = 0
        # Per run, in order: an exception to raise, or a dict of files to write first and then the exception.
        self.script: list = []
        self.seen_out: list[list[str]] = []

    def login_state(self) -> str:
        self.login_checks += 1
        return self.login

    def run(self, task):
        self.tasks.append(task)
        skill = task.cwd / ".claude" / "skills" / "tor-word-compliance-check" / "SKILL.md"
        self.seen_skill = skill.read_text(encoding="utf-8") if skill.exists() else None
        self.seen_inputs = sorted(p.name for p in (task.cwd / "inputs").iterdir())
        inputs = task.cwd / "inputs"
        self.seen_input_files = sorted(p.relative_to(inputs).as_posix() for p in inputs.rglob("*") if p.is_file())
        self.seen_out.append(sorted(p.name for p in task.out_dir.iterdir()))
        if self.script:
            step = self.script.pop(0)
            if step is not None:
                partial, error = step if isinstance(step, tuple) else ({}, step)
                for name, data in partial.items():
                    (task.out_dir / name).write_bytes(data)
                raise error
        if self.error:
            raise self.error
        for name, data in self.writes.items():
            (task.out_dir / name).write_bytes(data)
        return ClaudeRun(model=self.model, summary=self.summary, session_id=task.session_id)


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

    def test_the_item_scope_ends_at_a_dot_so_5_1_does_not_take_in_5_10(self):
        # A split major item ๕.๑ sits beside ๕.๑๐–๕.๑๕; "starts with ๕.๑" would take them in and the
        # server's validator would reject the whole run.
        request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4")
        request["majorItem"].update({"key": "5.1", "label": "๕.๑", "title": "เครื่องคอมพิวเตอร์แม่ข่าย"})
        claude = FakeClaude()
        carry_out(request, FakeServer(request, files), claude, self.work_root, quiet)
        prompt = claude.tasks[0].prompt
        self.assertNotIn("ขึ้นต้นด้วย ๕.๑ ", prompt)
        self.assertIn("`๕.๑.`", prompt)
        self.assertIn("`5.1.`", prompt)
        self.assertIn("๕.๑๐", prompt)  # the counter-example, named as outside the item

    def test_a_recheck_of_picked_rows_names_only_those_rows(self):
        request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4")
        request["rows"] = [{"row": 12, "item": "๑.๓"}, {"row": 15, "item": "๑.๕"}]
        claude = FakeClaude()
        carry_out(request, FakeServer(request, files), claude, self.work_root, quiet)
        prompt = claude.tasks[0].prompt
        self.assertIn("ตรวจใหม่เฉพาะ 2 แถว", prompt)
        self.assertIn("row 12 (ข้อ ๑.๓)", prompt)
        self.assertIn("row 15 (ข้อ ๑.๕)", prompt)
        self.assertIn("results.json ให้มีเฉพาะแถวเหล่านี้", prompt)
        self.assertNotIn("ทุกแถวใน results ต้องอยู่ในข้อใหญ่นี้", prompt)

    def test_a_whole_item_check_names_no_rows(self):
        claude = FakeClaude()
        carry_out(self.request, self.server, claude, self.work_root, quiet)
        self.assertNotIn("ตรวจใหม่เฉพาะ", claude.tasks[0].prompt)
        self.assertIn("ทุกแถวใน results ต้องอยู่ในข้อใหญ่นี้", claude.tasks[0].prompt)

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

    def test_evidence_keeps_its_folders_but_never_leaves_inputs(self):
        # A SOC cites folders ("2.5 เครื่องอ่าน … หน้า 3"), so a PDF uploaded from a folder lands in it.
        self.request["documents"][1]["name"] = "บทที่ 2/2.5 เครื่องอ่าน/1.เครื่อง/tc22.pdf"
        extra = dict(self.request["documents"][1], id="d3", name="../../x/C:/NUL.pdf", url="/api/soc-runner/requests/req-1/documents/d3")
        self.request["documents"].append(extra)
        self.server.files[extra["url"]] = self.server.files[self.request["documents"][1]["url"]]
        claude = FakeClaude()
        carry_out(self.request, self.server, claude, self.work_root, quiet)
        self.assertEqual(claude.seen_input_files, ["SOC ภาคผนวก.docx", "x/C_/_NUL.pdf", "บทที่ 2/2.5 เครื่องอ่าน/1.เครื่อง/tc22.pdf"])
        self.assertIn("`inputs/บทที่ 2/2.5 เครื่องอ่าน/1.เครื่อง/tc22.pdf`", claude.tasks[0].prompt)

    def test_a_folder_path_too_long_for_windows_drops_its_outer_folders(self):
        self.request["documents"][1]["name"] = "ก" * 200 + "/2.5 เครื่องอ่าน/tc22.pdf"
        claude = FakeClaude()
        carry_out(self.request, self.server, claude, self.work_root, quiet)
        self.assertIn("2.5 เครื่องอ่าน/tc22.pdf", claude.seen_input_files)

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

    def test_heartbeat_sends_the_runner_version_and_claude_login(self):
        server, claude = FakeServer(None, {}), FakeClaude()
        claude.login = "logged_out"
        SocRunner(server, claude, self.work_root, log=lambda *_: None).heartbeat()
        self.assertEqual(server.heartbeats, [{"runnerVersion": RUNNER_VERSION, "claudeLogin": "logged_out"}])


T0 = datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc).timestamp()
MISSING = {"status": "needs_documents", "major_item": "๑",
           "missing_documents": [{"name": "Section 3.2 Datasheet ของ Core Switch", "cited_in_rows": [3, 5]},
                                 {"name": "Catalog กล้อง", "cited_in_rows": [7]}],
           "available_documents": ["Datasheet A.pdf"]}


class Clock:
    def __init__(self, now: float = T0):
        self.now = now

    def __call__(self) -> float:
        return self.now


class SpecialStatesTest(unittest.TestCase):
    """needs_documents, paused_quota, needs_login and failed (ticket 15)."""

    def setUp(self):
        self.work_root = Path(tempfile.mkdtemp(prefix="soc-runner-test-"))
        self.skill = skill_zip({"tor-word-compliance-check/SKILL.md": SKILL_MD})
        self.request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4")
        self.server = FakeServer(self.request, files)
        self.clock = Clock()

    def tearDown(self):
        shutil.rmtree(self.work_root, ignore_errors=True)

    def carry_out(self, claude, **kwargs):
        return carry_out(self.request, self.server, claude, self.work_root, quiet, clock=self.clock, **kwargs)

    def states(self):
        return [p["state"] for _, p in self.server.reports]

    def test_missing_cited_documents_report_needs_documents_without_results(self):
        claude = FakeClaude(writes={"missing_documents.json": json.dumps(MISSING, ensure_ascii=False).encode("utf-8")})
        self.assertEqual(self.carry_out(claude), "needs_documents")
        self.assertEqual(self.server.reports[-1][1], {"state": "needs_documents",
                                                      "missingDocuments": ["Section 3.2 Datasheet ของ Core Switch", "Catalog กล้อง"]})
        self.assertEqual(self.server.submits, [])
        self.assertNotIn("failed", self.states())
        self.assertEqual(list(self.work_root.iterdir()), [], "the request is closed; nothing to resume")

    def test_documents_the_reviewer_acknowledged_do_not_stop_the_check(self):
        request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4", ["Catalog กล้อง"])
        server = FakeServer(request, files)
        only_acknowledged = {**MISSING, "missing_documents": [{"name": "Catalog กล้อง", "cited_in_rows": [7]}]}
        claude = FakeClaude(writes={"missing_documents.json": json.dumps(only_acknowledged, ensure_ascii=False).encode("utf-8"),
                                    "results.json": json.dumps(RESULTS).encode("utf-8"), "SOC_Check.docx": b"docx"})
        self.assertEqual(carry_out(request, server, claude, self.work_root, quiet, clock=self.clock), "submitted")
        self.assertEqual(len(server.submits), 1)

    def test_an_acknowledged_document_still_matches_when_claude_names_it_with_its_file_type(self):
        request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4", ["Catalog กล้อง"])
        server = FakeServer(request, files)
        renamed = {**MISSING, "missing_documents": [{"name": " catalog กล้อง.PDF "}]}
        claude = FakeClaude(writes={"missing_documents.json": json.dumps(renamed, ensure_ascii=False).encode("utf-8"),
                                    "results.json": json.dumps(RESULTS).encode("utf-8"), "SOC_Check.docx": b"docx"})
        self.assertEqual(carry_out(request, server, claude, self.work_root, quiet, clock=self.clock), "submitted")

    def test_a_used_up_quota_pauses_until_the_reset_and_keeps_the_work(self):
        resets_at = datetime.fromtimestamp(T0 + 3600, timezone.utc)
        claude = FakeClaude()
        claude.script = [({"highlights.json": b"rows 1-3"}, ClaudeQuotaExhausted(resets_at, "s"))]
        paused = []
        self.assertEqual(self.carry_out(claude, on_pause=paused.append), "paused")

        report = self.server.reports[-1][1]
        self.assertEqual(report["state"], "paused_quota")
        resume_at = datetime.fromisoformat(report["resumeAt"].replace("Z", "+00:00"))
        self.assertGreaterEqual(resume_at, resets_at)
        self.assertLess(resume_at, resets_at + timedelta(minutes=10))
        self.assertEqual(paused, [resume_at])
        self.assertNotIn("failed", self.states())
        self.assertEqual(self.server.submits, [])
        work = list(self.work_root.iterdir())
        self.assertEqual(len(work), 1)
        self.assertTrue((work[0] / "out" / "highlights.json").exists(), "rows already done are kept")

    def test_a_quota_pause_without_a_reset_time_waits_half_an_hour(self):
        claude = FakeClaude()
        claude.script = [ClaudeQuotaExhausted(None, "s")]
        self.assertEqual(self.carry_out(claude), "paused")
        resume_at = datetime.fromisoformat(self.server.reports[-1][1]["resumeAt"].replace("Z", "+00:00"))
        self.assertEqual(resume_at, datetime.fromtimestamp(T0 + 30 * 60, timezone.utc))

    def test_an_expired_login_reports_needs_login(self):
        claude = FakeClaude()
        claude.script = [ClaudeLoggedOut("Login expired · Please run /login")]
        self.assertEqual(self.carry_out(claude), "needs_login")
        self.assertEqual(self.server.reports[-1][1], {"state": "needs_login"})
        self.assertNotIn("failed", self.states())

    def test_any_other_failure_reports_a_thai_reason(self):
        claude = FakeClaude()
        claude.script = [ClaudeFailed("Claude หยุดทำงานก่อนตรวจเสร็จ (exit 1): Prompt is too long")]
        self.assertEqual(self.carry_out(claude), "failed")
        self.assertEqual(self.server.reports[-1][1]["state"], "failed")
        self.assertIn("Claude หยุดทำงาน", self.server.reports[-1][1]["reason"])

    def test_a_lost_session_after_a_pause_starts_a_new_one_with_the_rows_already_written(self):
        claude = FakeClaude()
        claude.script = [({"highlights.json": b"rows 1-3"}, ClaudeQuotaExhausted(None, "s")),
                         ClaudeSessionMissing("ไม่พบการตรวจรอบก่อน")]
        self.carry_out(claude)
        self.assertEqual(self.carry_out(claude), "submitted")
        first, resumed, fresh = claude.tasks
        self.assertTrue(resumed.resume)
        self.assertFalse(fresh.resume)
        self.assertNotEqual(fresh.session_id, first.session_id)
        self.assertIn("highlights.json", claude.seen_out[2])
        self.assertIn("ผลระหว่างทาง", fresh.prompt)

    def test_stopping_only_for_acknowledged_documents_explains_itself(self):
        request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4", ["Catalog กล้อง"])
        server = FakeServer(request, files)
        only_acknowledged = {**MISSING, "missing_documents": [{"name": "Catalog กล้อง"}]}
        claude = FakeClaude(writes={"missing_documents.json": json.dumps(only_acknowledged, ensure_ascii=False).encode("utf-8")})
        self.assertEqual(carry_out(request, server, claude, self.work_root, quiet, clock=self.clock), "failed")
        self.assertIn("รับทราบแล้ว", server.reports[-1][1]["reason"])

    def test_a_new_skill_version_after_a_pause_starts_over(self):
        claude = FakeClaude()
        claude.script = [({"highlights.json": b"old"}, ClaudeQuotaExhausted(None, "s"))]
        self.carry_out(claude)
        self.server.files[self.request["skill"]["url"]].headers = {"X-Soc-Skill-Version": "v8"}
        self.assertEqual(self.carry_out(claude), "submitted")
        self.assertFalse(claude.tasks[1].resume)
        self.assertNotEqual(claude.tasks[1].session_id, claude.tasks[0].session_id)
        self.assertEqual(claude.seen_out[1], [])


class PacketFlowTest(unittest.TestCase):
    """Ticket 10: the runner builds the evidence packet before Claude runs, or falls back to the old flow."""

    def setUp(self):
        self.work_root = Path(tempfile.mkdtemp(prefix="soc-runner-test-"))
        self.skill = skill_zip({"tor-word-compliance-check/SKILL.md": SKILL_MD})
        self.request, files = make_request(self.skill, b"soc-docx", b"%PDF-1.4")
        self.server = FakeServer(self.request, files)
        self.builds = []

    def tearDown(self):
        shutil.rmtree(self.work_root, ignore_errors=True)

    def builder(self, reason=""):
        def build(work, skill_dir, documents, label):
            self.builds.append((skill_dir, documents, label))
            if not reason:
                (work / "out" / "packet").mkdir(parents=True)
                (work / "out" / "packet" / "job.json").write_text("{}", encoding="utf-8")
            return reason
        return build

    def test_the_packet_is_built_first_and_the_prompt_turns_the_packet_flow_on(self):
        claude = FakeClaude()
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet, build_packet=self.builder()), "submitted")
        (skill_dir, documents, label), = self.builds
        self.assertEqual(skill_dir.parts[-3:], (".claude", "skills", "tor-word-compliance-check"))
        self.assertIn(("SOC", "SOC ภาคผนวก.docx"), documents)
        self.assertEqual(label, "๑")
        self.assertIn("packet", claude.seen_out[0], "Claude finds the packet already in out/")
        prompt = claude.tasks[0].prompt
        self.assertIn("evidence_packet", prompt)
        self.assertIn("สร้างไว้แล้วที่ `out/packet`", prompt)
        self.assertEqual(self.server.submits[0]["packetFallback"], "")
        self.assertIn("กำลังเตรียม evidence packet ข้อ ๑", [p.get("progress") for _, p in self.server.reports])

    def test_when_the_packet_cant_be_built_the_old_flow_runs_and_the_submit_says_why(self):
        claude = FakeClaude()
        logged = []
        outcome = carry_out(self.request, self.server, claude, self.work_root, logged.append,
                            build_packet=self.builder("สร้าง evidence packet ไม่สำเร็จ (exit 1): ValueError"))
        self.assertEqual(outcome, "submitted")
        prompt = claude.tasks[0].prompt
        self.assertNotIn("evidence_packet", prompt)
        self.assertNotIn("out/packet", prompt)
        self.assertIn("tor_decision", prompt)
        self.assertEqual(self.server.submits[0]["packetFallback"], "สร้าง evidence packet ไม่สำเร็จ (exit 1): ValueError")
        self.assertTrue(any("ใช้ flow เดิม" in line for line in logged))

    def test_a_resumed_run_keeps_its_flow_and_does_not_build_again(self):
        claude = FakeClaude()
        claude.script = [ClaudeQuotaExhausted(None, "s")]
        build = self.builder("skill รุ่นนี้ไม่มีตัวสร้าง evidence packet")
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet, build_packet=build), "paused")
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet, build_packet=build), "submitted")
        self.assertEqual(len(self.builds), 1)
        self.assertTrue(claude.tasks[1].resume)
        self.assertEqual(self.server.submits[0]["packetFallback"], "skill รุ่นนี้ไม่มีตัวสร้าง evidence packet")

    def test_a_lost_session_reuses_the_packet_already_built(self):
        claude = FakeClaude()
        claude.script = [ClaudeQuotaExhausted(None, "s"), ClaudeSessionMissing("ไม่พบการตรวจรอบก่อน")]
        build = self.builder()
        carry_out(self.request, self.server, claude, self.work_root, quiet, build_packet=build)
        self.assertEqual(carry_out(self.request, self.server, claude, self.work_root, quiet, build_packet=build), "submitted")
        self.assertEqual(len(self.builds), 1)
        self.assertIn("evidence_packet", claude.tasks[2].prompt)


class BuildEvidencePacketTest(unittest.TestCase):
    """The real builder call, with a stand-in for the skill's build_evidence_packet.py."""

    SOC = [("SOC", "SOC ภาคผนวก.docx"), ("EVIDENCE", "2.5/Datasheet A.pdf")]

    def setUp(self):
        self.work = Path(tempfile.mkdtemp(prefix="soc-runner-packet-"))
        self.skill_dir = self.work / ".claude" / "skills" / "tor-word-compliance-check"
        (self.work / "out").mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.work, ignore_errors=True)

    def stand_in(self, *lines: str):
        script = self.skill_dir / "scripts" / "build_evidence_packet.py"
        script.parent.mkdir(parents=True, exist_ok=True)
        script.write_text("\n".join(["import json, pathlib, sys", *lines]) + "\n", encoding="utf-8")

    def build(self, documents=SOC, env=None, **kwargs):
        base = {k: v for k, v in os.environ.items() if k != "SOC_RUNNER_PACKET"}  # Windows Python needs SYSTEMROOT
        return build_evidence_packet(self.work, self.skill_dir, documents, "๕.๕", env={**base, **(env or {})}, **kwargs)

    def test_a_built_packet_returns_no_reason(self):
        self.stand_in("out = pathlib.Path(sys.argv[4]); out.mkdir(parents=True)",
                      "(out / 'job.json').write_text(json.dumps(sys.argv[1:4], ensure_ascii=False), encoding='utf-8')")
        self.assertEqual(self.build(), "")
        args = json.loads((self.work / "out" / "packet" / "job.json").read_text(encoding="utf-8"))
        self.assertEqual([Path(args[0]).as_posix(), args[1], args[2]], ["inputs/SOC ภาคผนวก.docx", "๕.๕", "inputs"])

    def test_a_failing_builder_gives_its_last_error_line_and_leaves_no_half_packet(self):
        self.stand_in("out = pathlib.Path(sys.argv[4]); (out / 'rows').mkdir(parents=True)",
                      "sys.exit('ไม่พบข้อใหญ่ ๕.๕ ใน SOC')")
        reason = self.build()
        self.assertIn("สร้าง evidence packet ไม่สำเร็จ (exit 1)", reason)
        self.assertIn("ไม่พบข้อใหญ่ ๕.๕ ใน SOC", reason)
        self.assertFalse((self.work / "out" / "packet").exists())

    def test_a_builder_that_writes_no_job_json_falls_back(self):
        self.stand_in("pass")
        self.assertIn("ไม่สำเร็จ (exit 0)", self.build())

    def test_a_builder_that_runs_too_long_is_stopped(self):
        self.stand_in("import time; time.sleep(30)")
        self.assertIn("นานเกิน", self.build(timeout=1))

    def test_reasons_to_skip_the_builder(self):
        self.assertIn("ไม่มีตัวสร้าง", self.build())
        self.stand_in("raise SystemExit('should not run')")
        self.assertIn("SOC_RUNNER_PACKET=0", self.build(env={"SOC_RUNNER_PACKET": "0"}))
        self.assertIn(".docx", self.build([("SOC", "SOC.doc")]))
        self.assertIn("2 ไฟล์", self.build(self.SOC + [("SOC", "SOC2.docx")]))


class PausingServer(FakeServer):
    """Hands a paused request back once its resume time has passed, like the server's claim."""

    def __init__(self, request, files, clock):
        super().__init__(request, files)
        self.clock = clock
        self.claims = 0
        self.paused: tuple[dict, float] | None = None
        self.original = request

    def claim(self):
        self.claims += 1
        if self.paused and self.clock() >= self.paused[1]:
            request, self.paused = self.paused[0], None
            return request
        return super().claim()

    def report(self, request_id, payload):
        super().report(request_id, payload)
        if payload["state"] == "paused_quota":
            resume = datetime.fromisoformat(payload["resumeAt"].replace("Z", "+00:00")).timestamp()
            self.paused = (self.original, resume)


class AutomaticResumeTest(unittest.TestCase):
    def setUp(self):
        self.work_root = Path(tempfile.mkdtemp(prefix="soc-runner-test-"))
        request, files = make_request(skill_zip({"SKILL.md": SKILL_MD}), b"soc", b"pdf")
        self.clock = Clock()
        self.server = PausingServer(request, files, self.clock)
        self.claude = FakeClaude()
        self.runner = SocRunner(self.server, self.claude, self.work_root, log=quiet, clock=self.clock)

    def tearDown(self):
        shutil.rmtree(self.work_root, ignore_errors=True)

    def test_a_quota_pause_resumes_the_same_session_after_the_reset(self):
        resets_at = datetime.fromtimestamp(T0 + 3600, timezone.utc)
        self.claude.script = [({"highlights.json": b"rows 1-3"}, ClaudeQuotaExhausted(resets_at, "s"))]
        self.assertEqual(self.runner.poll_once(), "paused")

        # While paused the runner claims nothing: the quota is the user's, for every request.
        self.clock.now = T0 + 30 * 60
        claims = self.server.claims
        self.assertIsNone(self.runner.poll_once())
        self.assertEqual(self.server.claims, claims)

        self.clock.now = T0 + 3600 + 15 * 60
        self.assertEqual(self.runner.poll_once(), "submitted")
        first, second = self.claude.tasks
        self.assertFalse(first.resume)
        self.assertTrue(second.resume)
        self.assertEqual(second.session_id, first.session_id)
        self.assertIn("highlights.json", self.claude.seen_out[1], "the resumed run sees the rows already done")
        self.assertIn("ต่อจากที่ค้างไว้", second.prompt)
        self.assertEqual(len(self.server.submits), 1)
        self.assertEqual(list(self.work_root.iterdir()), [])

    def test_an_expired_login_holds_claims_and_tells_the_server_until_rechecked(self):
        self.claude.script = [ClaudeLoggedOut("Login expired · Please run /login")]
        self.assertEqual(self.runner.poll_once(), "needs_login")
        # `claude auth status` still says logged in (an expired token is still on disk), so trust it only later.
        self.runner.heartbeat()
        self.assertEqual(self.server.heartbeats[-1]["claudeLogin"], "logged_out")
        self.assertIsNone(self.runner.poll_once())

        self.clock.now = T0 + 6 * 60
        self.runner.heartbeat()
        self.assertEqual(self.server.heartbeats[-1]["claudeLogin"], "logged_in")

    def test_a_logged_out_claude_takes_no_requests(self):
        self.claude.login = "logged_out"
        self.assertIsNone(self.runner.poll_once())
        self.assertEqual(self.server.claims, 0)


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

    def test_keeps_the_servers_ca_certificate(self):
        pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n"
        config = load_config(self.write({"format": "soc-runner-config/1", "serverUrl": "https://soc", "token": "socr_a", "caCert": pem}))
        self.assertEqual(config.ca_cert, pem)
        self.assertEqual(load_config(self.write({"format": "soc-runner-config/1", "serverUrl": "https://soc", "token": "socr_a"})).ca_cert, "")

    def test_rejects_another_format(self):
        with self.assertRaises(ValueError):
            load_config(self.write({"format": "other", "serverUrl": "https://x", "token": "socr_a"}))

    def test_rejects_a_missing_token(self):
        with self.assertRaises(ValueError):
            load_config(self.write({"format": "soc-runner-config/1", "serverUrl": "https://x"}))


class ProcessTest(unittest.TestCase):
    """What the installed runner needs: one copy at a time, a log file, its arguments."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="soc-runner-process-"))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_only_one_runner_holds_the_lock(self):
        lock = self.dir / "runner.lock"
        first = single_instance(lock)
        self.assertIsNotNone(first)
        self.assertIsNone(single_instance(lock))
        first.close()
        again = single_instance(lock)
        self.assertIsNotNone(again)
        again.close()

    def test_a_large_log_is_rotated_once(self):
        log = self.dir / "runner.log"
        log.write_text("x" * 50, encoding="utf-8")
        with open_log(log, max_bytes=10) as stream:
            stream.write("new\n")
        self.assertEqual(log.read_text(encoding="utf-8"), "new\n")
        self.assertEqual((self.dir / "runner.log.1").read_text(encoding="utf-8"), "x" * 50)
        with open_log(log, max_bytes=1000) as stream:
            stream.write("more\n")
        self.assertEqual(log.read_text(encoding="utf-8"), "new\nmore\n")

    def test_a_long_running_log_rotates_too(self):
        log = self.dir / "runner.log"
        with open_log(log, max_bytes=10) as stream:
            stream.write("0123456789ab\n")
            stream.write("next\n")
        self.assertEqual(log.read_text(encoding="utf-8"), "next\n")
        self.assertEqual((self.dir / "runner.log.1").read_text(encoding="utf-8"), "0123456789ab\n")

    def test_arguments(self):
        self.assertEqual(parse_args(["runner.py", "c.json", "--log", "r.log"]), (Path("c.json"), Path("r.log")))
        self.assertEqual(parse_args(["runner.py", "c.json"]), (Path("c.json"), None))
        config, log = parse_args(["runner.py"])
        self.assertEqual(config.name, "soc-runner.json")
        self.assertIsNone(log)


class PickModelTest(unittest.TestCase):
    def test_picks_the_model_that_wrote_the_most(self):
        output = {"modelUsage": {"claude-haiku-4-5": {"outputTokens": 30}, "claude-sonnet-5-5": {"outputTokens": 900}}}
        self.assertEqual(pick_model(output), "claude-sonnet-5-5")

    def test_unknown_without_usage(self):
        self.assertEqual(pick_model({}), "unknown")


if __name__ == "__main__":
    unittest.main()
