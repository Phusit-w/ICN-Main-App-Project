"""SOC Runner: carries out its user's Check Requests on this machine (ADR 0008).

Run from source:

    python soc-runner/runner.py path/to/soc-runner.json [--log runner.log]

The install command (ticket 16, bootstrap.ps1 + install.py) runs it on its own pythonw.exe at
login with `--log`, one copy at a time.

It sends a heartbeat every 30 s, polls the server for the oldest Check Request
of its user, downloads the SOC, the evidence and the pinned skill package,
runs `claude -p` with the skill in full mode on one major item, and submits
results.json and the SOC_Check document (an Excel SOC has no SOC_Check). A
request of kind "tor_judge" (TOR Match 07) instead has Claude judge the TOR
Match lines the server could not settle, with the TOR pages rendered as images
where the TOR is scanned or the page is a picture. A request of kind
"reference_fill" (Proposal ticket 10) has Claude look for the Datasheet pages of
the SOC rows the server's code search left ไม่พบ. It only polls; it opens no port.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath

from claude_cli import NO_WINDOW, ClaudeBusy, ClaudeCancelled, ClaudeCli, ClaudeFailed, ClaudeLoggedOut, ClaudeQuotaExhausted, ClaudeSessionMissing, ClaudeTask
from server_client import Forbidden, HttpServerClient, NoSkillPackage, NotClaimed, ServerError, SubmitRejected, Unauthorized

RUNNER_VERSION = "0.9.0"
CONFIG_FORMAT = "soc-runner-config/1"
HEADLESS_MARKER = "SOC_RUNNER_HEADLESS=1"
DEFAULT_SKILL_NAME = "tor-word-compliance-check"
HEARTBEAT_SECONDS = 30
IDLE_POLL_SECONDS = 15
REFUSED_RETRY_SECONDS = 60  # token refused, no soc access, or no skill on the server
MISSING_DOCUMENTS_FILE = "missing_documents.json"  # written by the skill's headless step 0
PACKET_DIR = "packet"  # under out/: the evidence packet the runner builds before Claude runs (ticket 10)
PACKET_BUILDER = "scripts/build_evidence_packet.py"  # in the skill package
PACKET_TIMEOUT_SECONDS = 20 * 60
PACKET_SWITCH = "SOC_RUNNER_PACKET"  # "0" turns the packet off, e.g. to measure the old flow's quota
RUN_STATE_FILE = "soc-runner-run.json"  # the Claude session of a request, kept for a resume
# Claude always runs in work/current, so every packet run starts with the same system prompt and first
# message and a PC's 2nd item within the hour reads them from the prompt cache (ticket 06). A request's
# own folder, work/<request id>, is moved in for the run and back out after it.
CURRENT_DIR = "current"
REQUEST_MARKER = "soc-runner-request.txt"  # in work/current: the request it belongs to
MOVE_ATTEMPTS = 5  # a file still open (Windows) blocks a move for a moment
MOVE_RETRY_SECONDS = 1
SYSTEM_PROMPT_FILE = "runner-system.md"  # under .claude/ of the work folder
# The skill docs the packet flow reads anyway, loaded as the system prompt instead of with Read.
SYSTEM_PROMPT_DOCS = ("SKILL.md", "HEADLESS.md", "references/evidence-packet.md", "references/tor-decision.md")
REQUEST_FILE = "request.md"  # under out/: the item, rows and files of this request (the prompt itself is fixed)
RESUME_MARGIN_SECONDS = 2 * 60  # after the quota window resets
DEFAULT_PAUSE_SECONDS = 30 * 60  # when the CLI didn't say when the quota comes back
MAX_PAUSE_SECONDS = 7 * 24 * 3600 - 3600  # the server refuses a resume time beyond 7 days
BUSY_RETRIES = 3  # Claude stopped for a reason that passes on its own (ClaudeBusy)
BUSY_RETRY_SECONDS = 60
LOGIN_CHECK_SECONDS = 5 * 60  # `claude auth status` is cached this long
LOGIN_RECHECK_SECONDS = 5 * 60  # after a run found the login expired; doubles each time, up to 30 min
# Short enough that the web stops saying "logged out" soon after the reviewer logs in again.
MAX_LOGIN_RECHECK_SECONDS = 30 * 60
MAX_MISSING = 50  # the server's limits for needs_documents
MAX_MISSING_NAME = 300
DOCUMENT_EXTENSION = re.compile(r"\.(pdf|docx?|xlsx?|pptx?)$", re.I)
# A tor_judge request (TOR Match 07): Claude judges the TOR Match lines the server's compare could not settle.
TOR_JUDGE_KIND = "tor_judge"
TOR_JUDGE_DOC = "references/tor-match-judge.md"  # in the skill package: the judge instructions, Claude's system prompt
TOR_LINES_FILE = "tor-lines.json"  # under out/: the lines to judge
TOR_JUDGE_FILE = "tor-judge.json"  # under out/: Claude's answer, submitted as the results
TOR_PAGES_DIR = "tor-pages"  # under out/: the TOR pages Claude must Read, p<N>.png
TOR_PAGE_DPI = 150
TOR_PAGE_MAX_SIDE = 1568  # pixels; Claude scales a larger image down anyway, at the same token cost
# A reference_fill request (proposal-build 10): Claude looks for the Datasheet page of SOC rows the code search left ไม่พบ.
REFERENCE_FILL_KIND = "reference_fill"
REFERENCE_FILL_DOC = "references/reference-fill.md"  # in the skill package: the instructions, Claude's system prompt
REFERENCE_ROWS_FILE = "reference-rows.json"  # under out/: the rows to find and the Datasheets they may cite
REFERENCE_FILL_FILE = "reference-fill.json"  # under out/: Claude's answer, submitted as the results
# A request id from the server, before it names a folder under work/.
SAFE_REQUEST_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


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


def carry_out(request: dict, server, claude, work_root: Path, log=print, on_pause=None, clock=time.time,
              build_packet=None, move_wait=time.sleep, busy_wait=time.sleep, render_pages=None) -> str:
    """Carries out one claimed Check Request.

    Returns "submitted", "rejected" (the import refused the results and the
    server closed the request), "failed" (reported as failed), "dropped"
    (the request is no longer this runner's, e.g. cancelled or stale),
    "needs_documents" (the SOC cites documents the job doesn't have; no row
    was checked), "paused" (the Claude quota is used up; `on_pause` gets the
    resume time) or "needs_login" (Claude Code must be signed in again).

    The request's folder (work/<request id>) keeps the Claude session id, so a
    paused or logged-out run, or one cut short by a restart, resumes that
    session with the rows it already did when the request comes back. It is
    moved to work/current for the run and back out afterwards, whatever the
    outcome: Claude stores sessions per folder, and one path for every run
    keeps the start of each run the same for the prompt cache (ticket 06).

    Before Claude runs, the skill's packet builder prepares the evidence packet
    in out/packet and the prompt turns the skill's packet flow on. When the
    packet can't be built, the item runs on the old flow and the reason goes
    with the submit (`build_packet(work, skill_dir, soc, label)` returns it).

    A tor_judge request runs `_judge_tor` instead, through the same reports,
    pause, login and failure handling; `render_pages(pdf, pages, folder)`
    renders its TOR page images.
    """
    request_id = request["id"]
    try:
        work = enter_current(Path(work_root), request_id, move_wait)
    except RunFailed as error:
        return _report_failed(server, request_id, str(error), log)
    try:
        return _carry_out(request, server, claude, work, log, on_pause, clock, build_packet or build_evidence_packet, busy_wait,
                          render_pages or render_tor_pages)
    finally:
        # Tried again before the next request and when the runner starts.
        _restore_and_log(Path(work_root), log, move_wait)


def _carry_out(request: dict, server, claude, work: Path, log, on_pause, clock, build_packet, busy_wait, render_pages) -> str:
    request_id = request["id"]
    try:
        needs = request.get("needsRunner")
        if needs and not _version_at_least(RUNNER_VERSION, str(needs)):
            raise RunFailed(f"SOC Runner รุ่น {RUNNER_VERSION} เก่าเกินไปสำหรับงานนี้ (ต้องเป็นรุ่น {needs} ขึ้นไป)"
                            " กรุณาติดตั้ง SOC Runner ใหม่ด้วยคำสั่งติดตั้งจากหน้า SOC แล้วกดตรวจอีกครั้ง")
        server.report(request_id, {"state": "running", "progress": "กำลังดาวน์โหลดไฟล์"})
        skill_name, skill_version = _install_skill(request, server, work)
        if request.get("kind") == TOR_JUDGE_KIND:
            submitted = _judge_tor(request, server, claude, work, log, skill_name, skill_version, busy_wait, render_pages)
        elif request.get("kind") == REFERENCE_FILL_KIND:
            submitted = _fill_references(request, server, claude, work, log, skill_name, skill_version, busy_wait)
        else:
            item = request["majorItem"]
            documents = _download_documents(request, server, work / "inputs")
            needs_soc_check = _needs_soc_check(request)
            out_dir = work / "out"
            saved = _read_run_state(work)
            resume = bool(saved.get("sessionId")) and saved.get("skillVersion") == skill_version
            if not resume:
                # A new skill version since the pause: its earlier output no longer fits.
                shutil.rmtree(out_dir, ignore_errors=True)
                saved = _new_run_state(work, skill_version)
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / MISSING_DOCUMENTS_FILE).unlink(missing_ok=True)
            skill_dir = work / ".claude" / "skills" / skill_name

            def prepare_packet() -> None:
                # A resumed session already knows which flow it is on; the choice is kept with the session.
                if "packetFallback" in saved:
                    return
                server.report(request_id, {"state": "running", "progress": f"กำลังเตรียม evidence packet ข้อ {item['label']}"})
                fallback = build_packet(work, skill_dir, documents, item["label"]) or ""
                # The old flow has no way to show Claude the images of Image Rows.
                if fallback and request.get("imageRows"):
                    raise RunFailed(f"ข้อ {item['label']} มีแถวรูป {request['imageRows']} แถว ซึ่งตรวจได้ด้วย evidence packet เท่านั้น"
                                    f" แต่สร้าง packet ไม่ได้: {fallback}")
                saved["packetFallback"] = fallback
                _write_run_state(work, saved)
                if saved["packetFallback"]:
                    log(f"[{request_id}] ไม่ใช้ evidence packet ใช้ flow เดิม: {saved['packetFallback']}")

            if not resume:
                prepare_packet()
            server.report(request_id, {"state": "running", "progress": f"Claude กำลังตรวจข้อ {item['label']}{' ต่อ' if resume else ''}"})
            log(f"[{request_id}] {'ตรวจต่อ' if resume else 'ตรวจ'}ข้อ {item['label']} ด้วย skill {skill_version}")
            def first_run(note: str = "") -> ClaudeTask:
                """A new session. The packet flow's prompt and system prompt are the same for every item;
                the item itself goes to out/request.md."""
                packet = not saved["packetFallback"]
                system_prompt = None
                if packet:
                    (out_dir / REQUEST_FILE).write_text(build_request_file(request, documents), encoding="utf-8")
                    system_prompt = write_system_prompt(work, skill_dir, skill_name)
                return ClaudeTask(prompt=build_prompt(request, skill_name, documents, packet=packet) + note, cwd=work,
                                  out_dir=out_dir, session_id=saved["sessionId"], system_prompt_file=system_prompt)

            def resumed_run() -> ClaudeTask:
                # The CLI doesn't keep an appended system prompt with the session: a packet session gets the docs again.
                docs = work / ".claude" / SYSTEM_PROMPT_FILE
                return ClaudeTask(prompt=build_resume_prompt(request, needs_soc_check), cwd=work, out_dir=out_dir, session_id=saved["sessionId"],
                                  resume=True, system_prompt_file=docs if not saved["packetFallback"] and docs.is_file() else None)

            task, note, retries = (resumed_run() if resume else first_run()), "", BUSY_RETRIES
            while True:
                try:
                    run = claude.run(task)
                    break
                except ClaudeSessionMissing:
                    if not task.resume:
                        raise
                    # The session was never saved (it stopped at once) or is gone: a new
                    # one, which still finds the rows already written in out/.
                    log(f"[{request_id}] ไม่พบ session เดิมของ Claude เริ่มใหม่โดยใช้ผลระหว่างทางใน out/")
                    saved = _new_run_state(work, skill_version, saved.get("packetFallback"))
                    prepare_packet()
                    note = PARTIAL_OUTPUT_NOTE
                    task = first_run(note)
                except ClaudeBusy as error:
                    if not retries:
                        raise
                    retries -= 1
                    log(f"[{request_id}] Claude ยังไม่พร้อม จะลองใหม่ใน {BUSY_RETRY_SECONDS} วินาที ({error})")
                    server.report(request_id, {"state": "running", "progress": "Claude ยังไม่พร้อม กำลังรอเพื่อลองใหม่"})
                    busy_wait(BUSY_RETRY_SECONDS)
                    if not task.resume:
                        # The CLI may have saved the session before it stopped, and a new run can't take a used id.
                        saved = _new_run_state(work, skill_version, saved.get("packetFallback"))
                        task = first_run(note)
            acknowledged = request.get("acknowledgedMissing") or []
            missing = _missing_documents(out_dir, acknowledged)
            if missing:
                log(f"[{request_id}] ขาดเอกสาร: {', '.join(missing)}")
                server.report(request_id, {"state": "needs_documents", "missingDocuments": missing})
                _discard(work)
                return "needs_documents"
            if (out_dir / MISSING_DOCUMENTS_FILE).is_file() and not (out_dir / "results.json").is_file():
                raise RunFailed(f"Claude หยุดเพราะขาดเอกสารที่ผู้ตรวจรับทราบแล้ว ({', '.join(acknowledged)}) แทนที่จะตรวจต่อ ลองกดตรวจใหม่")
            results, soc_check = _outputs(out_dir, run.summary, needs_soc_check)
            server.report(request_id, {"state": "running", "progress": "กำลังส่งผลตรวจ"})
            submitted = server.submit(request_id, results, soc_check, run.model, skill_version,
                                      packet_fallback=saved.get("packetFallback") or "")
    except NotClaimed:
        log(f"[{request_id}] คำขอนี้ไม่ได้อยู่กับเครื่องนี้แล้ว (ยกเลิกหรือหมดเวลา) ข้ามไป")
        _discard(work)
        return "dropped"
    except ClaudeCancelled:
        # The server closed the request already; nothing to report.
        log(f"[{request_id}] ยกเลิกตรวจแล้ว ทิ้งผลระหว่างทาง")
        _discard(work)
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
    _discard(work)
    return "submitted"


def _judge_tor(request: dict, server, claude, work: Path, log, skill_name: str, skill_version: str, busy_wait, render_pages) -> dict:
    """A tor_judge request: writes the lines to out/tor-lines.json, renders the TOR page of every line
    marked `image` (a scanned TOR, or a picture page) to out/tor-pages/, and has Claude judge each line
    by the skill's judge instructions into out/tor-judge.json, which is submitted. Always a new Claude
    session: the run is short, and a pause or lost login starts it again."""
    request_id = request["id"]
    tor, lines = request.get("tor"), request.get("lines") or []
    if not tor:
        raise RunFailed("TOR ต้นฉบับถูกแทนที่หลังส่งคำขอ กรุณากดส่งให้ Claude ตัดสินใหม่")
    if not lines:
        raise RunFailed("คำขอนี้ไม่มีแถวให้ Claude ตัดสิน")
    skill_dir = work / ".claude" / "skills" / skill_name
    if not (skill_dir / TOR_JUDGE_DOC).is_file():
        raise RunFailed("Skill Package รุ่นนี้ยังไม่มีคำแนะนำการตัดสินผลเทียบ TOR ต้นฉบับ ให้ admin อัปโหลด Skill Package รุ่นใหม่")
    out_dir, inputs = work / "out", work / "inputs"
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)
    inputs.mkdir(parents=True, exist_ok=True)
    pages = sorted({line["torPage"] for line in lines if line.get("image") and line.get("torPage")})
    rendered: set[int] = set()
    if pages:
        server.report(request_id, {"state": "running", "progress": f"กำลังเตรียมภาพหน้า TOR ต้นฉบับ {len(pages)} หน้า"})
        rendered = set(render_pages(_download_tor(tor["document"], server, inputs), pages, out_dir / TOR_PAGES_DIR))
        # Decision 23: such a line must not reach Claude as OCR text alone.
        missing = [page for page in pages if page not in rendered]
        if missing:
            raise RunFailed(f"สร้างภาพหน้า TOR ต้นฉบับหน้า {', '.join(map(str, missing))} ไม่ได้ (PDF มีหน้าไม่ถึง) Claude จึงตัดสินแถวเหล่านั้นไม่ได้")
    entries = []
    for line in lines:
        entry = {key: line.get(key) for key in ("line", "outcome", "item", "socRow", "socText", "torText", "torPage")}
        if line.get("image") and line.get("torPage") in rendered:
            entry["page_image"] = f"out/{TOR_PAGES_DIR}/p{line['torPage']}.png"
        entries.append(entry)
    (out_dir / TOR_LINES_FILE).write_text(json.dumps({"scanned": bool(tor.get("scanned")), "lines": entries}, ensure_ascii=False, indent=1),
                                          encoding="utf-8")
    system_prompt = write_judge_system_prompt(work, skill_dir, skill_name)
    images = sum(1 for entry in entries if "page_image" in entry)
    server.report(request_id, {"state": "running", "progress": f"Claude กำลังตัดสิน {len(entries)} แถว"})
    log(f"[{request_id}] Claude ตัดสินผลเทียบ TOR ต้นฉบับ {len(entries)} แถว (ภาพ {len(rendered)} หน้า) ด้วย skill {skill_version}")
    run = _run_short(request_id, server, claude, work, out_dir, build_judge_prompt(skill_name, len(entries), images), system_prompt, log, busy_wait)
    answer = out_dir / TOR_JUDGE_FILE
    if not answer.is_file():
        said = f" Claude ตอบว่า: {run.summary[:300]}" if run.summary else ""
        raise RunFailed(f"Claude ตัดสินจบแต่ไม่ได้สร้างไฟล์ {TOR_JUDGE_FILE}." + said)
    server.report(request_id, {"state": "running", "progress": "กำลังส่งผลตัดสิน"})
    return server.submit(request_id, answer, None, run.model, skill_version)


def _run_short(request_id: str, server, claude, work: Path, out_dir: Path, prompt: str, system_prompt: Path, log, busy_wait):
    """One new Claude session for a short request (tor_judge, reference_fill): the run is cheap, so a pause or
    lost login starts it again. Waits and retries while Claude is busy."""
    retries = BUSY_RETRIES
    while True:
        try:
            return claude.run(ClaudeTask(prompt=prompt, cwd=work, out_dir=out_dir, session_id=str(uuid.uuid4()), system_prompt_file=system_prompt))
        except ClaudeBusy as error:
            if not retries:
                raise
            retries -= 1
            log(f"[{request_id}] Claude ยังไม่พร้อม จะลองใหม่ใน {BUSY_RETRY_SECONDS} วินาที ({error})")
            server.report(request_id, {"state": "running", "progress": "Claude ยังไม่พร้อม กำลังรอเพื่อลองใหม่"})
            busy_wait(BUSY_RETRY_SECONDS)


def _fill_references(request: dict, server, claude, work: Path, log, skill_name: str, skill_version: str, busy_wait) -> dict:
    """A reference_fill request: downloads the Proposal's Datasheets, writes the rows to find to
    out/reference-rows.json (each Datasheet by its id and its path under inputs/), and has Claude look for the
    page of every row by the skill's reference-fill instructions into out/reference-fill.json, which is
    submitted. Claude only finds pages; it never judges compliance."""
    request_id = request["id"]
    rows, documents = request.get("rows"), request.get("documents") or []
    if rows is None:
        raise RunFailed("ผลกรอกอ้างอิงที่ส่งคำขอไว้ถูกลบแล้ว กรุณากดให้ Claude หาอ้างอิงใหม่")
    if not rows:
        raise RunFailed("คำขอนี้ไม่มีแถวให้ Claude หา")
    if not documents:
        raise RunFailed("Proposal นี้ไม่มี Datasheet ให้ Claude หาอ้างอิง")
    skill_dir = work / ".claude" / "skills" / skill_name
    if not (skill_dir / REFERENCE_FILL_DOC).is_file():
        raise RunFailed("Skill Package รุ่นนี้ยังไม่มีคำแนะนำการหาอ้างอิง ให้ admin อัปโหลด Skill Package รุ่นใหม่")
    out_dir, inputs = work / "out", work / "inputs"
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)
    inputs.mkdir(parents=True, exist_ok=True)
    files, used = [], set()
    for document in documents:
        name = _unique(_safe_path(document["name"], MAX_WINDOWS_PATH - len(str(inputs)) - 1), used)
        download = server.download(document["url"])
        if hashlib.sha256(download.content).hexdigest() != document.get("checksum"):
            raise RunFailed(f"ดาวน์โหลดไฟล์ {name} ไม่สมบูรณ์ (checksum ไม่ตรง)")
        (inputs / name).parent.mkdir(parents=True, exist_ok=True)
        (inputs / name).write_bytes(download.content)
        files.append({"document_id": document["id"], "file": f"inputs/{name}"})
    (out_dir / REFERENCE_ROWS_FILE).write_text(json.dumps({"documents": files, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    system_prompt = write_instructions_system_prompt(work, skill_dir, skill_name, REFERENCE_FILL_DOC, "คำแนะนำการหาอ้างอิง")
    server.report(request_id, {"state": "running", "progress": f"Claude กำลังหาอ้างอิง {len(rows)} แถว"})
    log(f"[{request_id}] Claude หาอ้างอิง {len(rows)} แถวใน Datasheet {len(files)} ไฟล์ ด้วย skill {skill_version}")
    run = _run_short(request_id, server, claude, work, out_dir, build_reference_fill_prompt(skill_name, len(rows), len(files)), system_prompt, log, busy_wait)
    answer = out_dir / REFERENCE_FILL_FILE
    if not answer.is_file():
        said = f" Claude ตอบว่า: {run.summary[:300]}" if run.summary else ""
        raise RunFailed(f"Claude หาจบแต่ไม่ได้สร้างไฟล์ {REFERENCE_FILL_FILE}." + said)
    server.report(request_id, {"state": "running", "progress": "กำลังส่งผลที่หาได้"})
    return server.submit(request_id, answer, None, run.model, skill_version)


def build_reference_fill_prompt(skill_name: str, rows: int, documents: int) -> str:
    """The reference-fill run's prompt; the instructions themselves are the system prompt."""
    return "\n".join([
        HEADLESS_MARKER,
        "",
        f"หาหน้าอ้างอิงใน Datasheet ให้แถว SOC ตามคำแนะนำของ skill `{skill_name}` ที่โหลดไว้ใน system prompt แล้ว ห้ามถามผู้ใช้",
        f"- แถวที่ต้องหา และรายการ Datasheet ({documents} ไฟล์): `out/{REFERENCE_ROWS_FILE}` ({rows} แถว)",
        f"- เขียนผลที่ `out/{REFERENCE_FILL_FILE}` ให้ครบทุกแถวตามเลข `row` ห้ามเพิ่มหรือตัดแถว แถวที่หาไม่เจอให้ส่ง suggestions ว่าง",
        "- หาหน้าเท่านั้น ห้ามตัดสินว่าผ่านหรือไม่ผ่าน TOR และห้ามแก้ไขไฟล์ใน `inputs/`",
    ]) + "\n"


def build_judge_prompt(skill_name: str, lines: int, images: int) -> str:
    """The judge run's prompt; the judge instructions themselves are the system prompt (write_judge_system_prompt)."""
    return "\n".join([
        HEADLESS_MARKER,
        "",
        f"ตัดสินผลเทียบ TOR ต้นฉบับตามคำแนะนำการตัดสินของ skill `{skill_name}` ที่โหลดไว้ใน system prompt แล้ว ห้ามถามผู้ใช้",
        f"- แถวที่ต้องตัดสิน: `out/{TOR_LINES_FILE}` ({lines} แถว)",
        (f"- {images} แถวมี `page_image`: ต้องเปิดไฟล์รูปนั้นด้วย tool Read ก่อนตัดสินแถวนั้นทุกครั้ง"
         " ห้ามตัดสินจากข้อความ OCR อย่างเดียว (หลายแถวใช้รูปเดียวกันได้ เปิดครั้งเดียวพอ)") if images else
        "- ไม่มีแถวที่มี `page_image`: ตัดสินจากข้อความในไฟล์",
        f"- เขียนผลที่ `out/{TOR_JUDGE_FILE}` ให้ครบทุกแถวตามเลข `line` ห้ามเพิ่มหรือตัดแถว",
        "- ห้ามแก้ไขไฟล์ใน `inputs/`",
    ]) + "\n"


def write_judge_system_prompt(work: Path, skill_dir: Path, skill_name: str) -> Path:
    """.claude/runner-system.md of a judge run: the skill's judge instructions."""
    return write_instructions_system_prompt(work, skill_dir, skill_name, TOR_JUDGE_DOC, "คำแนะนำการตัดสินผลเทียบ TOR ต้นฉบับ")


def write_instructions_system_prompt(work: Path, skill_dir: Path, skill_name: str, doc: str, what: str) -> Path:
    """.claude/runner-system.md of a short run: the skill's instructions file `doc`, whole."""
    header = (f"# skill `{skill_name}`: {what} ที่ SOC Runner โหลดไว้ให้แล้ว\n\n"
              f"เนื้อหาของ `.claude/skills/{skill_name}/{doc}` อยู่ด้านล่างครบทั้งไฟล์ ห้ามเปิดไฟล์นี้ด้วย tool Read อีก\n\n")
    path = work / ".claude" / SYSTEM_PROMPT_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header.encode("utf-8") + (skill_dir / doc).read_bytes())
    return path


def render_tor_pages(pdf: Path, pages: list[int], folder: Path) -> list[int]:
    """Renders these 1-based pages of the TOR to folder/p<N>.png, at most TOR_PAGE_MAX_SIDE pixels on the
    long side. Returns the pages rendered; one past the end of the PDF is left out."""
    import pymupdf  # installed into the runner's own Python (requirements.txt)

    folder.mkdir(parents=True, exist_ok=True)
    done: list[int] = []
    try:
        document = pymupdf.open(pdf)
    except Exception as error:
        raise RunFailed(f"เปิด PDF TOR ต้นฉบับไม่ได้: {error}") from None
    with document:
        for number in pages:
            if not 1 <= number <= document.page_count:
                continue
            page = document[number - 1]
            zoom = min(TOR_PAGE_DPI / 72, TOR_PAGE_MAX_SIDE / max(page.rect.width, page.rect.height))
            page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(folder / f"p{number}.png")
            done.append(number)
    return done


def _download_tor(document: dict, server, inputs: Path) -> Path:
    name = _safe_path(_safe_name(document.get("name") or "TOR.pdf"), MAX_WINDOWS_PATH - len(str(inputs)) - 1)
    download = server.download(document["url"])
    if hashlib.sha256(download.content).hexdigest() != document.get("checksum"):
        raise RunFailed(f"ดาวน์โหลด TOR ต้นฉบับ {name} ไม่สมบูรณ์ (checksum ไม่ตรง)")
    path = inputs / name
    path.write_bytes(download.content)
    return path


PARTIAL_OUTPUT_NOTE = ("- `out/` อาจมีผลระหว่างทางจากรอบก่อนที่หยุดไป (เช่น highlights.json) ให้ใช้ต่อได้"
                       " ไม่ต้องทำซ้ำส่วนที่ถูกต้องแล้ว\n")


def build_resume_prompt(request: dict, needs_soc_check: bool = True) -> str:
    """Continues the Claude session a quota pause or an expired login cut short.
    `needs_soc_check` false: the SOC is an Excel workbook, which gets no SOC_Check document."""
    item = request["majorItem"]
    acknowledged = json.dumps(request.get("acknowledgedMissing") or [], ensure_ascii=False)
    lines = [
        HEADLESS_MARKER,
        "",
        f"การตรวจข้อใหญ่ {item['label']} ถูกหยุดไว้ (โควตา Claude หมดหรือต้องเข้าสู่ระบบใหม่) ตอนนี้ใช้งานได้แล้ว"
        " ให้ตรวจต่อจากที่ค้างไว้ในการสนทนานี้ ใช้ skill ไฟล์ และผลระหว่างทางใน `out/` ชุดเดิม ห้ามตรวจแถวที่ตรวจเสร็จแล้วซ้ำ ห้ามถามผู้ใช้",
        "- เมื่อเสร็จให้เขียน `out/results.json`" + (" และ `out/SOC_Check.docx`" if needs_soc_check else "") + " ให้ครบทุกแถว"
        + ("ที่ขอตรวจใหม่" if request.get("rows") else "ของข้อใหญ่นี้") + " (รวมแถวที่ตรวจไว้ก่อนหยุด)",
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


def rows_scope(rows: list[dict]) -> str:
    """A re-check of rows the reviewer picked on the review page: only these, by the SOC table's row."""
    listed = ", ".join(f"row {r['row']} (ข้อ {r['item']})" for r in rows)
    return (f"- ตรวจใหม่เฉพาะ {len(rows)} แถวที่ผู้ตรวจเลือก: {listed} ไม่ต้องตรวจแถวอื่นของข้อใหญ่นี้"
            " results.json ให้มีเฉพาะแถวเหล่านี้ (เลข row ตามตาราง SOC เดิม)")


def _request_lines(request: dict, documents: list[tuple[str, str]]) -> list[str]:
    """What this request asks for: the files, the item and its rows. In the old flow's prompt, or in out/request.md."""
    item = request["majorItem"]
    rows = request.get("rows") or []
    soc = [name for kind, name in documents if kind == "SOC"]
    evidence = [name for kind, name in documents if kind != "SOC"]
    return [
        f"- ไฟล์ SOC: {', '.join(f'`inputs/{n}`' for n in soc) or '(ไม่มี)'}",
        f"- ไฟล์หลักฐาน: {', '.join(f'`inputs/{n}`' for n in evidence) or '(ไม่มี)'}",
        f"- ตรวจเฉพาะข้อใหญ่ {item['label']} \"{item.get('title') or ''}\" {item_scope(item)}"
        + ("" if rows else " ทุกแถวใน results ต้องอยู่ในข้อใหญ่นี้"),
        *([rows_scope(rows)] if rows else []),
    ]


def _acknowledged_line(request: dict) -> str:
    return f"- acknowledged_missing: {json.dumps(request.get('acknowledgedMissing') or [], ensure_ascii=False)}"


def _needs_soc_check(request: dict) -> bool:
    """Whether the run must come with a SOC_Check document. The server says no for an Excel SOC, which
    the skill writes none for (it knows the SOC's kind from the file's content, not its name)."""
    return request.get("socCheck") is not False


def _output_line(request: dict) -> str:
    """Where the results go."""
    soc_check = " และเอกสาร `out/SOC_Check.docx`" if _needs_soc_check(request) else " (SOC เป็น Excel: ไม่ต้องสร้างเอกสาร SOC_Check)"
    return ("- โฟลเดอร์ output: `out/` ให้เขียนผลเป็น `out/results.json`" + soc_check
            + " ไฟล์ระหว่างทาง (เช่น highlights.json) ก็เก็บใน `out/`")


def _version_at_least(version: str, needed: str) -> bool:
    """"0.5.0" against "0.4.2": the numbers between the dots, compared in order."""
    def numbers(text: str) -> list[int]:
        return [int(part) if part.isdigit() else 0 for part in text.split(".")]
    have, want = numbers(version), numbers(needed)
    width = max(len(have), len(want))
    return have + [0] * (width - len(have)) >= want + [0] * (width - len(want))


def build_prompt(request: dict, skill_name: str, documents: list[tuple[str, str]], packet: bool = False) -> str:
    """`packet`: the runner built the evidence packet in out/packet, so the skill's packet flow is on.

    The packet prompt is the same for every request on a Word SOC, and for every request on an Excel SOC
    (the item is in out/request.md, `build_request_file`), and the skill docs are in the system prompt
    (`write_system_prompt`), so it is cached across runs."""
    if packet:
        lines = [
            HEADLESS_MARKER,
            "",
            f"ใช้ skill `{skill_name}` ที่อยู่ใน `.claude/skills/{skill_name}/` ของโฟลเดอร์นี้เท่านั้น"
            " (ห้ามใช้ skill ชื่อเดียวกันจากที่อื่น) เอกสารของ skill ที่ system prompt บอกว่าโหลดไว้แล้วห้ามเปิดอ่านซ้ำ",
            "ตรวจ SOC ในโหมด full_audit พร้อม option evidence_support, tor_decision และ evidence_packet ห้ามถามผู้ใช้",
            f"อ่าน `out/{REQUEST_FILE}` ก่อนเริ่ม: ไฟล์ SOC ไฟล์หลักฐาน ข้อใหญ่และแถวที่ต้องตรวจ และ acknowledged_missing"
            " ของงานนี้อยู่ในไฟล์นั้น",
            "",
            f"- packet: สร้างไว้แล้วที่ `out/{PACKET_DIR}` จากโฟลเดอร์งาน `inputs` ใช้ packet นี้ ไม่ต้องสร้างใหม่",
            _output_line(request),
            "- ห้ามแก้ไขไฟล์ใน `inputs/`",
        ]
        return "\n".join(lines) + "\n"
    lines = [
        HEADLESS_MARKER,
        "",
        f"ใช้ skill `{skill_name}` ที่อยู่ใน `.claude/skills/{skill_name}/SKILL.md` ของโฟลเดอร์นี้เท่านั้น"
        " (ห้ามใช้ skill ชื่อเดียวกันจากที่อื่น) อ่าน HEADLESS.md ข้าง SKILL.md ก่อนเริ่ม",
        "ตรวจ SOC ในโหมด full_audit พร้อม option evidence_support และ tor_decision ห้ามถามผู้ใช้",
        "",
        *_request_lines(request, documents),
        _output_line(request),
        _acknowledged_line(request),
        "- ห้ามแก้ไขไฟล์ใน `inputs/`",
    ]
    return "\n".join(lines) + "\n"


def build_request_file(request: dict, documents: list[tuple[str, str]]) -> str:
    """out/request.md of a packet run: the lines the old flow's prompt carries about the request."""
    lines = ["# งานตรวจนี้", "", *_request_lines(request, documents), _acknowledged_line(request)]
    return "\n".join(lines) + "\n"


def write_system_prompt(work: Path, skill_dir: Path, skill_name: str) -> Path:
    """.claude/runner-system.md: the packet flow's skill docs, appended to Claude Code's system prompt.
    Byte for byte the same for one skill version, whatever the item."""
    docs = [name for name in SYSTEM_PROMPT_DOCS if (skill_dir / name).is_file()]
    header = "\n".join([
        f"# skill `{skill_name}`: เอกสารที่ SOC Runner โหลดไว้ให้แล้ว",
        "",
        f"ไฟล์ต่อไปนี้ของ `.claude/skills/{skill_name}/` อยู่ด้านล่างครบทั้งไฟล์: {', '.join(docs)}",
        "ถือว่าอ่านแล้ว ห้ามเปิดไฟล์เหล่านี้ด้วย tool Read อีก ที่ HEADLESS.md หรือ SKILL.md บอกให้อ่านไฟล์เหล่านี้"
        " หมายถึงเนื้อหาด้านล่าง ไฟล์อื่นของ skill เปิดได้ตามที่ HEADLESS.md อนุญาต",
    ]) + "\n"
    parts = [header.encode("utf-8")]
    for name in docs:
        parts.append(f"\n\n===== `.claude/skills/{skill_name}/{name}` =====\n\n".encode("utf-8"))
        parts.append((skill_dir / name).read_bytes())
    path = work / ".claude" / SYSTEM_PROMPT_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"".join(parts))
    return path


def enter_current(work_root: Path, request_id: str, wait=time.sleep) -> Path:
    """Moves the request's folder (or a new one) to work/current for the run. RunFailed when it can't."""
    restore_current(work_root, wait)  # a run cut short left its folder there
    current = work_root / CURRENT_DIR
    home = work_root / _safe_name(request_id)
    try:
        home.mkdir(parents=True, exist_ok=True)
        # Before the move: a folder in current without its marker would be thrown away.
        (home / REQUEST_MARKER).write_text(request_id, encoding="utf-8")
    except OSError as error:
        raise RunFailed(f"เตรียมโฟลเดอร์งาน {home} ไม่ได้: {error}") from None
    _move(home, current, wait)
    return current


def restore_current(work_root: Path, wait=time.sleep) -> None:
    """Moves work/current back to its request's folder; one without a request marker is removed."""
    current = Path(work_root) / CURRENT_DIR
    if not current.exists():
        return
    try:
        request_id = (current / REQUEST_MARKER).read_text(encoding="utf-8").strip()
    except OSError:
        request_id = ""
    if not request_id:
        # A finished request's folder that couldn't all be deleted: out of the way, then gone if it can be.
        trash = Path(work_root) / f"trash-{uuid.uuid4().hex[:8]}"
        _move(current, trash, wait)
        shutil.rmtree(trash, ignore_errors=True)
        return
    home = Path(work_root) / _safe_name(request_id)
    if home.exists():
        shutil.rmtree(home, ignore_errors=True)  # the folder in current is the newer one
    _move(current, home, wait)


def _restore_and_log(work_root: Path, log, wait=time.sleep) -> None:
    try:
        restore_current(work_root, wait)
    except RunFailed as error:
        log(str(error))


def _discard(work: Path) -> None:
    """The request is finished: its folder goes. The marker first, so what a locked file keeps is not moved back."""
    (work / REQUEST_MARKER).unlink(missing_ok=True)
    shutil.rmtree(work, ignore_errors=True)


def _move(source: Path, target: Path, wait) -> None:
    for attempt in range(MOVE_ATTEMPTS):
        try:
            os.replace(source, target)
            return
        except OSError as error:
            if attempt == MOVE_ATTEMPTS - 1:
                raise RunFailed(f"ย้ายโฟลเดอร์งาน {source.name} ไป {target.name} ไม่ได้ (มีไฟล์เปิดค้างอยู่?): {error}") from None
            wait(MOVE_RETRY_SECONDS)


def build_evidence_packet(work: Path, skill_dir: Path, documents: list[tuple[str, str]], label: str,
                          env: dict | None = None, timeout: float = PACKET_TIMEOUT_SECONDS) -> str:
    """Runs the skill's packet builder into out/packet. Returns "" when the packet is ready,
    else the Thai reason the item runs on the old flow instead (the skill falls back the same way)."""
    env = dict(os.environ if env is None else env)
    if env.get(PACKET_SWITCH, "").strip() == "0":
        return f"ปิด evidence packet ไว้ ({PACKET_SWITCH}=0)"
    builder = skill_dir / PACKET_BUILDER
    if not builder.is_file():
        return "skill รุ่นนี้ไม่มีตัวสร้าง evidence packet"
    socs = [name for kind, name in documents if kind == "SOC"]
    if len(socs) != 1:
        return f"งานนี้มีไฟล์ SOC {len(socs)} ไฟล์ packet ใช้ได้กับ SOC ไฟล์เดียว"
    if not socs[0].lower().endswith((".docx", ".xlsx")):
        return "packet ใช้ได้กับ SOC แบบ Word .docx หรือ Excel .xlsx เท่านั้น"
    packet = work / "out" / PACKET_DIR
    shutil.rmtree(packet, ignore_errors=True)
    # pythonw (the installed runner) has no stdout, so the builder runs on the python.exe beside it.
    console = Path(sys.executable).with_name("python.exe")
    python = str(console) if os.name == "nt" and console.is_file() else sys.executable
    argv = [python, str(builder), str(Path("inputs") / socs[0]), label, "inputs", str(Path("out") / PACKET_DIR)]
    try:
        done = subprocess.run(argv, cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=timeout, env={**env, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
                              creationflags=NO_WINDOW)
    except subprocess.TimeoutExpired:
        reason = f"สร้าง evidence packet นานเกิน {int(timeout // 60)} นาที"
    except OSError as error:
        reason = f"เรียกตัวสร้าง evidence packet ไม่ได้ ({error})"
    else:
        if done.returncode == 0 and (packet / "job.json").is_file():
            return ""
        lines = [line for line in (done.stderr or done.stdout or "").strip().splitlines() if line.strip()]
        reason = f"สร้าง evidence packet ไม่สำเร็จ (exit {done.returncode}): {lines[-1].strip() if lines else ''}".strip()
    shutil.rmtree(packet, ignore_errors=True)  # half a packet must not reach Claude
    return reason[:300]


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


def _new_run_state(work: Path, skill_version: str, packet_fallback: str | None = None) -> dict:
    """A new Claude session for this request, saved so a resume after a pause can continue it.
    `packetFallback` ("" = packet flow, else why not) is set once the packet step has run."""
    saved = {"sessionId": str(uuid.uuid4()), "skillVersion": skill_version}
    if packet_fallback is not None:
        saved["packetFallback"] = packet_fallback
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


def _outputs(out_dir: Path, summary: str = "", needs_soc_check: bool = True) -> tuple[Path, Path | None]:
    """The run's results.json and SOC_Check document; no SOC_Check when `needs_soc_check` is false (an Excel SOC)."""
    said = f" Claude ตอบว่า: {summary[:300]}" if summary else ""
    results = out_dir / "results.json"
    if not results.is_file():
        raise RunFailed("Claude ตรวจจบแต่ไม่ได้สร้างไฟล์ results.json." + said)
    if not needs_soc_check:
        return results, None
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
        self.current_request_id: str | None = None  # the request being carried out, for ยกเลิกตรวจ

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
        paused_until = self.paused_until
        reply = self.server.heartbeat(RUNNER_VERSION, self.claude_login())
        # ตรวจต่อเลย on the web: none of the user's requests waits for the quota any more. Only a pause
        # that was already set when this beat left: the server may not have had a newer one yet.
        if (isinstance(reply, dict) and reply.get("quotaPaused") is False
                and self.clock() < paused_until == self.paused_until):
            self.paused_until = 0.0
            self.log("ไม่มีคำขอที่รอโควตาแล้ว (ตรวจต่อเลยหรือยกเลิกจากหน้าเว็บ) เลิกรอโควตา")
        cancelled = reply.get("cancelled") if isinstance(reply, dict) else None
        for request_id in cancelled if isinstance(cancelled, list) else []:
            self._forget_cancelled(request_id)

    def _forget_cancelled(self, request_id) -> None:
        """ยกเลิกตรวจ on the web: stop Claude if this is the request it checks, or drop the folder a
        paused request kept. The server repeats the id for an hour, so a cancel that came just
        before Claude started is caught at the next beat."""
        if not isinstance(request_id, str) or not SAFE_REQUEST_ID.fullmatch(request_id) or request_id == CURRENT_DIR:
            return
        with self._lock:
            current = self.current_request_id == request_id
        if current:
            if self.claude.cancel():
                self.log(f"[{request_id}] ยกเลิกตรวจจากหน้าเว็บ หยุด Claude แล้ว")
            return
        folder = self.work_root / request_id
        if folder.is_dir():
            _discard(folder)
            self.log(f"[{request_id}] ยกเลิกตรวจจากหน้าเว็บ ลบผลระหว่างทางที่เก็บไว้แล้ว")

    def poll_once(self) -> str | None:
        if self.clock() < self.paused_until or self.claude_login() == "logged_out":
            return None
        request = self.server.claim()
        if not request:
            return None
        what = {TOR_JUDGE_KIND: "ผลเทียบ TOR ต้นฉบับ", REFERENCE_FILL_KIND: "กรอกอ้างอิง"}.get(request.get("kind")) or f"ข้อ {request['majorItem']['label']}"
        self.log(f"รับคำขอ {request['id']}: {request['job'].get('title', '')} {what}")
        with self._lock:
            self.current_request_id = request["id"]
        try:
            outcome = carry_out(request, self.server, self.claude, self.work_root, self.log, on_pause=self._pause, clock=self.clock)
        finally:
            with self._lock:
                self.current_request_id = None
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

    def restore_leftover(self) -> None:
        """A runner killed mid-run left a request's folder in work/current: back to its own folder."""
        _restore_and_log(self.work_root, self.log)

    def _pause(self, resume_at: datetime) -> None:
        self.paused_until = resume_at.timestamp()

    def _beat_once(self) -> None:
        try:
            self.heartbeat()
        except Exception as error:  # the next beat tries again
            self.log(f"ส่ง heartbeat ไม่ได้: {error}")

    def run_forever(self) -> None:
        self.restore_leftover()
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
