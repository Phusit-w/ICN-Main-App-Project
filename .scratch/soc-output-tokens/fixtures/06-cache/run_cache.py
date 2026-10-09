"""Ticket 06 gate: one MOF_RFID major item through the real `runner.carry_out` and `ClaudeCli`, served by a
local stand-in for the server (compact3 package). Run twice on the same work root, < 1 h apart:

    python run_cache.py C:/Phusit/s06 g55               # ๕.๕ original
    python run_cache.py C:/Phusit/s06 g58 --item ๕.๘ --r1

Claude runs in <root>/current like on a reviewer's PC. The submit keeps out/ and the session log in
<root>/keep-<label>/. Prints the first turns' cache read/write, the run's units (cost_breakdown's weights),
the skill docs Claude Read (must be none of the four in the system prompt), packet pages never Read,
the validator's last output and the watched rows.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
EVIDENCE = REPO / ".scratch/soc-evidence-packet/fixtures"
sys.path.insert(0, str(REPO / "soc-runner"))
sys.path.insert(0, str(EVIDENCE / "07-packet-run"))
sys.path.insert(0, str(EVIDENCE / "11-slim"))
import runner  # noqa: E402
from claude_cli import ClaudeCli, ClaudeFailed  # noqa: E402
from run_5_5 import JOB, NOT_JOB_INPUTS, R1_SOC, SOC_FOLDER, WATCHED_ROWS, summary  # noqa: E402
from run_runner import TITLES, measure  # noqa: E402

SERVED = HERE.parent / "05-spike/served-2026-10-09-compact3.zip"
WATCHED_ROWS["๕.๘"] = {171: "171 → p.43", 172: "172 → p.47/54", **WATCHED_ROWS["๕.๘"]}  # the 03 gate's ๕.๘ R1 key
SYSTEM_DOCS = {f"tor-word-compliance-check/{name}" for name in runner.SYSTEM_PROMPT_DOCS}


class Download:
    def __init__(self, content: bytes, headers: dict | None = None):
        self.content, self.headers = content, headers or {}


class LocalServer:
    """Serves the package and the job's files like the runner API; keeps what the submit sends."""

    def __init__(self, files: dict[str, bytes], keep: Path):
        self.files, self.keep = files, keep

    def download(self, url: str) -> Download:
        return Download(self.files[url], {"X-Soc-Skill-Version": SERVED.stem} if url == "skill" else None)

    def report(self, request_id: str, payload: dict) -> None:
        print("report:", json.dumps(payload, ensure_ascii=False))

    def submit(self, request_id, results: Path, soc_check: Path, model, skill_version, packet_fallback="") -> dict:
        shutil.copytree(results.parent, self.keep / "out")
        print("submit:", model, skill_version, "packetFallback:", packet_fallback or "(none)")
        return {"rowCount": len(json.loads(results.read_text(encoding="utf-8")).get("results", []))}


def job_files(r1: bool) -> list[tuple[str, str, Path]]:
    """(type, name under inputs/, source) for every file of the job, the way the web uploads them."""
    files = []
    for path in sorted(JOB.rglob("*")):
        name = path.relative_to(JOB).as_posix()
        if not path.is_file() or name.split("/")[0] in NOT_JOB_INPUTS or not runner.DOCUMENT_EXTENSION.search(path.name):
            continue
        is_soc = name.startswith(SOC_FOLDER + "/")
        if r1 and is_soc:
            continue
        files.append(("SOC" if is_soc and path.suffix.lower() == ".docx" else "EVIDENCE", name, path))
    if r1:
        original = next((JOB / SOC_FOLDER).glob("*.docx")).name.removesuffix(".docx")
        files.append(("SOC", f"{SOC_FOLDER}/{original}_R1.docx", R1_SOC))
    return files


def first_turns(log: Path, count: int = 3) -> list[dict]:
    turns, seen = [], set()
    for line in log.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        message = event.get("message") or {}
        if event.get("type") != "assistant" or message.get("id") in seen:
            continue
        seen.add(message.get("id"))
        usage = message.get("usage") or {}
        turns.append({"read": usage.get("cache_read_input_tokens", 0), "write": usage.get("cache_creation_input_tokens", 0)})
        if len(turns) == count:
            break
    return turns


def units(log: Path) -> dict:
    """The meter of fixtures/03-gate (cost_breakdown.py): largest usage per message id, weighted."""
    messages = {}
    for line in log.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        message = event.get("message") or {}
        if event.get("type") == "assistant":
            current = messages.setdefault(message.get("id"), {})
            for key, value in (message.get("usage") or {}).items():
                if isinstance(value, int):
                    current[key] = max(current.get(key, 0), value)
    total = {key: sum(m.get(key, 0) for m in messages.values())
             for key in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens")}
    total["units"] = round(total["cache_read_input_tokens"] * 0.1 + total["cache_creation_input_tokens"] * 1.25
                           + total["input_tokens"] + total["output_tokens"] * 5)
    return total


def validator_output(log: Path) -> str:
    calls, last = set(), ""
    for line in log.read_text(encoding="utf-8").splitlines():
        message = json.loads(line).get("message") or {}
        for block in message.get("content") or [] if isinstance(message.get("content"), list) else []:
            if block.get("type") == "tool_use" and "validate_audit_consistency" in json.dumps(block.get("input")):
                calls.add(block["id"])
            if block.get("type") == "tool_result" and block.get("tool_use_id") in calls:
                body = block["content"]
                last = body if isinstance(body, str) else "".join(part.get("text", "") for part in body)
    return last


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("label")
    parser.add_argument("--item", default="๕.๕")
    parser.add_argument("--r1", action="store_true")
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--dry", action="store_true", help="stop where Claude would start (no quota)")
    args = parser.parse_args()
    root = args.root.resolve()
    keep = root / f"keep-{args.label}"
    if keep.exists():
        raise SystemExit(f"{keep} exists: give a new label")
    keep.mkdir(parents=True)

    package = SERVED.read_bytes()
    files = {"skill": package}
    documents = []
    for index, (kind, name, source) in enumerate(job_files(args.r1)):
        data = source.read_bytes()
        files[f"d{index}"] = data
        documents.append({"id": f"d{index}", "type": kind, "name": name, "checksum": hashlib.sha256(data).hexdigest(),
                          "url": f"d{index}"})
    request = {"id": f"gate-{args.label}", "job": {"title": "MOF_RFID"}, "acknowledgedMissing": [],
               "majorItem": {"label": args.item, "key": args.item, "title": TITLES.get(args.item, "")},
               "skill": {"version": SERVED.stem, "checksum": hashlib.sha256(package).hexdigest(), "url": "skill"},
               "documents": documents}

    claude = ClaudeCli(model=args.model, timeout_seconds=3 * 3600)
    tasks = []
    real_run = claude.run
    if args.dry:
        def real_run(task):
            raise ClaudeFailed("dry run")

    def run(task):
        tasks.append(task)
        if (task.out_dir / runner.REQUEST_FILE).is_file():
            shutil.copy2(task.out_dir / runner.REQUEST_FILE, keep)
        if task.system_prompt_file:
            shutil.copy2(task.system_prompt_file, keep)
        (keep / "prompt.txt").write_text(task.prompt, encoding="utf-8")
        return real_run(task)
    claude.run = run

    outcome = runner.carry_out(request, LocalServer(files, keep), claude, root, log=print)
    print("outcome:", outcome)
    if not tasks or args.dry:
        return
    project = Path.home() / ".claude/projects" / re.sub(r"[^A-Za-z0-9]", "-", str(root / runner.CURRENT_DIR))
    log = project / f"{tasks[-1].session_id}.jsonl"
    shutil.copy2(log, keep / "session.jsonl")
    stats = {"first_turns": first_turns(log), "meter": units(log), **measure(log)}
    stats["system_docs_read"] = sorted(set(stats["skill_docs_read"]) & SYSTEM_DOCS)
    stats["auto_memory_folder"] = (project / "memory").exists()  # must stay False (CLAUDE_CODE_DISABLE_AUTO_MEMORY)
    (keep / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print("validator:", validator_output(log)[-600:])
    if (keep / "out/packet/job.json").is_file():
        checker = keep / "check_page_reads.py"
        with zipfile.ZipFile(SERVED) as archive:
            checker.write_bytes(archive.read("tor-word-compliance-check/scripts/check_page_reads.py"))
        subprocess.run([sys.executable, str(checker), str(keep / "out/packet"), str(log)])
    if (keep / "out/results.json").is_file():
        summary(keep, args.item)


if __name__ == "__main__":
    main()
