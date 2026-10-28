# SOC Builder (TOR → SOC) — grill decisions

Grill started 2026-10-27. Resumes the paused SOC table builder thread
(`../../SOC-TABLE-BUILDER-WEB-GRILL-2026-09-09.md`, ADR 0002), re-asked against today's system
(ADR 0008, TOR reader in `lib/soc-tor-read.ts`, TOR splitting in `lib/soc-tor-match.ts`).

## Round 1 (all answered as recommended)

1. Same feature as the paused SOC table builder: keep its glossary terms (TOR PDF, SOC Template,
   Generated SOC Draft).
2. The user uploads a blank **SOC Template** in the customer's own layout; the builder fills the
   item-number and TOR columns and leaves offer / reference / remark columns empty.
3. Template format v1 = Word (.docx) only; Excel templates later (tie-in with the Excel ↔ docx
   converter, a separate grill).
4. TOR input = PDF, text or scanned (scanned read by Typhoon after the user confirms, same reader
   as TOR Match). Word TOR not accepted (save as PDF first).
5. The user picks which part of the TOR goes in (page range or annex); no automatic guessing.
6. One SOC row per numbered TOR item; unnumbered sub-lists ((ก), bullets) stay as lines inside
   the parent item's row (same unit TOR Match uses).
7. Splitting is done by web code only (no Claude, no quota), built on TOR Match's splitting;
   anything it cannot split is flagged for the user to fix in Word.

## Side branch: SOC Runner without Claude (opened round 1, not a builder decision)

The builder needs no LLM (decision 7), so anyone can use it. The question raised is about the
**SOC Runner** (datasheet check + TOR Match judge), which today runs `claude -p` (Claude Code)
on the reviewer's PC with their own Claude plan (ADR 0008).

8. Who: people in the user's own department (not company-wide).
9. Data: free-tier AI services are allowed, but the user must confirm before documents are sent
   (same pattern as the Typhoon OCR confirm). Confirmed after learning Gemini free-tier terms
   (prompts/files may train Google models and be read by human reviewers, kept up to 18 months):
   the confirm must say that plainly, and the Gemini Runner install guide must make the
   "don't use my data to improve models" opt-out a required step.
10. freellmapi (multi-provider free-key router): not used — results would vary by whichever model
    answered, and the confirm could not say where documents go.
11. Path: add an engine to the SOC Runner using another agent CLI; start with Gemini CLI only,
    as a /prototype measured on the MOF RFID ๕.๕/๕.๘ gold fixtures. Codex CLI later if someone
    in the department has ChatGPT Plus.
12. Gate: Gemini must come close to Sonnet on the fixtures before reviewers use it; results page
    and Excel always show which AI/model checked. Clearly worse → Beta label (like OCR TOR Match).
13. Engine is chosen once per PC at Runner install; the send confirm names the engine of the
    Runner that will take the job.

14. The SOC Builder is separate from the SOC check (`/soc`): not a SocJob kind, not in the
    check list. Supersedes ADR 0002 (needs a new ADR). Still reuses shared libs (TOR reader,
    OCR queue, readSocTable) where they fit.
20. Templates: both — pick a stored SOC Template from a list, or upload one for this build.
    (Changes decision 2: upload is no longer the only way.) User will send 2–3 sample templates.
21. Lives as a sub-menu inside the SOC app, same SOC app access (ADR 0007); no new launcher tile.
22. Builds are kept as a simple list (title, status, download, delete), auto-deleted after
    30 days like the SOC trash.
23. Template list: anyone with SOC app access can add a template; only the one who added it or an
    ADMIN can delete it. A template whose item-number/TOR columns can't be found is refused.
24. A stored template = name + file only.
15. TOR part chosen by typed page ranges (`12-40, 55-60`); a scanned TOR sends only those pages
    to OCR.
16. Columns found by the checker's header detection (`readSocTable`); no item-number column →
    the item number goes at the start of the TOR text (as in PDF SOC). A generated SOC must be
    readable by the SOC check.
17. Rows are copies of the template's last empty row (font, borders, widths kept). Major-item
    headings are ordinary rows with bold text, never merged cells.
18. Text tables inside a TOR item become multi-line text in the cell; pictures become a warning
    with the TOR page number (user pastes the picture in Word).
19. Output: the Word Generated SOC Draft + a warning list on the build's page. No link to a SOC
    check job in v1.
26. One SOC table filled (the first one found); all items in it, each annex starting with a bold
    major-item row. Separate files per annex = separate builds with different page ranges.
27. Build title defaults to the TOR file name, editable, duplicates allowed; output file
    `SOC-<title>.docx`.
25. Scanned TOR: Beta label + "check every item against the real TOR" warning (accepted), but the
    user asked whether another engine should proofread the OCR text — open, see Q28.
28. Scanned TOR is read by Typhoon (no quota). An optional "ให้ AI ทวนข้อความ OCR" button (scanned
    builds only) sends the chosen pages' text + page images to the user's SOC Runner; the AI
    answers only the corrections, the build applies them to the Word file and lists every change.
    Changes decision 7 to "AI never required". TOR Match can't do this (both sides are the same
    OCR text). Last ticket: measure on MOF + Apron scanned TORs both AI-proofread and AI-reads-
    everything (estimated ~6–12 vs ~20–40 quota points for 40 pages); add AI reading as an
    option only if clearly better.

## Corrections found while writing the spec (agreed 2026-10-27)

- 6/7: TOR Match does NOT split a TOR into items — `matchTor` only cuts annex / major sections
  and locates existing SOC rows' text in them; the 82–93% figures were match rates. The builder
  needs a NEW item splitter (built on the TOR reader, PUA fix, section cutting and the
  major-item rules). Its accuracy is unmeasured → ticket 01 measures it by building SOCs from the
  MEA / MOF / Apron TORs and comparing with their real SOCs.
- 16: a Word SOC is read positionally (column 1 = item number, column 2 = TOR); header detection
  exists only for Excel SOCs. So the template contract is "the layout the SOC check reads":
  item number in column 1, TOR in column 2. The "no item-number column" case doesn't arise.
- 14: written as ADR 0011 (supersedes ADR 0002).

→ Runner engine work is its own feature (own spec/tickets after the prototype), not part of the
  SOC Builder.
