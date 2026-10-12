"""soc-image-rows ticket 04: run one major item of the Surat Thani Excel SOC headless, with evidence_packet.

    python run_excel.py <short work dir> [--item 2.2] [--model sonnet]

Like ../../../soc-evidence-packet/fixtures/07-packet-run/run_5_5.py: copies the job to <work>/inputs (the
.xlsx SOC and the catalog folder only), the skill source to <work>/.claude/skills, runs `claude -p` with the
runner's flags and saves the stream-json log as <work>/run.jsonl. The prompt still asks for SOC_Check.docx,
as the SOC Runner's does until ticket 05: the skill must skip it for an Excel SOC. Afterwards: the
validator, check_page_reads, any SOC_Check file in out/, and the run's tokens.
Keep the work dir path short (Windows MAX_PATH).
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parents[2] / "soc-evidence-packet/fixtures"
sys.path.insert(0, str(FIXTURES / "07-packet-run"))
sys.path.insert(0, str(FIXTURES / "11-slim"))
from run_5_5 import ALLOWED_TOOLS, DISALLOWED_TOOLS, ICN, SKILL  # noqa: E402
from run_runner import measure  # noqa: E402

JOB = ICN / "Example SOC+TOR+Datasheet/4. DOAXXX_Apron_ท่าอากาศยานสุราษฎร์ธานี (Re-bidding)/Proposal A"
SOC_FOLDER = "2. ตารางเปรียบเทียบคุณลักษณะเฉพาะทางเทคนิค (Compliance Threshold)"
CATALOG_FOLDER = "3. เอกสารรายละเอียดคุณลักษณะ (Catalog_Data Sheet)"


def prepare(work: Path) -> None:
    if work.exists():
        raise SystemExit(f"{work} exists: give a new folder")
    inputs = work / "inputs"
    inputs.mkdir(parents=True)
    job = Path("\\\\?\\" + str(JOB))  # the sample's paths are longer than MAX_PATH
    shutil.copy2(next((job / SOC_FOLDER).glob("*.xlsx")), inputs / "soc.xlsx")
    shutil.copytree(job / CATALOG_FOLDER, inputs / "catalog")
    shutil.copytree(SKILL, work / ".claude/skills/tor-word-compliance-check", ignore=shutil.ignore_patterns("__pycache__"))
    (work / "out").mkdir()


def prompt(item: str) -> str:
    return "\n".join([
        "ใช้ skill `tor-word-compliance-check` ที่อยู่ใน `.claude/skills/tor-word-compliance-check/SKILL.md` ของโฟลเดอร์นี้เท่านั้น"
        " (ห้ามใช้ skill ชื่อเดียวกันจากที่อื่น)",
        "ตรวจ SOC ในโหมด full_audit พร้อม option evidence_support, tor_decision และ evidence_packet ห้ามถามผู้ใช้ ห้ามรอคำตอบ",
        "",
        "- ไฟล์ SOC: `inputs/soc.xlsx`",
        "- ไฟล์หลักฐาน: ทุกไฟล์ใน `inputs/` (โฟลเดอร์งาน)",
        f"- ตรวจเฉพาะข้อใหญ่ {item} (เลขข้อเท่ากับ {item} หรือขึ้นต้นด้วย `{item}.` เท่านั้น) ทุกแถวใน results ต้องอยู่ในข้อใหญ่นี้",
        "- packet: สร้างที่ `out/packet` จากโฟลเดอร์งาน `inputs`",
        "- โฟลเดอร์ output: `out/` ให้เขียนผลเป็น `out/results.json` และเอกสาร `out/SOC_Check.docx`"
        " ไฟล์ระหว่างทางก็เก็บใน `out/`",
        "- ห้ามแก้ไขไฟล์ใน `inputs/`",
    ]) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("work", type=Path)
    parser.add_argument("--item", default="2.2")
    parser.add_argument("--model", default="sonnet")
    args = parser.parse_args()
    work = args.work.resolve()
    prepare(work)
    text = prompt(args.item)
    (work / "prompt.txt").write_text(text, encoding="utf-8")
    argv = [shutil.which("claude") or "claude", "-p", "--output-format", "stream-json", "--verbose",
            "--model", args.model, "--permission-mode", "acceptEdits",
            "--allowedTools", ALLOWED_TOOLS, "--disallowedTools", DISALLOWED_TOOLS]
    with open(work / "run.jsonl", "w", encoding="utf-8") as log:
        code = subprocess.run(argv, cwd=work, input=text, text=True, encoding="utf-8",
                              stdout=log, stderr=subprocess.STDOUT).returncode
    print("claude exit", code)
    out, scripts = work / "out", SKILL / "scripts"
    print("SOC_Check files:", [path.name for path in out.rglob("*") if "soc_check" in path.name.lower()] or "none")
    if (out / "packet/job.json").is_file():
        subprocess.run([sys.executable, str(scripts / "check_page_reads.py"), str(out / "packet"), str(work / "run.jsonl")])
    if (out / "results.json").is_file():
        job = json.loads((out / "packet/job.json").read_text(encoding="utf-8"))
        highlights = [f"{entry['file']}={out / 'packet' / entry['highlights_file']}" for entry in job["files"]]
        done = subprocess.run([sys.executable, str(scripts / "validate_audit_consistency.py"), str(out / "results.json"),
                               *highlights, "--output", str(work / "consistency.json")])
        print("validator exit", done.returncode)
    stats = measure(work / "run.jsonl")
    (work / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
