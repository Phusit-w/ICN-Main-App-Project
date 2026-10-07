# 02: Measure accuracy and quota on one real SOC major item

**What to build:** The user runs the current `tor-word-compliance-check` skill (from `SOC model compliance/Skill`) in Claude Code on one major item of a real Word SOC, in full mode (full_audit + evidence_support + tor_decision), with Sonnet. They record how long it took, how much of the Pro usage window it used, and whether the findings look right. The resulting `results.json` and `SOC_Check` document are kept as real fixtures for ticket 05. This blocks no code, but it confirms the approach is worth building and sizes major items against the quota.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] One major item is checked end to end; the row count, duration and approximate quota used are written in Comments
- [x] The user's judgement of accuracy (rows right / wrong / unsure) is written in Comments
- [x] The `results.json` and `SOC_Check` document are saved somewhere the agent can read, and the path is written in Comments
- [x] Anything the skill did badly (e.g. step 0 behaviour) is noted

## Comments

**2026-10-07: preparation (no Claude run yet).** Sample project: `ICN Apps/Example SOC+TOR+Datasheet/MOF_RFID`.

- The SOC is a legacy `.doc`: `บทที่ 5 .../ICN_ตารางเปรียบเทียบรายละเอียดคุณลักษณะเฉพ.doc`. The skill needs `.docx`. A Word-converted `.docx` now sits next to it (same name). It was verified identical to the `.doc`: 355×4 table, 1,420 cells, 105,216 chars, 62 pages, same text hash. It holds one table of 355 rows and 4 columns.
- The major items are Thai-numeral headings (๑.–๑๔.). Item ๕. alone covers rows 58–306 (about 247 rows). Every row that cites a datasheet sits under ๕.๑–๕.๑๑, and each of those cites `เอกสารส่วนที่ 2 2.x`. For a 20–50 row run, use a sub-section rather than the whole of ๕. (The importer/runner treats ๕ as one 247-row major item. Revisit that during the evidence-packet grill.)
- Sub-section sizes: ๕.๑ 9 rows, ๕.๒ 7, ๕.๓ 5, ๕.๔ 7, **๕.๕ 25**, ๕.๖ 13, ๕.๗ 18, ๕.๘ 50, ๕.๙ 17, ๕.๑๐ 5, ๕.๑๑ 5. ๕.๑๒–๕.๑๕ are "ยอมรับตามข้อกำหนด" only, with no datasheet.
- Recommended baseline: **๕.๕** (25 rows, two text-based datasheets with 53 highlights: TC22/TC27 and RFD40). That also gives a multi-document case.
- What the PDFs look like (PyMuPDF):
  - The TOR is fully scanned (0 text chars on 18 pages), so check 1 needs OCR or vision.
  - The 2.2 Keyboard+Mouse datasheet is image-only (34 chars/page, 0 highlights). Use it later as the image test case.
  - 2.1 Server has only 1–2 highlights, and its folder lacks `_ok`, so it may be unfinished.
  - 2.8 AMS is 71 pages with 79 highlights, the heavy case.
- Chapter 3 has two letters of appointment/certification (Zebra, HID): grill samples for the certificate rules.

**2026-10-07: baseline run, ๕.๕ (MOF_RFID).**

- **Scope:** SOC rows 89–113 (1-based, same as `inspect_word_table.py`), **25 rows**: 2 sub-headings (๕.๕(๑), ๕.๕(๒)), 1 section heading, 22 content rows. Mode: `full_audit` + `evidence_support` + `tor_decision`. Evidence: `tc22-tc27-spec-sheet-en-us.pdf` (4 pp) and `rfd40-premium-series-spec-sheet-en-us (1).pdf` (4 pp). The TOR (scanned) was read by rendering pp. 6–7 as images.
- **Model: Opus 5.5, not Sonnet** as the ticket asked. The quota figure is therefore an upper bound. A Sonnet re-run on the same 25 rows is still needed (see below).
- **Duration:** about 6 min (13:31–13:37 by the shell clock), from reading SKILL.md through the finished SOC_Check. The user's review is not included.
- **Quota:** Pro usage went from **2% → 8% (about 6%)** for 25 rows, as read by the user. That includes reading SKILL.md (61 KB) and all the references once per session. Rough pro-rata: all of ๕ (247 rows) ≈ 60% of a window on Opus, so a major item that size does not fit one window. It must be split by sub-section, or run on Sonnet.
- **Files** (`fixtures/02-mof-rfid-5.5/`, relative to `.scratch/soc-reviewer-run-check/`): `results.json` (25 results), `SOC_Check-2026-10-07-MOF_RFID-5.5.docx`, `hl_tc22.json` / `hl_rfd40.json` (output of `extract_pdf_highlights.py`), `fulltext.txt`, `tor_png/` and `ds_png/` (renders), plus the helper scripts `build_results.py` (the source of results.json) and `post.py` (colour/status post-process). Untracked, not committed.
- **Run outcome:** the validator (run separately against each datasheet's highlights.json) reported 0 issues. Visual QA was not done (no LibreOffice on this PC). Structural QA passed: the original SOC table is unchanged, and there are 25 result rows in landscape.

**User's verdict per row (ผู้ตรวจ):**

| Verdict | Rows | Notes |
|---|---|---|
| ถูก | 21 | ๕.๕, ๑.๑, ๑.๔–๑.๑๐, ๒.๑–๒.๑๒ (including both reference `mismatch` findings ๒.๑ and ๒.๘, the 7,000 mAh error in ๑.๕, and the dBm/AUS-band conflict in ๒.๒) |
| ผิด (over-flag) | 2 | ๕.๕(๑), ๕.๕(๒): the offer repeating the TOR wording verbatim is acceptable, and the reviewer passes these rows. Claude flagged the missing model/variant (TC22 vs TC27, Premium vs Premium Plus) and, on (๒), the missing 5.5 (2) label/highlight, so this is noise. **Rule to add:** a sub-heading row whose offer copies the TOR passes; don't flag missing model names. (The ๕.๕ heading row carries the same note, but the user counted it OK.) |
| ผิดบางส่วน | 1 | ๑.๒ Application License: Claude correctly found that the datasheet doesn't support it, but pointed to the wrong fix ("confirm from 2.8 AMS"). The reviewer says the row is **missing a reference to บทที่ 3 หนังสือแต่งตั้งให้เป็นตัวแทนจำหน่าย** (Zebra letter `ZPL2600054 ... หนังสือแต่งตั้งการเป็นตัวแทน-ICN (P).pdf`). **Lesson:** the skill only knows chapter 2 datasheets. License/authorisation claims should look to chapter 3 letters. Feed this into the evidence-packet grill. |
| ไม่แน่ใจ | 1 | ๑.๓: the reviewer asks whether the highlight really must also cover the Touch Panel row, or whether the Display row is enough. Open policy question: does a TOR word such as "สัมผัส", whose only evidence is a different datasheet row, require its own highlight? Decide in the grill. |

**What the skill did badly / notes:**

- **Step 0 is silent on file ambiguity.** The reference cell names only the folder (`เอกสารส่วนที่ 2 / 2.5 …`, "หน้า N"), but the folder holds 2 PDFs that both have pages 1–4. The skill's step 0 only checks for missing documents, not ambiguous ones. Claude resolved it from the sub-item (๑) → TC22, ๒) → RFD40) and the red labels, but nothing in the skill asks for that or reports it. **The evidence packet must map each row to a file, not a folder.**
- The SOC's 4-column table has no Comply/Better column, so `declared_status` is `not_applicable` throughout. The skill handled this fine, but it was not described.
- `validate_audit_consistency.py` takes one highlights.json and parses pages from a "page N" string. With 2 PDFs it had to be run per file on a split results.json, and the `reference` field had to be rewritten in English ("…, page 3") so the parser could read it. The Thai "หน้า" isn't parsed.
- The skill's colour/sub-status rules ("ควรตรวจซ้ำ", sub-status text) are post-processing that isn't in `append_results_to_docx.py`. Claude had to write `post.py` itself, which is a reproducibility risk for the runner.
- RFD40 p.1 has a "2.4" FreeText label at y≈882, below the 792 pt page, so it is invisible. The script still reports it.
- TOR p.7 has a line through ๒.๘, and p.6 has one through ๕.๔ ๕). Probably scan artefacts, but not verified. The SOC still includes both.
- The TOR column in the SOC (๒.๒) reads "EPC Gen๒ V" where the TOR reads "Gen๒ V๒": a copy typo that Claude caught by reading the TOR image.

**Next:** the user asked whether to switch to Sonnet. Recommendation: re-run the same ๕.๕ on Sonnet in a fresh session and record the quota delta. Then score it against the verdicts above, which are now an answer key. That gives a like-for-like Opus vs Sonnet comparison for ADR 0008.
