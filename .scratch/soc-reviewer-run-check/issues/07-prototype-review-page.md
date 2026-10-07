# 07: Prototype the review page (2–3 layouts)

**What to build:** Run `/prototype` to build 2–3 throwaway layouts of the review page from real result data (benchmark `results.json` files are fine). Every layout must have: an overall status per row (✅/⚠️/❌), problem rows first, an expandable view of every axis with Thai labels, the Declared Selection next to the System Recommendation, a place for the Final Decision and a note, and the cited PDF page with highlights next to the TOR text. The user picks one. Keep the prototype on a `prototype/soc-review-page` branch and record the choice, plus the derivation rule for the overall status, in Comments.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 2–3 layouts are viewable in a browser
- [x] The user's choice and the reasons are written in Comments
- [x] The rule that turns axes into ✅/⚠️/❌ is agreed and written in Comments
- [x] The prototype branch name is written in Comments

## Comments

### 2026-10-07: prototype built, user chose layout A

- **Branch:** `prototype/soc-review-page` (commit a296e4c). Never merge it.
  - Route: `/soc/prototype-review?variant=A|B|C`. A floating bar at the bottom (or the ← → keys) switches layouts.
  - Files: `app/(app)/soc/prototype-review/{page.tsx,ReviewPrototype.tsx,data.json}`, `components/PrototypeSwitcher.tsx`,
    and `public/prototype-soc/page-N.png`.
  - Data: the real full-mode results of SOC-Demo (`test/fixtures/soc/results_sonnet.json`), with the TOR and bidder text
    from `SOC_Demo.docx`. The cited pages of `SOC_Demo_Package/Datasheet_Demo.pdf` were pre-rendered with PyMuPDF,
    with their highlight annotations.
  - Decisions are kept in memory only.
- **Layouts shown:**
  - A: table + inspector on the right.
  - B: rows that expand in place, grouped by major item.
  - C: one row at a time as a work queue, with a sticky decision bar.
- **Choice: A.** It is a table of every row (status, item, TOR text, "ticked → recommended", confirmed), problem rows
  first. Clicking a row opens a sticky panel on the right with:
  - the reasons for its status;
  - the TOR text next to the bidder's text;
  - the Declared Selection ≠/= the System Recommendation;
  - the cited page image, with page buttons for multi-page citations;
  - a collapsible "รายละเอียดทุกแกน";
  - the Final Decision buttons (ผ่าน (Comply) / ดีกว่า (Better) / ไม่ผ่าน), a note field, and a per-row [ยืนยันข้อนี้].
  - The filters above the table are status chips with counts, plus a major-item select.
  - The user picked A without stating further reasons. The layout keeps the full list and one row's evidence on
    screen together.
- **Overall status rule (agreed):** derived when read, never stored. Heading rows (`*_heading_row`) get no status.
  - ❌ ไม่ผ่าน: any of `tor_decision = non_compliant`, `evidence_support ∈ {not_supported, wording_conflict}`, or
    `product_identity = mismatch`.
  - ⚠️ ต้องตรวจ: otherwise, if any axis is outside its OK set:
    - reference_check {match, n/a}
    - item_label_check {match, n/a}
    - highlight_check {complete, n/a}
    - heading_title_check {match, n/a}
    - product_identity {match, n/a}
    - content_relevance {related, n/a}
    - evidence_support {fully_supported, n/a}
    - tor_decision {compliant, better, n/a}
    - declared_status_check {match, n/a}
    - (n/a = not_applicable; a missing axis counts as n/a.)
  - ✅ ผ่าน: every axis is OK.
  - Order: ❌, then ⚠️, then ✅, then by row number.
  - The page lists the failing axes as the reasons.
  - On SOC-Demo: ❌ 1 (๓.๓.๑), ⚠️ 5 (๑.๑, ๒.๑, ๒.๒, ๔.๓.๓, 4.8.2.6), ✅ 6.
  - Code to port: `overall()` + `AXES` in `ReviewPrototype.tsx` on the prototype branch.
- **Findings for 08/09:**
  - Imported rows have `socText = ""` and `referencePages = []` (`lib/soc-import.ts`), so the review page has no
    TOR/bidder text or page numbers today.
    - 08 must fill them, e.g. from the job's SOC docx at import time or from fields the skill adds.
    - Page numbers can be parsed from `reference` ("Datasheet Demo, pages 4, 5").
  - A PDF `<iframe>` doesn't work. `next.config.ts` sends `X-Frame-Options: DENY` and `frame-ancestors 'none'` on
    every route. This confirms 09's plan to render page images on the server.
  - Dev gotcha: Tailwind classes in newly added files did not appear until `.next/dev/cache/webpack` was deleted and
    the dev server restarted. Touching `globals.css` didn't help.
