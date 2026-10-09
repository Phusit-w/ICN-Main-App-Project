"""Ticket 03 gate: ../../../soc-evidence-packet/fixtures/11-slim/run_runner.py on the compact2 package.
    python run_gate.py <short work dir> [--item ๕.๘ --r1] [--no-packet]
Afterwards prints the meter (cost_breakdown.py) and how many characters Claude wrote for the results.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SLIM = HERE.parents[2] / "soc-evidence-packet/fixtures/11-slim"
sys.path.insert(0, str(SLIM))
import run_runner  # noqa: E402

run_runner.SERVED = HERE / "served-2026-10-09-compact2.zip"


def written_chars(log: Path) -> dict:
    """Characters of every Write/Edit and Bash command, by target, so the results builder's cost shows."""
    totals = {}
    for line in log.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        message = event.get("message")
        for block in (message.get("content") or [] if isinstance(message, dict) else []):
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            data = block["input"]
            if block["name"] == "Write":
                key, size = "Write " + Path(data.get("file_path", "")).name, len(data.get("content", ""))
            elif block["name"] == "Edit":
                key, size = "Edit " + Path(data.get("file_path", "")).name, len(data.get("new_string", ""))
            elif block["name"] in ("Bash", "PowerShell"):
                key, size = block["name"], len(data.get("command", ""))
            else:
                continue
            totals[key] = totals.get(key, 0) + size
    return dict(sorted(totals.items(), key=lambda pair: -pair[1]))


if __name__ == "__main__":
    run_runner.main()
    work = Path(next(arg for arg in sys.argv[1:] if not arg.startswith("-"))).resolve()
    print(json.dumps(written_chars(work / "run.jsonl"), ensure_ascii=False, indent=2))
    # stream-json assistant events carry partial usage (output ~1k for a 27k run): meter the session log instead.
    project = Path.home() / ".claude/projects" / re.sub(r"[^A-Za-z0-9]", "-", str(work))
    logs = sorted(project.glob("*.jsonl"), key=lambda path: path.stat().st_mtime)
    if not logs:
        raise SystemExit(f"no session log in {project}")
    subprocess.run([sys.executable, str(SLIM / "cost_breakdown.py"), str(logs[-1])])
