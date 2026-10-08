"""SOC Runner: carries out its user's Check Requests on this machine (ADR 0008).

Run from source:

    python soc-runner/runner.py path/to/soc-runner.json [--log runner.log]

The install command (ticket 16, bootstrap.ps1 + install.py) runs it on its own pythonw.exe at
login with `--log`, one copy at a time.

It sends a heartbeat every 30 s, polls the server for the oldest Check Request
of its user, downloads the SOC, the evidence and the pinned skill package,
runs `claude -p` with the skill in full mode on one major item, and submits
results.json and the SOC_Check document. It only polls; it opens no port.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import sys
import threading
import time
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath

from claude_cli import ClaudeCli, ClaudeFailed, ClaudeLoggedOut, ClaudeQuotaExhausted, ClaudeSessionMissing, ClaudeTask
from server_client import Forbidden, HttpServerClient, NoSkillPackage, NotClaimed, ServerError, SubmitRejected, Unauthorized

RUNNER_VERSION = "0.2.2"
CONFIG_FORMAT = "soc-runner-config/1"
HEADLESS_MARKER = "SOC_RUNNER_HEADLESS=1"
DEFAULT_SKILL_NAME = "tor-word-compliance-check"
HEARTBEAT_SECONDS = 30
IDLE_POLL_SECONDS = 15
REFUSED_RETRY_SECONDS = 60  # token refused, no soc access, or no skill on the server
MISSING_DOCUMENTS_FILE = "missing_documents.json"  # written by the skill's headless step 0
RUN_STATE_FILE = "soc-runner-run.json"  # the Claude session of a request, kept for a resume
RESUME_MARGIN_SECONDS = 2 * 60  # after the quota window resets
DEFAULT_PAUSE_SECONDS = 30 * 60  # when the CLI didn't say when the quota comes back
MAX_PAUSE_SECONDS = 7 * 24 * 3600 - 3600  # the server refuses a resume time beyond 7 days
LOGIN_CHECK_SECONDS = 5 * 60  # `claude auth status` is cached this long
LOGIN_RECHECK_SECONDS = 5 * 60  # after a run found the login expired; doubles each time, up to 30 min
# Short enough that the web stops saying "logged out" soon after the reviewer logs in again.
MAX_LOGIN_RECHECK_SECONDS = 30 * 60
MAX_MISSING = 50  # the server's limits for needs_documents
MAX_MISSING_NAME = 300
DOCUMENT_EXTENSION = re.compile(r"\.(pdf|docx?|xlsx?|pptx?)$", re.I)


class RunFailed(Exception):
    """A Thai reason the request failed for, reported to the server as `failed`."""


@dataclass
class Config:
    server_url: str
    token: str
    username: str = ""
    ca_cert: str = ""  # PEM of the server's own CA (Caddy `tls internal`), from the download


def load_config(path: Path) -> Config:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("format") != CONFIG_FORMAT:
        raise ValueError(f"{path} ไม่ใช่ไฟล์เชื่อม SOC Runner ({CONFIG_FORMAT})")
    server_url, token = data.get("serverUrl"), data.get("token")
    if not isinstance(server_url, str) or not server_url.startswith(("http://", "https://")):
        raise ValueError(f"{path} ไม่มี serverUrl")
    if not isinstance(token, str) or not token.startswith("socr_"):
        raise ValueError(f"{path} ไม่มีโทเคน ให้ดาวน์โหลดไฟล์เชื่อมจากหน้า /soc ใหม่")
    ca_cert = data.get("caCert")
    return Config(server_url.rstrip("/"), token, str(data.get("username") or ""), ca_cert if isinstance(ca_cert, str) else "")


# ---------------------------------------------------------------- one request


def carry_out(request: dict, server, claude, work_root: Path, log=print, on_pause=None, clock=time.time) -> str:
    """Carries out one claimed Check Request.

    Returns "submitted", "rejected" (the import refused the results and the
    server closed the request), "failed" (reported as failed), "dropped"
    (the request is no longer this runner's, e.g. cancelled or stale),
    "needs_documents" (the SOC cites documents the job doesn't have; no row
    was checked), "paused" (the Claude quota is used up; `on_pause` gets the
    resume time) or "needs_login" (Claude Code must be signed in again).

    The work folder is named after the request and keeps the Claude session
    id, so a paused or logged-out run, or one cut short by a restart, resumes
    that session with the rows it already did when the request comes back.
    """
    request_id = request["id"]
    item = request["majorItem"]
    work = Path(work_root) / _safe_name(request_id)
    try:
        server.report(request_id, {"state": "running", "progress": "กำลังดาวน์โหลดไฟล์"})
        skill_name, skill_version = _install_skill(request, server, work)
        documents = _download_documents(request, server, work / "inputs")
        out_dir = work / "out"
        saved = _read_run_state(work)
        resume = bool(saved.get("sessionId")) and saved.get("skillVersion") == skill_version
        if not resume:
            # A new skill version since the pause: its earlier output no longer fits.
            shutil.rmtree(out_dir, ignore_errors=True)
            saved = _new_run_state(work, skill_version)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / MISSING_DOCUMENTS_FILE).unlink(missing_ok=True)
        server.report(request_id, {"state": "running", "progress": f"Claude กำลังตรวจข้อ {item['label']}{' ต่อ' if resume else ''}"})
        log(f"[{request_id}] {'ตรวจต่อ' if resume else 'ตรวจ'}ข้อ {item['label']} ด้วย skill {skill_version}")
        prompt = build_resume_prompt(request) if resume else build_prompt(request, skill_name, documents)
        try:
            run = claude.run(ClaudeTask(prompt=prompt, cwd=work, out_dir=out_dir, session_id=saved["sessionId"], resume=resume))
        except ClaudeSessionMissing:
            if not resume:
                raise
            # The session was never saved (it stopped at once) or is gone: a new
            # one, which still finds the rows already written in out/.
            log(f"[{request_id}] ไม่พบ session เดิมของ Claude เริ่มใหม่โดยใช้ผลระหว่างทางใน out/")
            saved = _new_run_state(work, skill_version)
            prompt = build_prompt(request, skill_name, documents) + PARTIAL_OUTPUT_NOTE
            run = claude.run(ClaudeTask(prompt=prompt, cwd=work, out_dir=out_dir, session_id=saved["sessionId"]))
        acknowledged = request.get("acknowledgedMissing") or []
        missing = _missing_documents(out_dir, acknowledged)
        if missing:
            log(f"[{request_id}] ขาดเอกสาร: {', '.join(missing)}")
            server.report(request_id, {"state": "needs_documents", "missingDocuments": missing})
            shutil.rmtree(work, ignore_errors=True)
            return "needs_documents"
        if (out_dir / MISSING_DOCUMENTS_FILE).is_file() and not (out_dir / "results.json").is_file():
            raise RunFailed(f"Claude หยุดเพราะขาดเอกสารที่ผู้ตรวจรับทราบแล้ว ({', '.join(acknowledged)}) แทนที่จะตรวจต่อ ลองกดตรวจใหม่")
        results, soc_check = _outputs(out_dir, run.summary)
        server.report(request_id, {"state": "running", "progress": "กำลังส่งผลตรวจ"})
        submitted = server.submit(request_id, results, soc_check, run.model, skill_version)
    except NotClaimed:
        log(f"[{request_id}] คำขอนี้ไม่ได้อยู่กับเครื่องนี้แล้ว (ยกเลิกหรือหมดเวลา) ข้ามไป")
        shutil.rmtree(work, ignore_errors=True)
        return "dropped"
    except SubmitRejected as error:
        log(f"[{request_id}] server ไม่รับผลตรวจ: {'; '.join(error.errors)}")
        return "rejected"
    except (Unauthorized, Forbidden):
        raise  # the link itself is refused; nothing can be reported
    except ClaudeQuotaExhausted as error:
        resume_at = _resume_time(error.resets_at, clock())
        log(f"[{request_id}] โควตา Claude หมด หยุดถึง {resume_at.astimezone():%H:%M} แล้วจะตรวจต่อเอง")
        outcome = _report(server, request_id, {"state": "paused_quota", "resumeAt": resume_at.isoformat().replace("+00:00", "Z"),
                                               "progress": "ผลที่ตรวจแล้วเก็บไว้ จะตรวจต่อเมื่อโควตากลับมา"}, "paused", log)
        if outcome == "paused" and on_pause:
            on_pause(resume_at)
        return outcome
    except ClaudeLoggedOut as error:
        log(f"[{request_id}] Claude ต้องเข้าสู่ระบบใหม่ ({error}) เปิด claude แล้วพิมพ์ /login")
        return _report(server, request_id, {"state": "needs_login"}, "needs_login", log)
    except (RunFailed, ClaudeFailed) as error:
        return _report_failed(server, request_id, str(error), log)
    except ServerError as error:
        # Otherwise the server hands the same running request back on every claim.
        return _report_failed(server, request_id, f"ติดต่อ server ไม่สำเร็จระหว่างตรวจ ({error})", log)
    except Exception as error:  # a bug or a malformed answer must not stop the runner
        return _report_failed(server, request_id, f"SOC Runner ผิดพลาด: {type(error).__name__}: {error}", log)
    log(f"[{request_id}] ส่งผลแล้ว {submitted.get('rowCount', '?')} แถว")
    shutil.rmtree(work, ignore_errors=True)
    return "submitted"


PARTIAL_OUTPUT_NOTE = ("- `out/` อาจมีผลระหว่างทางจากรอบก่อนที่หยุดไป (เช่น highlights.json) ให้ใช้ต่อได้"
                       " ไม่ต้องทำซ้ำส่วนที่ถูกต้องแล้ว\n")


def build_resume_prompt(request: dict) -> str:
    """Continues the Claude session a quota pause or an expired login cut short."""
    item = request["majorItem"]
    acknowledged = json.dumps(request.get("acknowledgedMissing") or [], ensure_ascii=False)
    lines = [
        HEADLESS_MARKER,
        "",
        f"การตรวจข้อใหญ่ {item['label']} ถูกหยุดไว้ (โควตา Claude หมดหรือต้องเข้าสู่ระบบใหม่) ตอนนี้ใช้งานได้แล้ว"
        " ให้ตรวจต่อจากที่ค้างไว้ในการสนทนานี้ ใช้ skill ไฟล์ และผลระหว่างทางใน `out/` ชุดเดิม ห้ามตรวจแถวที่ตรวจเสร็จแล้วซ้ำ ห้ามถามผู้ใช้",
        "- เมื่อเสร็จให้เขียน `out/results.json` และ `out/SOC_Check.docx` ให้ครบทุกแถวของข้อใหญ่นี้ (รวมแถวที่ตรวจไว้ก่อนหยุด)",
        f"- acknowledged_missing: {acknowledged}",
        "- ห้ามแก้ไขไฟล์ใน `inputs/`",
    ]
    return "\n".join(lines) + "\n"


def item_scope(item: dict) -> str:
    """Which item numbers belong to the major item, as the server's validator reads it: the number
    itself or one that continues after a dot. "Starts with ๕.๑" would also take in ๕.๑๐–๕.๑๕,
    the sub-sections beside a split ๕.๑, and the validator would reject the whole run."""
    label, key = item["label"], item["key"]
    zero, one = ("๐", "๑") if label[-1:] in "๐๑๒๓๔๕๖๗๘๙" else ("0", "1")
    numbers = [label] if label == key else [label, key]
    return (f"(เลขข้อเท่ากับ {' หรือ '.join(numbers)} หรือขึ้นต้นด้วย {' หรือ '.join(f'`{n}.`' for n in numbers)} เท่านั้น"
            f" เช่น {label}.{one} อยู่ในข้อนี้ แต่ {label}{zero} ไม่ใช่)")


def build_prompt(request: dict, skill_name: str, documents: list[tuple[str, str]]) -> str:
    item = request["majorItem"]
    soc = [name for kind, name in documents if kind == "SOC"]
    evidence = [name for kind, name in documents if kind != "SOC"]
    acknowledged = json.dumps(request.get("acknowledgedMissing") or [], ensure_ascii=False)
    lines = [
        HEADLESS_MARKER,
        "",
        f"ใช้ skill `{skill_name}` ที่อยู่ใน `.claude/skills/{skill_name}/SKILL.md` ของโฟลเดอร์นี้เท่านั้น"
        " (ห้ามใช้ skill ชื่อเดียวกันจากที่อื่น) อ่าน HEADLESS.md ข้าง SKILL.md ก่อนเริ่ม",
        "ตรวจ SOC ในโหมด full_audit พร้อม option evidence_support และ tor_decision ห้ามถามผู้ใช้",
        "",
        f"- ไฟล์ SOC: {', '.join(f'`inputs/{n}`' for n in soc) or '(ไม่มี)'}",
        f"- ไฟล์หลักฐาน: {', '.join(f'`inputs/{n}`' for n in evidence) or '(ไม่มี)'}",
        f"- ตรวจเฉพาะข้อใหญ่ {item['label']} \"{item.get('title') or ''}\" {item_scope(item)}"
        " ทุกแถวใน results ต้องอยู่ในข้อใหญ่นี้",
        "- โฟลเดอร์ output: `out/` ให้เขียนผลเป็น `out/results.json` และเอกสาร `out/SOC_Check.docx`"
        " ไฟล์ระหว่างทาง (เช่น highlights.json) ก็เก็บใน `out/`",
        f"- acknowledged_missing: {acknowledged}",
        "- ห้ามแก้ไขไฟล์ใน `inputs/`",
    ]
    return "\n".join(lines) + "\n"


def _report_failed(server, request_id: str, reason: str, log) -> str:
    log(f"[{request_id}] ตรวจไม่สำเร็จ: {reason}")
    return _report(server, request_id, {"state": "failed", "reason": reason[:500]}, "failed", log)


def _report(server, request_id: str, payload: dict, outcome: str, log) -> str:
    try:
        server.report(request_id, payload)
    except NotClaimed:
        return "dropped"
    except ServerError as error:
        # The claim goes stale and returns to `requested` on its own.
        log(f"[{request_id}] รายงานสถานะ {payload['state']} ไม่ได้: {error}")
    return outcome


def _resume_time(resets_at: datetime | None, now: float) -> datetime:
    """When to try again after the quota ran out: shortly after the reset, within the server's limit."""
    current = datetime.fromtimestamp(now, timezone.utc)
    if resets_at is None or resets_at <= current:
        return current + timedelta(seconds=DEFAULT_PAUSE_SECONDS)
    return min(resets_at + timedelta(seconds=RESUME_MARGIN_SECONDS), current + timedelta(seconds=MAX_PAUSE_SECONDS))


def _missing_documents(out_dir: Path, acknowledged: list[str]) -> list[str]:
    """The cited documents the skill reported missing, less those the reviewer acknowledged."""
    path = out_dir / MISSING_DOCUMENTS_FILE
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except ValueError:
        raise RunFailed(f"Claude เขียน {MISSING_DOCUMENTS_FILE} ไม่ถูกรูปแบบ") from None
    entries = data.get("missing_documents") if isinstance(data, dict) else data
    names: list[str] = []
    for entry in entries if isinstance(entries, list) else []:
        name = entry.get("name") if isinstance(entry, dict) else entry
        if isinstance(name, str) and name.strip():
            names.append(name.strip()[:MAX_MISSING_NAME])
    if not names:
        raise RunFailed(f"Claude แจ้งว่าขาดเอกสาร ({MISSING_DOCUMENTS_FILE}) แต่ไม่ได้ระบุชื่อเอกสาร")
    known = {_document_key(a) for a in acknowledged}
    return [n for n in dict.fromkeys(names) if _document_key(n) not in known][:MAX_MISSING]


def _document_key(name: str) -> str:
    """Claude may name the same document "Datasheet A" in one run and "datasheet a.pdf" in the next."""
    return DOCUMENT_EXTENSION.sub("", name.strip()).strip().casefold()


def _new_run_state(work: Path, skill_version: str) -> dict:
    """A new Claude session for this request, saved so a resume after a pause can continue it."""
    saved = {"sessionId": str(uuid.uuid4()), "skillVersion": skill_version}
    _write_run_state(work, saved)
    return saved


def _read_run_state(work: Path) -> dict:
    try:
        data = json.loads((work / RUN_STATE_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_run_state(work: Path, state: dict) -> None:
    work.mkdir(parents=True, exist_ok=True)
    (work / RUN_STATE_FILE).write_text(json.dumps(state), encoding="utf-8")


def _install_skill(request: dict, server, work: Path) -> tuple[str, str]:
    """Downloads the pinned skill package into .claude/skills/<name>/."""
    skill = request.get("skill")
    if not skill:
        raise RunFailed("server ไม่ได้ส่ง skill มากับคำขอ")
    download = server.download(skill["url"])
    if hashlib.sha256(download.content).hexdigest() != skill.get("checksum"):
        raise RunFailed("ดาวน์โหลด skill ไม่สมบูรณ์ (checksum ไม่ตรง)")
    version = _header(download.headers, "X-Soc-Skill-Version") or skill["version"]
    try:
        archive = zipfile.ZipFile(io.BytesIO(download.content))
    except zipfile.BadZipFile:
        raise RunFailed("ไฟล์ skill จาก server ไม่ใช่ zip ที่ถูกต้อง") from None
    with archive:
        names = [n for n in archive.namelist() if not n.endswith("/")]
        for name in names:
            parts = PurePosixPath(name.replace("\\", "/")).parts
            if name.startswith(("/", "\\")) or ".." in parts or any(":" in part for part in parts):
                raise RunFailed("ไฟล์ skill จาก server มี path ที่ไม่ปลอดภัย")
        skill_mds = [n for n in names if PurePosixPath(n).name == "SKILL.md"]
        if len(skill_mds) != 1:
            raise RunFailed("ไฟล์ skill จาก server ต้องมี SKILL.md หนึ่งไฟล์")
        prefix = str(PurePosixPath(skill_mds[0]).parent)
        prefix = "" if prefix == "." else prefix + "/"
        skill_name = _skill_name(archive.read(skill_mds[0]).decode("utf-8", "replace"))
        target = work / ".claude" / "skills" / skill_name
        for name in names:
            if not name.startswith(prefix):
                continue
            destination = target.joinpath(*PurePosixPath(name[len(prefix):]).parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.read(name))
    return skill_name, version


def _download_documents(request: dict, server, inputs: Path) -> list[tuple[str, str]]:
    inputs.mkdir(parents=True, exist_ok=True)
    saved: list[tuple[str, str]] = []
    used: set[str] = set()
    for document in request.get("documents") or []:
        name = _unique(_safe_path(document["name"], MAX_WINDOWS_PATH - len(str(inputs)) - 1), used)
        download = server.download(document["url"])
        if hashlib.sha256(download.content).hexdigest() != document.get("checksum"):
            raise RunFailed(f"ดาวน์โหลดไฟล์ {name} ไม่สมบูรณ์ (checksum ไม่ตรง)")
        (inputs / name).parent.mkdir(parents=True, exist_ok=True)
        (inputs / name).write_bytes(download.content)
        saved.append((document.get("type", "EVIDENCE"), name))
    if not any(kind == "SOC" for kind, _ in saved):
        raise RunFailed("งานนี้ไม่มีไฟล์ SOC บน server")
    return saved


def _outputs(out_dir: Path, summary: str = "") -> tuple[Path, Path]:
    said = f" Claude ตอบว่า: {summary[:300]}" if summary else ""
    results = out_dir / "results.json"
    if not results.is_file():
        raise RunFailed("Claude ตรวจจบแต่ไม่ได้สร้างไฟล์ results.json." + said)
    soc_check = out_dir / "SOC_Check.docx"
    if not soc_check.is_file():
        candidates = sorted(out_dir.glob("SOC_Check*.docx"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            raise RunFailed("Claude ตรวจจบแต่ไม่ได้สร้างเอกสาร SOC_Check (.docx)." + said)
        soc_check = candidates[0]
    return results, soc_check


def _skill_name(skill_md: str) -> str:
    match = re.search(r"^---\s*\n(.*?)\n---", skill_md, re.S)
    if match:
        name = re.search(r"^name:\s*['\"]?([A-Za-z0-9_-]+)", match.group(1), re.M)
        if name:
            return name.group(1)
    return DEFAULT_SKILL_NAME


def _safe_name(name: str) -> str:
    base = re.split(r"[\\/]", str(name))[-1]
    base = re.sub(r'[<>:"|?*\x00-\x1f]', "_", base).strip(" .")
    if re.fullmatch(r"(CON|PRN|AUX|NUL|COM\d|LPT\d)(\..*)?", base, re.I):
        base = "_" + base  # Windows reserved device names
    return base or "file"


MAX_WINDOWS_PATH = 250  # under Windows' 260, which Python can't pass without LongPathsEnabled


def _safe_path(name: str, room: int = MAX_WINDOWS_PATH) -> str:
    """A document's place under inputs/: the folders it was uploaded with ("2.5 …/1.…/tc22.pdf"),
    because a SOC cites folders, each part made safe, and never "." or ".." to climb out.
    Longer than `room`, it drops the outermost folders first: the nearest ones name the item."""
    parts = [_safe_name(part) for part in re.split(r"[\\/]", str(name)) if part.strip(" .")]
    while len(parts) > 1 and len("/".join(parts)) > room:
        parts.pop(0)
    return "/".join(parts) or "file"


def _unique(name: str, used: set[str]) -> str:
    stem, dot, ext = name.rpartition(".")
    candidate, n = name, 2
    while candidate.lower() in used:
        candidate = f"{stem} ({n}).{ext}" if dot else f"{name} ({n})"
        n += 1
    used.add(candidate.lower())
    return candidate


def _header(headers: dict, name: str) -> str:
    for key, value in (headers or {}).items():
        if key.lower() == name.lower():
            return str(value)
    return ""


# ---------------------------------------------------------------- the loop


class SocRunner:
    def __init__(self, server, claude, work_root: Path, log=print, clock=time.time):
        self.server = server
        self.claude = claude
        self.work_root = Path(work_root)
        self.log = log
        self.clock = clock
        # The Claude quota is the user's: while it is used up no request can run.
        self.paused_until = 0.0
        # After a run found the login expired, `claude auth status` (which only
        # reads the stored login) is not trusted until then.
        self.logged_out_until = 0.0
        self.login_backoff = LOGIN_RECHECK_SECONDS
        self._login: tuple[float, str] | None = None
        self._lock = threading.Lock()  # the heartbeat thread reads the login too

    def claude_login(self) -> str:
        with self._lock:
            now = self.clock()
            if now < self.logged_out_until:
                return "logged_out"
            if self._login is not None and now - self._login[0] < LOGIN_CHECK_SECONDS:
                return self._login[1]
        # Outside the lock: `claude auth status` may take a while, and the other thread must not wait on it.
        state = self.claude.login_state()
        with self._lock:
            self._login = (now, state)
            return "logged_out" if self.clock() < self.logged_out_until else state

    def heartbeat(self) -> None:
        self.server.heartbeat(RUNNER_VERSION, self.claude_login())

    def poll_once(self) -> str | None:
        if self.clock() < self.paused_until or self.claude_login() == "logged_out":
            return None
        request = self.server.claim()
        if not request:
            return None
        self.log(f"รับคำขอ {request['id']}: {request['job'].get('title', '')} ข้อ {request['majorItem']['label']}")
        outcome = carry_out(request, self.server, self.claude, self.work_root, self.log, on_pause=self._pause, clock=self.clock)
        with self._lock:
            if outcome == "needs_login":
                self.logged_out_until = self.clock() + self.login_backoff
                self.login_backoff = min(self.login_backoff * 2, MAX_LOGIN_RECHECK_SECONDS)
                self._login = None
            elif outcome in ("submitted", "rejected", "needs_documents"):
                self.login_backoff = LOGIN_RECHECK_SECONDS  # Claude ran, so the login works
        if outcome == "needs_login":
            self._beat_once()  # tell the web now, not at the next beat
        return outcome

    def _pause(self, resume_at: datetime) -> None:
        self.paused_until = resume_at.timestamp()

    def _beat_once(self) -> None:
        try:
            self.heartbeat()
        except Exception as error:  # the next beat tries again
            self.log(f"ส่ง heartbeat ไม่ได้: {error}")

    def run_forever(self) -> None:
        stop = threading.Event()
        threading.Thread(target=self._beat, args=(stop,), daemon=True).start()
        self.log(f"SOC Runner {RUNNER_VERSION} เริ่มทำงาน รอคำขอตรวจ (กด Ctrl+C เพื่อหยุด)")
        try:
            while True:
                try:
                    outcome = self.poll_once()
                except Unauthorized:
                    self.log("server ไม่รับโทเคนนี้ (ลิงก์ถูกยกเลิกหรือถูกแทนที่) ให้ดาวน์โหลดไฟล์เชื่อมจากหน้า /soc ใหม่")
                    time.sleep(REFUSED_RETRY_SECONDS)
                    continue
                except Forbidden:
                    self.log("บัญชีนี้ไม่มีสิทธิ์ใช้ SOC แล้ว ติดต่อ admin")
                    time.sleep(REFUSED_RETRY_SECONDS)
                    continue
                except NoSkillPackage as error:
                    self.log(str(error))
                    time.sleep(REFUSED_RETRY_SECONDS)
                    continue
                except Exception as error:  # network blips, server errors; keep polling
                    self.log(f"ติดต่อ server ไม่ได้: {type(error).__name__}: {error}")
                    time.sleep(IDLE_POLL_SECONDS)
                    continue
                if outcome is None:
                    time.sleep(IDLE_POLL_SECONDS)
        finally:
            stop.set()

    def _beat(self, stop: threading.Event) -> None:
        # Separate thread: a long Claude run keeps the claim alive (stale after 2 min).
        while not stop.is_set():
            self._beat_once()  # keeps beating through network blips
            stop.wait(HEARTBEAT_SECONDS)


def default_work_root() -> Path:
    override = os.environ.get("SOC_RUNNER_WORK_DIR")
    if override:
        return Path(override)
    base = os.environ.get("LOCALAPPDATA")
    return (Path(base) / "SOCRunner" / "work") if base else Path.home() / ".soc-runner" / "work"


def parse_args(argv: list[str]) -> tuple[Path, Path | None]:
    """`runner.py [config] [--log FILE]`: the config file and the log file, if any."""
    args = list(argv[1:])
    log = None
    if "--log" in args:
        at = args.index("--log")
        log = Path(args[at + 1]) if at + 1 < len(args) else None
        del args[at:at + 2]
    config = Path(args[0]) if args else Path(__file__).with_name("soc-runner.json")
    return config, log


def single_instance(lock_path: Path):
    """An open, locked file while this is the only runner, else None.

    Autostart at login and the install command may both start one; two runners on
    one token would claim requests against each other. Closing the file (or
    the process ending) releases the lock.
    """
    Path(lock_path).parent.mkdir(parents=True, exist_ok=True)
    handle = open(lock_path, "a+b")
    try:
        if os.name == "nt":
            import msvcrt
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


class LogFile:
    """The runner's log, appended to; once it grows past max_bytes it moves to .1
    (one older copy kept), at start and while the runner runs for weeks."""

    def __init__(self, path: Path, max_bytes: int):
        self.path = Path(path)
        self.max_bytes = max_bytes
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()  # the heartbeat thread logs too
        self._stream = self._open()

    def _open(self):
        try:
            if self.path.stat().st_size > self.max_bytes:
                os.replace(self.path, self.path.with_name(self.path.name + ".1"))
        except OSError:
            pass  # not there yet, or held open by another process: keep appending
        return open(self.path, "a", encoding="utf-8", buffering=1)

    def write(self, text: str) -> int:
        with self._lock:
            written = self._stream.write(text)
            if text.endswith("\n") and self._stream.tell() > self.max_bytes:
                self._stream.close()
                self._stream = self._open()
            return written

    def flush(self) -> None:
        with self._lock:
            self._stream.flush()

    def close(self) -> None:
        with self._lock:
            self._stream.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def open_log(path: Path, max_bytes: int = 5 * 1024 * 1024) -> LogFile:
    return LogFile(path, max_bytes)


def _timestamped(message: str) -> None:
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {message}", flush=True)


def main(argv: list[str]) -> int:
    config_path, log_path = parse_args(argv)
    # The lock comes first: a second runner must not touch the first one's log.
    lock = single_instance(config_path.with_name("runner.lock"))
    if lock is None:
        return 0
    if log_path:
        # pythonw has no console (sys.stdout is None): everything goes to the log.
        sys.stdout = sys.stderr = open_log(log_path)
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    try:
        config = load_config(config_path)
    except (OSError, ValueError) as error:
        print(f"อ่านไฟล์เชื่อมไม่ได้: {error}", file=sys.stderr)
        lock.close()
        return 2
    ca_file = os.environ.get("SOC_RUNNER_CA_FILE") or None
    server = HttpServerClient(config.server_url, config.token, ca_file=ca_file, ca_pem=None if ca_file else config.ca_cert or None)
    claude = ClaudeCli(model=os.environ.get("SOC_RUNNER_MODEL", "sonnet"),
                       timeout_seconds=float(os.environ.get("SOC_RUNNER_TIMEOUT_MINUTES", "180")) * 60)
    work_root = default_work_root()
    work_root.mkdir(parents=True, exist_ok=True)
    _timestamped(f"เชื่อมกับ {config.server_url} ในนาม {config.username or '?'} โฟลเดอร์งาน {work_root} Claude: {claude.executable}")
    try:
        SocRunner(server, claude, work_root, log=_timestamped).run_forever()
    except KeyboardInterrupt:
        _timestamped("หยุด SOC Runner แล้ว")
    finally:
        lock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
