# SOC Domain Glossary

Shared vocabulary for the SOC checker and its semantic review layer. Referenced by
[ADR-SOC-SEMANTIC-REVIEW](adr/ADR-SOC-SEMANTIC-REVIEW.md),
[ADR-SOC-AUTO-PASS-POLICY](adr/ADR-SOC-AUTO-PASS-POLICY.md),
[SOC-ACCURACY-ACCEPTANCE](SOC-ACCURACY-ACCEPTANCE.md).

## Table builder inputs and output

These terms describe the table-builder scope established in
`SOC-TABLE-BUILDER-WEB-GRILL-2026-09-09.md`; release behavior and job-model choices remain open.

**TOR PDF**:
The PDF containing the procurement requirements from which the SOC table is prepared.
_Avoid_: Evidence PDF, catalog

**SOC Template**:
A blank Word document containing the table to be populated with requirement numbers and requirement content.

**Generated SOC Draft**:
The builder's Word output containing extracted TOR requirements and any included table images. Generation alone does not mean that bidder proposal fields, references, or compliance declarations are complete or verified.
_Avoid_: Checked SOC, approved SOC

**SOC Build Job**:
A queued SOC job that prepares a Generated SOC Draft from a TOR PDF and SOC Template. It does not produce compliance findings or require row-by-row compliance confirmation.
_Avoid_: SOC check, compliance review

**Extraction Manifest**:
The versioned record of extracted requirement blocks, their original source locations, extraction methods, and warnings used to create a Generated SOC Draft.
_Avoid_: Compliance result, audit verdict

## Reviewer-run checks (ADR 0008)

**Local Check Run**:
One run of the shared SOC skill by a reviewer on their own machine. It uses that reviewer's own Claude subscription and covers one major item (ข้อใหญ่) of a SOC. It produces a results file, a SOC_Check document, and a record of the skill version and model it used.
_Avoid_: server check, worker run

**SOC Runner**:
The program installed on a reviewer's machine. It takes only that reviewer's check requests, performs Local Check Runs under their own Claude login, and sends the results back to the server.
_Avoid_: worker, agent, bot

**Check Request**:
A reviewer's click to check one major item, or a whole SOC, in an Imported SOC Check. It belongs to that reviewer, and only that reviewer's SOC Runner may carry it out. A whole-SOC click makes one Check Request per unchecked major item, and a major item has at most one open Check Request at a time (see `docs/SOC-RUNNER.md`).
_Avoid_: job (a job is the whole SOC)

**Imported SOC Check**:
A SOC job made from the uploaded outputs of one or more Local Check Runs for the same SOC. It starts in review and is never processed on the server.
_Avoid_: auto check, queued check

**Runner Link**:
The tie between one SOC Runner and one user: the token in the `soc-runner.json` config that the user downloaded from `/soc`. Only its hash is stored. A user has one active Runner Link at a time; downloading again replaces it, and an admin can revoke it (see `docs/SOC-RUNNER.md`).
_Avoid_: pairing code, API key

**Skill Package**:
One version of the SOC skill (`tor-word-compliance-check`) that an admin uploaded to the server. Exactly one Skill Package is **current**: the one SOC Runners download for their next check. The server serves it with a headless instruction added (see `docs/SOC-SKILL-HOSTING.md`).
_Avoid_: skill file, plugin

## Core objects

| Term | Meaning |
|---|---|
| **SOC** | Statement of Compliance — a `.docx` table where each row is a procurement requirement ("claim"). Thai: เอกสารแสดงการปฏิบัติตามข้อกำหนด / ภาคผนวก. |
| **SOC row / claim row** | One requirement line. Has an item number (`๑.๒.๗`, `4.3.1`, ...), the claim text, and a **reference** the bidder filled in pointing to supporting evidence. |
| **Datasheet / Catalog** | The bidder's supporting `.pdf`(s) — product spec sheets, brochures, certificates. May be native-text or scanned images. |
| **Reference** | Free text in the SOC row naming where the evidence is, e.g. `CASRI Product Brochure, page 5` or `page 13, 14`. May be blank. |
| **Page citation** | The page number(s) parsed out of the reference. Blank/none → `not_found`. |
| **row_type** | `content_row` (a spec), `system_heading_row` (a named subsystem), `section_heading_row` (a category header with no specific claim), `product_identity_row` (names a brand/model). |

## Evidence classification

| Term | Meaning |
|---|---|
| **Independent datasheet evidence** | A page from a manufacturer's spec sheet / brochure / third-party certificate that states a fact about the product, independent of the bid. Eligible to support `pass`/`better`. |
| **Vendor declaration** | A page that is the **bidder's own** compliance assertion — a "หนังสือรับรองผลิตภัณฑ์" / certification letter, a signed cover letter, a page that restates SOC clause numbers verbatim. Heuristics: letterhead + signature block; contains the string "รับรอง" / "ขอรับรอง" near clause numbers; ≥ 3 SOC item numbers (`\d+\.\d+`) appear on the page; high verbatim overlap with the SOC claim itself. Tagged `sourceType: "vendor_declaration"`. **Does not count as evidence** for auto-pass. |
| **Circular evidence** | The failure mode where a keyword/semantic engine "confirms" a claim because the cited page is a vendor declaration that copies the requirement text. The engine is matching the requirement to itself. Must be detected and excluded. |
| **Fidelity** | `text` = native PDF text extraction; `ocr` = text recovered by OCR from a scanned page (lower trust — see auto-pass policy). |

## Verdicts

The **semantic** verdict (`ruleVerdict` / `aiVerdict`). Distinct from `keywordMatch`.

| Verdict | Meaning | Auto-pass eligible? |
|---|---|---|
| `pass` | The datasheet demonstrably meets the spec: brand/model reconciled (if named), every quantitative requirement satisfied with reconciled units, supporting quote located, no conflicting text. | Yes, if all 8 conditions in [ADR-SOC-AUTO-PASS-POLICY](adr/ADR-SOC-AUTO-PASS-POLICY.md) hold. |
| `better` | `pass`, **and** the datasheet strictly exceeds the spec on ≥ 1 comparable dimension (e.g. spec "≥ 8 MP", datasheet "12 MP"). | Yes, same conditions. |
| `needs_review` | Plausibly compliant but ≥ 1 auto-pass condition is missing/ambiguous (prose-only match, unit not reconciled, only a vendor declaration, OCR uncertainty, brand named but not found, ...). | No — human must decide. |
| `insufficient_evidence` | Cited page(s) absent, out of range, blank/too short even after OCR, or clearly about a different product/topic. Replaces the old `not_found` + `unverifiable` + page-out-of-range `mismatch`. | No. |
| `conflict` | The evaluated evidence **contradicts** the spec: a lower/worse value for the same requirement, an explicit "not supported" / "ไม่รองรับ" / "excluded" / disclaimer, or a mutually exclusive option. | No — must be surfaced prominently. |

`keywordMatch` values (renamed, display-only, never a pass signal): `keyword_match`
("พบคำที่เกี่ยวข้อง"), `low_overlap`, `not_found`, `unreadable_page`.

## Confidence

`confidence` is an engine's self-reported certainty (`low` / `medium` / `high`). It is **not** a
verdict and **not** a compliance signal. Policy: `confidence = high` never implies `pass`. UI
must not colour or gate rows by confidence.

## Comparator semantics

Requirements carry a comparator, often in words. Normalisation maps them to an operator:

| Phrase (TH / EN) | Operator | Pass when |
|---|---|---|
| "ไม่น้อยกว่า", "อย่างน้อย", "ตั้งแต่ ... ขึ้นไป", "no less than", "at least", "minimum", "≥" | `>=` | evidence value ≥ claim value |
| "ไม่เกิน", "ไม่มากกว่า", "สูงสุด", "up to", "maximum", "no more than", "≤" | `<=` | evidence value ≤ claim value |
| "ระหว่าง X ถึง Y", "X–Y", "between X and Y", a range | `in_range` | claim range ⊆ evidence range, or evidence point ∈ claim range (per requirement wording) |
| exact value, no qualifier | `eq` | values equal after normalisation (tolerance per unit family) |
| "เท่ากับหรือมากกว่า", "หรือดีกว่า", "or better", "or higher" | `>=` and eligible for `better` | as `>=`; flag `better` if strictly greater |

`better` direction is per **dimension**: more pixels/GB/ports/Gbps/hours = better; **less**
power draw / latency / weight / temperature-floor = better. The direction table lives with the
rule engine and is unit-keyed.

## Number & unit normalisation

Before comparison, both claim and evidence quantities are normalised:

- **Thousands separators / decimals:** `32,768` → `32768`; `2.5` stays `2.5`; Thai digits
  `๓๐` → `30`.
- **Unit-attached vs spaced:** `1090MHz` = `1090 MHz` = `1,090 MHz`.
- **Dimensions:** `2,688×1,520`, `2688 (H) × 1520 (V)`, `3840(H)x2160(V)`, `2688 x 1520 pixels`
  → ordered tuple `(2688, 1520)`; compare per-axis.
- **Unit families & canonical unit** (compare only within a family; convert to canonical):
  - data rate: bps → `Mbps` (`1 Gbps = 1000 Mbps`)
  - frequency: Hz → `MHz`
  - capacity/memory: bytes → `GB` (`1 TB = 1024 GB` for storage claims unless the doc uses
    decimal; record which)
  - pixels: keep as count and as `MP` (`8 MP ≈ 3840×2160`; treat `≥ 8 MP` and `3840×2160` as
    the same requirement family)
  - power: `W`; temperature: `°C` (parse ranges `-40 - +85°C`, `-40°C to 85°C`, `−40…+85 ℃`)
  - counts (ports, cores, units, channels): dimensionless integer; `"จำนวน 2 ช่อง"`,
    `"2 ports"`, `"×2"`, `"Two ... ports"` all → `2`
  - time: `s` (`<1s`, `< 1 second`, `warm start：<1s`)
- **Tolerance:** `eq` comparisons use a small per-family tolerance (e.g. 0 for integer counts,
  ±0.5% for advertised frequencies) recorded in the rule config.
- Every normalisation keeps the **original string** in the evidence blob for the reviewer.

## Negation / refusal / exclusion cues → `conflict`

TH: "ไม่รองรับ", "ไม่สามารถ", "ยกเว้น", "ไม่มี", "ไม่ได้".
EN: "not supported", "does not support", "N/A", "unsupported", "excluded", "not available",
"is not", "cannot", "no <feature>", disclaimer/footnote patterns ("does not reflect ...",
"subject to ...").
A negation cue on the same requirement subject as the claim → `conflict`, not `needs_review`.

## Thai ↔ English handling

- The common case is a **Thai claim** against an **English datasheet**. Prose-to-prose keyword
  overlap collapses; this is the main source of false-`review` today.
- Strategy: extract the **language-independent signal** first — numbers+units+comparators, brand,
  model, port counts, standards codes (`802.11be`, `RTCA DO-260`, `EN 62676-4`, `DF17`), and
  loanwords embedded in Thai ("Redundant", "Hot Swap", "SFP", "VLAN"). Compare those.
- For genuinely prose requirements with no extractable signal, translate the claim to the
  datasheet language for the AI path only, keep the result as `needs_review` unless the numeric
  path also passes.

## Multi-page evidence

A row may cite several pages. Evaluate **each page independently** → per-page
`{ usable: bool, evidenceQuote, numbers, sourceType, fidelity, conflictCues }`. Merge:
- usable pages contribute evidence;
- a blank/thin page is simply dropped (no poisoning);
- `conflict` on any usable page wins over `pass` from another;
- if **no** page is usable → `insufficient_evidence`.

## Highlight location

For each evidence quote: `{ page, bbox: [x0,y0,x1,y1] }` (from the PDF text layer / OCR word
boxes) or `{ page, charRange: [start, end] }` against the extracted page text. Used to jump the
reviewer straight to the sentence and (later) to render a highlighted preview.
