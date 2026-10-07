# 09: PDF evidence panel with highlights

**What to build:** When a row is expanded, the review page shows the rendered cited PDF page(s), with the highlights the skill reported, next to the TOR text, the bidder's text, the Declared Selection and the System Recommendation. Rendering happens on the server from the job's stored evidence (a deterministic render, not AI). Only users with `soc` access can fetch the images.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 08

**Status:** done

- [x] The cited page renders for a typical row, and the highlight regions are visible
- [x] Multi-page citations can be paged through
- [x] A missing or unreadable page shows a clear Thai message instead of breaking the page
- [x] Image fetching is access-checked; browser-verified; lint, typecheck and build pass

## Comments

### 2026-10-07: built

- **What was built:**
  - `GET /api/soc/jobs/[id]/evidence/[documentId]/pages/[page]` returns one page of one of the job's evidence PDFs as
    a PNG. It is access-checked with `authorizeSocJob`, so any `soc` user may open an imported job; signed out → 401,
    no `soc` → 403. The document must be that job's `EVIDENCE` file (otherwise 404). A page the PDF doesn't have
    → 404, an unreadable PDF → 422, both with a Thai `error` message. `Cache-Control: private, max-age=300`. Page views
    are not audited (viewing while reviewing is not a download; the "เปิด …pdf" link to the whole file still is).
  - `lib/soc-pdf-page.ts` renders with **MuPDF** (`mupdf` npm 1.28.1, WASM, no native deps; added to
    `serverExternalPackages`, and the `.wasm` is traced into the standalone build). Annotations are rendered, so the
    vendor PDF's highlights show as in a PDF reader. About 1200 px wide, capped at 2× and ~6 MP.
  - `citedEvidence()` in `lib/soc-review.ts` splits a reference at `;`/line breaks into citations, each with its pages
    and the evidence PDF it names (matched without case/extension/separators; exact, or the file name may add to the
    cited name, e.g. "… v2", never the reverse; none or several → null). `socReviewView` exposes `citations` per row.
  - The inspector's `data-slot="pdf-evidence"` now shows the page image, page buttons across all cited pages (with
    the file name when several documents are cited), a link to open each PDF, the skill's `highlight_evidence` text,
    and Thai notes for "no reference", "no PDF matches", "no page numbers", or the server's error for a failed page.
- **Decisions to know:**
  - **`evidenceDocumentId` is still never written.** The document is matched when the page is read, so evidence
    uploaded later (story 7) and rows imported before this ticket work with no backfill.
  - **"Highlights the skill reported"** = the highlight annotations in the evidence PDF itself, plus the skill's
    `highlight_evidence` text under the image. The skill's results carry no highlight positions, so nothing is drawn
    by the app.
  - **Licence:** `mupdf` is **AGPL-3.0-or-later**, like the PyMuPDF `soc-worker` already uses. The app is intranet-only.
    The user should confirm this is acceptable before production. The alternative is pdf.js + `@napi-rs/canvas`
    (Apache/MIT).
- **Tests:** `test/soc-pdf-evidence.test.ts` (render with the highlight pixel checked, mutation-checked; page 1 has
  none; missing page / bad page number / broken PDF messages; access: signed out, no `soc`, teammate, another job's
  PDF, the SOC docx; the view's citations), plus `citedEvidence` cases in `lib/soc-review.test.ts`.
  `test/pdf-fixture.ts` builds PDFs with highlights. 145/145 pass.
- **Verified in a browser** on "Ticket 04 browser check (SOC_Demo)" in pilot-db:
  - ๓.๓.๑ shows page 9 with its yellow highlight;
  - ๑.๒.๓ pages between หน้า 4 and หน้า 5, both with highlights;
  - forcing page 99 showed "ไม่พบหน้า 99 ใน Datasheet_Demo.pdf (ไฟล์นี้มีทั้งหมด 12 หน้า)".
  - Lint, typecheck and build pass.
- **Review (/code-review) fixes:**
  - the MuPDF document is freed on every path;
  - a pixel cap was added;
  - a failed image is explained with one fetch;
  - "page" in a file name no longer cuts the name;
  - a cited "X Annex" no longer falls back to "X.pdf";
  - a reference that cites several documents is split;
  - the cache was cut to 5 minutes.
- **Left (not blocking):**
  - Rendering is synchronous and re-opens the PDF on each request. If big catalogs make paging slow, cache the PNGs on
    disk under the job's storage folder.
  - Each SOC route maps 401/403/404 to messages on its own; this could become one shared helper.
- **Dev gotcha:** a row in the table sometimes needs a second click right after the page loads (it is still
  hydrating in dev). This existed before this ticket.
