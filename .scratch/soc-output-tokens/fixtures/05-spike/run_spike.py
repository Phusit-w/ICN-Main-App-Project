"""Ticket 05 spike: the 03 gate (run_gate.py) on the compact3 package with `claude -p --effort <level>`.
    python run_spike.py <short work dir> --effort low [--item ๕.๘ --r1]
`MAX_THINKING_TOKENS` is not honoured by Claude Code 2.1.295 in -p mode (probe: cap 1024 → 13.8k thinking),
`--effort` is. CLAUDE_EFFORT (set inside a Claude Code shell) is removed so only the flag decides.
Afterwards prints the meter and thinking tokens from the `result` event.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "03-gate"))
import run_gate  # noqa: E402

run_gate.run_runner.SERVED = HERE / "served-2026-10-09-compact3.zip"
os.environ.pop("CLAUDE_EFFORT", None)

effort = sys.argv[sys.argv.index("--effort") + 1]
del sys.argv[sys.argv.index("--effort"):sys.argv.index("--effort") + 2]
real_run = subprocess.run


def run_with_effort(argv, *args, **kwargs):
    if "-p" in argv and "stream-json" in argv:
        argv = [*argv, "--effort", effort]
    return real_run(argv, *args, **kwargs)


run_gate.run_runner.subprocess.run = run_with_effort


def result_usage(log: Path) -> dict:
    for line in reversed(log.read_text(encoding="utf-8").splitlines()):
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "result":
            usage = event.get("usage") or {}
            return {"effort": effort, "num_turns": event.get("num_turns"), "output_tokens": usage.get("output_tokens"),
                    "thinking_tokens": (usage.get("output_tokens_details") or {}).get("thinking_tokens")}
    return {}


if __name__ == "__main__":
    work = Path(next(arg for arg in sys.argv[1:] if not arg.startswith("-") and not arg.startswith("๕"))).resolve()
    try:
        run_gate.run_runner.main()
    finally:
        print(json.dumps(result_usage(work / "run.jsonl"), ensure_ascii=False))
    print(json.dumps(run_gate.written_chars(work / "run.jsonl"), ensure_ascii=False, indent=2))
    project = Path.home() / ".claude/projects" / run_gate.re.sub(r"[^A-Za-z0-9]", "-", str(work))
    logs = sorted(project.glob("*.jsonl"), key=lambda path: path.stat().st_mtime)
    if logs:
        real_run([sys.executable, str(run_gate.SLIM / "cost_breakdown.py"), str(logs[-1])])
