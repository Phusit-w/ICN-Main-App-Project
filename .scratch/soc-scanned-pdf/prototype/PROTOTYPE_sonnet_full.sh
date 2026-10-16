#!/usr/bin/env bash
# PROTOTYPE: Sonnet transcribes every cells sheet (FULL_TOR=1) in batches of 10 pages,
# one headless `claude -p` session per batch, like the Runner would. Writes
# rows-<first>-<last>.json + usage-<first>-<last>.json per batch into the sheet folder.
# usage: PROTOTYPE_sonnet_full.sh <folder with cells-NNN.png> [first] [last]
set -u
dir=$1; first=${2:-1}; last=${3:-85}; size=10
cd "$dir" || exit 1
for ((a = first; a <= last; a += size)); do
  b=$((a + size - 1)); ((b > last)) && b=$last
  files=""
  for ((p = a; p <= b; p++)); do f=$(printf "cells-%03d.png" $p); [ -f "$f" ] && files="$files $f"; done
  out="rows-$a-$b.json"
  [ -f "$out" ] && { echo "skip $a-$b (done)"; continue; }
  prompt="Read each of these images with the Read tool, in order:$files
Each image is the table rows of one page of a scanned Thai SOC (statement of compliance); the number in the file name is the page.
Rows are separated by a thick black bar. Inside a row, cells are separated by gray bars, in this order:
1. requirement (คุณลักษณะที่กำหนด, the TOR text; its first line usually starts with the item number, e.g. ๕.๑.๒)
2. offer (ข้อเสนอทางบริษัท)
3. reference (เอกสารอ้างอิง (หน้า))
4. remark (หมายเหตุ)
Write the file $out: a JSON array, one object per row, in order:
{\"page\": 3, \"row\": 1, \"item_no\": \"...\", \"requirement\": \"...\", \"offer\": \"...\", \"reference\": \"...\", \"remark\": \"...\"}
item_no = the item number at the start of the requirement, or \"\" if there is none. Copy all text exactly (Thai digits stay Thai; join a cell's lines with a space).
A cell holding a small table: write its rows as lines \"col | col | col\" joined with \" / \". Use \"\" for an empty cell; write \"?\" for text you cannot read, never guess. Then reply only \"done\"."
  start=$(date +%s)
  claude -p --model sonnet --allowedTools "Read,Write" --output-format json <<<"$prompt" > "usage-$a-$b.json" 2> "err-$a-$b.txt"
  echo "pages $a-$b: exit=$? $(( $(date +%s) - start )) s, rows file: $([ -f "$out" ] && echo yes || echo NO)"
done
