"""soc-image-rows ticket 07: run one major item of the MEA Y69 Word SOC headless, with evidence_packet.

    python run_mea.py <short work dir> [--item 2.5] [--model sonnet] [--prepare-only]

Like ../04-excel-run/run_excel.py: copies the job to <work>/inputs (the SOC saved as .docx and the catalog
folder only), the skill source to <work>/.claude/skills, runs `claude -p` with the runner's flags and saves
the stream-json log as <work>/run.jsonl. Afterwards: check_page_reads (pages, crops and the images of Image
Rows), the validator, the image fields of every Image Row, and the run's tokens.

The sample's SOC is a .doc; SOC_DOCX is the copy saved as .docx for ticket 03. The skill reaches only some of
MEA's items, because its item numbers restart in every ผนวก: 2.5 (rows 110-117, Image Row 111), 1.7 (rows
91-92, Image Row 92), 11. (rows 273-277, Image Row 274); 1.12 (rows 98-105) has no Image Row.
--prepare-only builds the packet and stops, to look at job.md without using quota.
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
from run_5_5 import ALLOWED_TOOLS, DISALLOWED_TOOLS, ICN, SKILL  # noqa: E402

JOB = ICN / "Example SOC+TOR+Datasheet/2. MEA_จัดระเบียบสายสาธารณูปโภคฯ Y69/Proposal"
CATALOG_FOLDER = "บทที่ 5 แคตตาล็อก หรือรูปแบบรายละเอียดคุณลักษณะเฉพาะ"
SOC_DOCX = Path("C:/Phusit/soc03/mea/mea_soc.docx")


def prepare(work: Path) -> None:
    if work.exists():
        raise SystemExit(f"{work} exists: give a new folder")
    inputs = work / "inputs"
    inputs.mkdir(parents=True)
    job = Path("\\\\?\\" + str(JOB))  # the sample's paths are longer than MAX_PATH
    shutil.copy2(SOC_DOCX, inputs / "soc.docx")
    shutil.copytree(job / CATALOG_FOLDER, inputs / "catalog")
    shutil.copytree(SKILL, work / ".claude/skills/tor-word-compliance-check", ignore=shutil.ignore_patterns("__pycache__"))
    (work / "out").mkdir()


def prompt(item: str) -> str:
    return "\n".join([
        "ใช้ skill `tor-word-compliance-check` ที่อยู่ใน `.claude/skills/tor-word-compliance-check/SKILL.md` ของโฟลเดอร์นี้เท่านั้น"
        " (ห้ามใช้ skill ชื่อเดียวกันจากที่อื่น)",
        "ตรวจ SOC ในโหมด full_audit พร้อม option evidence_support, tor_decision และ evidence_packet ห้ามถามผู้ใช้ ห้ามรอคำตอบ",
        "",
        "- ไฟล์ SOC: `inputs/soc.docx`",
        "- ไฟล์หลักฐาน: ทุกไฟล์ใน `inputs/` (โฟลเดอร์งาน)",
        f"- ตรวจเฉพาะข้อใหญ่ {item} (เลขข้อเท่ากับ {item} หรือขึ้นต้นด้วย `{item}.` เท่านั้น) ทุกแถวใน results ต้องอยู่ในข้อใหญ่นี้",
        "- packet: สร้างไว้แล้วที่ `out/packet` (จากโฟลเดอร์งาน `inputs`) ใช้อันนั้น ไม่ต้องสร้างใหม่",
        "- โฟลเดอร์ output: `out/` ให้เขียนผลเป็น `out/results.json` และเอกสาร `out/SOC_Check.docx`"
        " ไฟล์ระหว่างทางก็เก็บใน `out/`",
        "- ห้ามแก้ไขไฟล์ใน `inputs/`",
    ]) + "\n"


def usage(log: Path) -> dict:
    """The run's own totals, from the final `result` event of the stream-json log."""
    result = {}
    for line in log.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict) and event.get("type") == "result":
            result = event
    tokens = result.get("usage") or {}
    return {"seconds": round(result.get("duration_ms", 0) / 1000), "turns": result.get("num_turns"),
            "output_tokens": tokens.get("output_tokens"), "input_tokens": tokens.get("input_tokens"),
            "cache_write_tokens": tokens.get("cache_creation_input_tokens"),
            "cache_read_tokens": tokens.get("cache_read_input_tokens"), "cost_usd": result.get("total_cost_usd")}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("work", type=Path)
    parser.add_argument("--item", default="2.5")
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    work = args.work.resolve()
    prepare(work)
    out, scripts = work / "out", SKILL / "scripts"
    # As the SOC Runner does: the packet is built before Claude starts.
    built = subprocess.run([sys.executable, str(work / ".claude/skills/tor-word-compliance-check/scripts/build_evidence_packet.py"),
                            "inputs/soc.docx", args.item, "inputs", "out/packet"], cwd=work, capture_output=True, encoding="utf-8")
    print("packet:", built.stdout.strip() or built.stderr.strip())
    if built.returncode or args.prepare_only:
        return
    text = prompt(args.item)
    (work / "prompt.txt").write_text(text, encoding="utf-8")
    argv = [shutil.which("claude") or "claude", "-p", "--output-format", "stream-json", "--verbose",
            "--model", args.model, "--permission-mode", "acceptEdits",
            "--allowedTools", ALLOWED_TOOLS, "--disallowedTools", DISALLOWED_TOOLS]
    with open(work / "run.jsonl", "w", encoding="utf-8") as log:
        code = subprocess.run(argv, cwd=work, input=text, text=True, encoding="utf-8",
                              stdout=log, stderr=subprocess.STDOUT).returncode
    print("claude exit", code)
    print("SOC_Check files:", [path.name for path in out.rglob("*") if "soc_check" in path.name.lower()] or "none")
    read_check = subprocess.run([sys.executable, str(scripts / "check_page_reads.py"), str(out / "packet"), str(work / "run.jsonl")])
    print("check_page_reads exit", read_check.returncode)
    job = json.loads((out / "packet/job.json").read_text(encoding="utf-8"))
    if (out / "results.json").is_file():
        highlights = [f"{entry['file']}={out / 'packet' / entry['highlights_file']}" for entry in job["files"]]
        if highlights:
            done = subprocess.run([sys.executable, str(scripts / "validate_audit_consistency.py"), str(out / "results.json"),
                                   *highlights, "--output", str(work / "consistency.json")])
            print("validator exit", done.returncode)
        results = {row["row"]: row for row in json.loads((out / "results.json").read_text(encoding="utf-8"))["results"]}
        print("result rows:", sorted(results), "| packet rows:", [row["row"] for row in job["rows"]])
        for row in job["rows"]:
            if "image_file" in row or "image_error" in row:
                found = results.get(row["row"], {})
                print(json.dumps({key: found.get(key) for key in ("row", "item", "image_kind", "image_reading", "image_unsure",
                                                                   "image_note", "reference_note", "reference_check",
                                                                   "tor_decision", "confidence", "key_issue")},
                                 ensure_ascii=False, indent=1))
    stats = usage(work / "run.jsonl")
    (work / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    main()
