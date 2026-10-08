"""HTTP client for the SOC Runner API (docs/SOC-RUNNER.md).

Standard library only: nothing extra to install for it (ticket 16).
The runner only calls out to the server; it never listens on a port.
"""
from __future__ import annotations

import json
import ssl
import uuid
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path


class ServerError(Exception):
    def __init__(self, message: str, status: int = 0, code: str = "", data: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.data = data or {}


class Unauthorized(ServerError):
    """401: unknown, revoked or replaced token. The user must download a new config."""


class Forbidden(ServerError):
    """403: the user no longer has the `soc` permission."""


class NotClaimed(ServerError):
    """409 NOT_CLAIMED: this runner no longer carries the request (cancelled, stale, done)."""


class NoSkillPackage(ServerError):
    """409 NO_SKILL_PACKAGE: there is work but no current skill on the server."""


class SubmitRejected(ServerError):
    """422/409 from submit: the import refused the results and closed the request as failed."""

    def __init__(self, errors: list[str], status: int = 422):
        super().__init__("; ".join(errors) or "submit rejected", status, "REJECTED")
        self.errors = errors


@dataclass
class Download:
    content: bytes
    headers: dict[str, str] = field(default_factory=dict)


class HttpServerClient:
    def __init__(self, server_url: str, token: str, ca_file: str | None = None, timeout: float = 120, ca_pem: str | None = None):
        self.server_url = server_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        # Caddy on the LAN uses `tls internal`: the downloaded config carries its
        # root CA (caCert, set on the server), or SOC_RUNNER_CA_FILE points at it.
        # Either is trusted on top of Windows' own roots.
        self.context = None
        if ca_file or ca_pem:
            self.context = ssl.create_default_context()
            self.context.load_verify_locations(cafile=ca_file, cadata=ca_pem)

    def heartbeat(self, runner_version: str, claude_login: str) -> None:
        self._json("POST", "/api/soc-runner/heartbeat", {"runnerVersion": runner_version, "claudeLogin": claude_login})

    def claim(self) -> dict | None:
        return self._json("POST", "/api/soc-runner/claim").get("request")

    def download(self, url: str) -> Download:
        status, headers, body = self._send("GET", url)
        return Download(body, headers)

    def report(self, request_id: str, payload: dict) -> None:
        self._json("POST", f"/api/soc-runner/requests/{request_id}/report", payload)

    def submit(self, request_id: str, results: Path, soc_check: Path, model: str, skill_version: str) -> dict:
        boundary = f"----soc-runner-{uuid.uuid4().hex}"
        parts: list[bytes] = []

        def field_part(name: str, value: str) -> None:
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode() + value.encode("utf-8") + b"\r\n")

        def file_part(name: str, path: Path, content_type: str) -> None:
            # The server reads the file name only for its extension; keep it ASCII-safe.
            filename = path.name.encode("ascii", "replace").decode().replace('"', "_")
            head = f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'
            parts.append(head.encode() + path.read_bytes() + b"\r\n")

        file_part("results", results, "application/json")
        file_part("socCheck", soc_check, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        field_part("model", model)
        field_part("skillVersion", skill_version)
        parts.append(f"--{boundary}--\r\n".encode())
        try:
            _, _, body = self._send("POST", f"/api/soc-runner/requests/{request_id}/submit", b"".join(parts),
                                    f"multipart/form-data; boundary={boundary}")
        except ServerError as error:
            if error.status in (409, 422) and isinstance(error.data.get("errors"), list):
                raise SubmitRejected([str(e) for e in error.data["errors"]], error.status) from None
            raise
        return json.loads(body.decode("utf-8"))

    def _json(self, method: str, path: str, payload: dict | None = None) -> dict:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        _, _, raw = self._send(method, path, body, "application/json" if body is not None else None)
        return json.loads(raw.decode("utf-8")) if raw else {}

    def _send(self, method: str, path: str, body: bytes | None = None, content_type: str | None = None):
        request = urllib.request.Request(self.server_url + path, data=body, method=method)
        request.add_header("Authorization", f"Bearer {self.token}")
        if content_type:
            request.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout, context=self.context) as response:
                return response.status, dict(response.headers.items()), response.read()
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                data = json.loads(raw.decode("utf-8"))
            except ValueError:
                data = {}
            code = str(data.get("error", "")) if isinstance(data, dict) else ""
            message = (data.get("message") if isinstance(data, dict) else None) or f"HTTP {error.code} {code}".strip()
            kind = ServerError
            if error.code == 401:
                kind = Unauthorized
            elif error.code == 403:
                kind = Forbidden
            elif code == "NOT_CLAIMED":
                kind = NotClaimed
            elif code == "NO_SKILL_PACKAGE":
                kind = NoSkillPackage
            raise kind(message, error.code, code, data if isinstance(data, dict) else None) from None
