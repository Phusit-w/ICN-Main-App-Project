"""SOC Runner: carries out its user's Check Requests on this machine (ADR 0008).

Run from source (until the installer, ticket 16):

    python soc-runner/runner.py path/to/soc-runner.json

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
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath

from claude_cli import ClaudeCli, ClaudeFailed, ClaudeTask
from server_client import Forbidden, HttpServerClient, NoSkillPackage, NotClaimed, ServerError, SubmitRejected, Unauthorized

RUNNER_VERSION = "0.1.0"
CONFIG_FORMAT = "soc-runner-config/1"
HEADLESS_MARKER = "SOC_RUNNER_HEADLESS=1"
DEFAULT_SKILL_NAME = "tor-word-compliance-check"
HEARTBEAT_SECONDS = 30
IDLE_POLL_SECONDS = 15
REFUSED_RETRY_SECONDS = 60  # token refused, no soc access, or no skill on the server


class RunFailed(Exception):
    """A Thai reason the request failed for, reported to the server as `failed`."""


@dataclass
class Config:
    server_url: str
    token: str
    username: str = ""


def load_config(path: Path) -> Config:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("format") != CONFIG_FORMAT:
        raise ValueError(f"{path} ไม่ใช่ไฟล์เชื่อม SOC Runner ({CONFIG_FORMAT})")
    server_url, token = data.get("serverUrl"), data.get("token")
    if not isinstance(server_url, str) or not server_url.startswith(("http://", "https://")):
        raise ValueError(f"{path} ไม่มี serverUrl")
    if not isinstance(token, str) or not token.startswith("socr_"):
        raise ValueError(f"{path} ไม่มีโทเคน ให้ดาวน์โหลดไฟล์เชื่อมจากหน้า /soc ใหม่")
    return Config(server_url.rstrip("/"), token, str(data.get("username") or ""))


# ---------------------------------------------------------------- one request


def carry_out(request: dict, server, claude, work_root: Path, log=print) -> str:
    """Carries out one claimed Check Request.

    Returns "submitted", "rejected" (the import refused the results and the
    server closed the request), "failed" (reported as failed) or "dropped"
    (the request is no longer this runner's, e.g. cancelled or stale).
    """
    request_id = request["id"]
    item = request["majorItem"]
    work = Path(work_root) / f"{datetime.now():%Y%m%d-%H%M%S}-{_safe_name(request_id)}"
    try:
        server.report(request_id, {"state": "running", "progress": "กำลังดาวน์โหลดไฟล์"})
        skill_name, skill_version = _install_skill(request, server, work)
        documents = _download_documents(request, server, work / "inputs")
        out_dir = work / "out"
        out_dir.mkdir(parents=True, exist_ok=True)
        server.report(request_id, {"state": "running", "progress": f"Claude กำลังตรวจข้อ {item['label']}"})
        log(f"[{request_id}] ตรวจข้อ {item['label']} ด้วย skill {skill_version}")
        run = claude.run(ClaudeTask(prompt=build_prompt(request, skill_name, documents), cwd=work, out_dir=out_dir))
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
        f"- ตรวจเฉพาะข้อใหญ่ {item['label']} (เลขข้อขึ้นต้นด้วย {item['label']} หรือ {item['key']}) "
        f"\"{item.get('title') or ''}\" ทุกแถวใน results ต้องอยู่ในข้อใหญ่นี้",
        "- โฟลเดอร์ output: `out/` ให้เขียนผลเป็น `out/results.json` และเอกสาร `out/SOC_Check.docx`"
        " ไฟล์ระหว่างทาง (เช่น highlights.json) ก็เก็บใน `out/`",
        f"- acknowledged_missing: {acknowledged}",
        "- ห้ามแก้ไขไฟล์ใน `inputs/`",
    ]
    return "\n".join(lines) + "\n"


def _report_failed(server, request_id: str, reason: str, log) -> str:
    log(f"[{request_id}] ตรวจไม่สำเร็จ: {reason}")
    try:
        server.report(request_id, {"state": "failed", "reason": reason[:500]})
    except NotClaimed:
        return "dropped"
    except ServerError as error:
        # The claim goes stale and returns to `requested` on its own.
        log(f"[{request_id}] รายงานผลล้มเหลวไม่ได้: {error}")
    return "failed"


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
        name = _unique(_safe_name(document["name"]), used)
        download = server.download(document["url"])
        if hashlib.sha256(download.content).hexdigest() != document.get("checksum"):
            raise RunFailed(f"ดาวน์โหลดไฟล์ {name} ไม่สมบูรณ์ (checksum ไม่ตรง)")
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
    def __init__(self, server, claude, work_root: Path, log=print):
        self.server = server
        self.claude = claude
        self.work_root = Path(work_root)
        self.log = log

    def heartbeat(self) -> None:
        # The Claude login state is detected in ticket 15; until then "unknown".
        self.server.heartbeat(RUNNER_VERSION, "unknown")

    def poll_once(self) -> str | None:
        request = self.server.claim()
        if not request:
            return None
        self.log(f"รับคำขอ {request['id']}: {request['job'].get('title', '')} ข้อ {request['majorItem']['label']}")
        return carry_out(request, self.server, self.claude, self.work_root, self.log)

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
            try:
                self.heartbeat()
            except Exception as error:  # keep beating through network blips
                self.log(f"ส่ง heartbeat ไม่ได้: {error}")
            stop.wait(HEARTBEAT_SECONDS)


def default_work_root() -> Path:
    override = os.environ.get("SOC_RUNNER_WORK_DIR")
    if override:
        return Path(override)
    base = os.environ.get("LOCALAPPDATA")
    return (Path(base) / "SOCRunner" / "work") if base else Path.home() / ".soc-runner" / "work"


def main(argv: list[str]) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    config_path = Path(argv[1]) if len(argv) > 1 else Path(__file__).with_name("soc-runner.json")
    try:
        config = load_config(config_path)
    except (OSError, ValueError) as error:
        print(f"อ่านไฟล์เชื่อมไม่ได้: {error}", file=sys.stderr)
        return 2
    server = HttpServerClient(config.server_url, config.token, ca_file=os.environ.get("SOC_RUNNER_CA_FILE") or None)
    claude = ClaudeCli(model=os.environ.get("SOC_RUNNER_MODEL", "sonnet"),
                       timeout_seconds=float(os.environ.get("SOC_RUNNER_TIMEOUT_MINUTES", "180")) * 60)
    work_root = default_work_root()
    work_root.mkdir(parents=True, exist_ok=True)
    print(f"เชื่อมกับ {config.server_url} ในนาม {config.username or '?'} โฟลเดอร์งาน {work_root}")
    try:
        SocRunner(server, claude, work_root).run_forever()
    except KeyboardInterrupt:
        print("หยุด SOC Runner แล้ว")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
