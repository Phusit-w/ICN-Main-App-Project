"""Spike 04: one tiny `claude -p` with the Runner's flags; prints the first turn's cache usage.

python probe.py <label> <work dir> <prompt text> [append-system-prompt file]
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
label, work, prompt = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
append = sys.argv[4] if len(sys.argv) > 4 else None

skill = work / ".claude" / "skills" / "tor-word-compliance-check"
if not skill.exists():
    shutil.copytree(HERE / "pkg" / "tor-word-compliance-check", skill)

argv = [shutil.which("claude"), "-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
        "--permission-mode", "acceptEdits", "--allowedTools", "Bash,PowerShell,Read,Write,Edit,Glob,Grep,Skill,TodoWrite",
        "--disallowedTools", "WebFetch,WebSearch", "--max-turns", "1"]
if append:
    argv += ["--append-system-prompt-file", append]
out = subprocess.run(argv, input=prompt, capture_output=True, text=True, encoding="utf-8", cwd=work)
(HERE / f"{label}.jsonl").write_text(out.stdout, encoding="utf-8")
for line in out.stdout.splitlines():
    d = json.loads(line)
    if d.get("type") == "assistant":
        u = d["message"]["usage"]
        print(f"{label}: read {u.get('cache_read_input_tokens')} write {u.get('cache_creation_input_tokens')} "
              f"in {u.get('input_tokens')} out {u.get('output_tokens')}")
        break
else:
    print(label, "no assistant turn", out.returncode, out.stderr[-300:])
