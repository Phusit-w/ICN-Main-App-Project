"""HttpServerClient against a stub of the runner API on 127.0.0.1 (test only)."""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from server_client import HttpServerClient, NoSkillPackage, NotClaimed, SubmitRejected, Unauthorized

# path -> (status, json body, extra headers)
ROUTES: dict[str, tuple[int, object, dict]] = {}
SEEN: list[dict] = []


class Stub(BaseHTTPRequestHandler):
    def _answer(self):
        length = int(self.headers.get("Content-Length") or 0)
        SEEN.append({"method": self.command, "path": self.path, "auth": self.headers.get("Authorization"),
                     "type": self.headers.get("Content-Type"), "body": self.rfile.read(length)})
        status, body, headers = ROUTES[self.path]
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    do_GET = do_POST = _answer

    def log_message(self, *args):
        pass


class HttpServerClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.client = HttpServerClient(f"http://127.0.0.1:{cls.httpd.server_address[1]}/", "socr_test")

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        ROUTES.clear()
        SEEN.clear()

    def test_claim_sends_the_token_and_returns_the_request(self):
        ROUTES["/api/soc-runner/claim"] = (200, {"request": {"id": "r1"}}, {})
        self.assertEqual(self.client.claim(), {"id": "r1"})
        self.assertEqual(SEEN[0]["auth"], "Bearer socr_test")
        ROUTES["/api/soc-runner/claim"] = (200, {"request": None}, {})
        self.assertIsNone(self.client.claim())

    def test_a_revoked_token_is_unauthorized(self):
        ROUTES["/api/soc-runner/heartbeat"] = (401, {"error": "UNAUTHORIZED"}, {})
        with self.assertRaises(Unauthorized):
            self.client.heartbeat("0.1.0", "unknown")

    def test_not_claimed_and_no_skill_package(self):
        ROUTES["/api/soc-runner/requests/r1/report"] = (409, {"error": "NOT_CLAIMED", "message": "x"}, {})
        with self.assertRaises(NotClaimed):
            self.client.report("r1", {"state": "running"})
        ROUTES["/api/soc-runner/claim"] = (409, {"error": "NO_SKILL_PACKAGE", "message": "ยังไม่มี skill"}, {})
        with self.assertRaises(NoSkillPackage):
            self.client.claim()

    def test_download_returns_bytes_and_headers(self):
        ROUTES["/api/soc-runner/requests/r1/skill"] = (200, b"zip-bytes", {"X-Soc-Skill-Version": "v7"})
        download = self.client.download("/api/soc-runner/requests/r1/skill")
        self.assertEqual(download.content, b"zip-bytes")
        self.assertEqual({k.lower(): v for k, v in download.headers.items()}["x-soc-skill-version"], "v7")

    def test_submit_posts_multipart_and_maps_rejections(self):
        folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, folder, True)
        results, soc_check = folder / "results.json", folder / "SOC_Check ภาคผนวก.docx"
        results.write_text('{"mode":"full_audit"}', encoding="utf-8")
        soc_check.write_bytes(b"PK-docx")
        ROUTES["/api/soc-runner/requests/r1/submit"] = (201, {"runId": "run1", "rowCount": 4}, {})
        self.assertEqual(self.client.submit("r1", results, soc_check, "claude-sonnet-5-5", "v7"), {"runId": "run1", "rowCount": 4})
        body = SEEN[-1]["body"]
        self.assertTrue(SEEN[-1]["type"].startswith("multipart/form-data; boundary="))
        for part in (b'name="results"', b'{"mode":"full_audit"}', b'name="socCheck"', b"PK-docx", b"claude-sonnet-5-5", b"v7", b'.docx"'):
            self.assertIn(part, body)

        ROUTES["/api/soc-runner/requests/r1/submit"] = (422, {"errors": ["row 3: ขาด tor_decision"]}, {})
        with self.assertRaises(SubmitRejected) as rejected:
            self.client.submit("r1", results, soc_check, "m", "v7")
        self.assertEqual(rejected.exception.errors, ["row 3: ขาด tor_decision"])

        ROUTES["/api/soc-runner/requests/r1/submit"] = (409, {"error": "NOT_CLAIMED"}, {})
        with self.assertRaises(NotClaimed):
            self.client.submit("r1", results, soc_check, "m", "v7")


if __name__ == "__main__":
    unittest.main()
