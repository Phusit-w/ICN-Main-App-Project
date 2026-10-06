# ADR: SOC Semantic Review Layer

- **Status:** Superseded by [ADR 0008](0008-soc-check-runs-on-reviewer-machine.md) (2026-10-06). Checks now run in Claude on each reviewer's machine, and the server runs no rule-based pre-check. The `rule_semantic` work is parked on branch `parked/soc-server-worker-2026-10-06`.
- **Date:** 2026-08-31
- **Branch:** `feature/soc-semantic-review` (off `codex-wip/admin-soc-2026-08-28`)
- **Related:** [ADR-SOC-AUTO-PASS-POLICY](ADR-SOC-AUTO-PASS-POLICY.md), [SOC-DOMAIN-GLOSSARY](../SOC-DOMAIN-GLOSSARY.md), [SOC-ACCURACY-ACCEPTANCE](../SOC-ACCURACY-ACCEPTANCE.md), [SOC-COMPLIANCE](../SOC-COMPLIANCE.md)

## Context

The SOC checker (`soc-worker/worker.py`, `deterministic_review`) currently classifies each SOC
row with a **keyword-overlap heuristic**: it tokenises the SOC claim text and the text of the
cited datasheet page(s), computes `overlap = |claim_terms ∩ page_terms| / |claim_terms|`, and maps
that to `match` (≥ 0.45), `review`, `not_found`, `unverifiable`, `mismatch`. The external AI
provider is disabled by default and `build_provider()` always returns `DisabledProvider`.

A structured accuracy UAT (2026-08-31, 81-row stratified sample against a real SOC + 287-page
datasheet — see [SOC-ACCURACY-ACCEPTANCE](../SOC-ACCURACY-ACCEPTANCE.md) for the worksheet) found:

| Observation | Evidence |
|---|---|
| `match` precision ~93% "cited page on-topic", ~80% "independently substantiates the value" | short verbatim claims match well; the shortfall is numeric-value claims and circular pages |
| **0 confirmed false-auto-pass**, but the heuristic **cannot** detect one | it never compares numbers/units/ranges — a datasheet listing a *worse* value than the spec still scores `match` |
| ~17% of `match` rows are "soft pass" — not backed by independent evidence | a diligent reviewer must still open every one |
| **~32% false-`review`** (up to ~63% incl. borderline) | Thai claim vs English datasheet; number formatting `1090MHz` ≠ `1090 MHz`, `32,768` ≠ `32768`, `2,688×1,520` ≠ `2688 (H) × 1520 (V)` defeats the tokeniser |
| Multi-page poisoning | if a row cites several pages and **any** one has < 30 extractable chars, the whole row → `unverifiable`, discarding good pages |
| Circular evidence | rows that cite the vendor's own compliance-certification letter as a "reference page" score ~100% overlap — the tool matches the requirement text to itself |
| `confidence = high` is misleading | it is only ever assigned to `not_found` / section-heading / page-out-of-range — never to a keyword match. "high" means "confidently cannot verify", not "confidently compliant" |
| `mismatch` never means "datasheet contradicts spec" | it is only emitted when a cited page number exceeds the PDF page count |
| Brand/model verification is effectively non-functional | model-number rows resolve to `not_found` / `unverifiable` (scanned pages) / a match on the brand word alone |
| Scanned/image datasheet pages (common: model spec sheets, certificates) yield no text | → `unverifiable`; the tool adds no value on those rows |

The keyword layer is a useful **citation sanity check** but is being read by reviewers as a
compliance signal, which it is not (and `SOC-COMPLIANCE.md` already states the tool "ไม่ตัดสิน
Comply/Better/Non-compliant").

## Decision

Add a **semantic review layer** alongside — not replacing — the keyword layer.

1. **Rename the existing result.** The keyword-overlap output is stored and displayed as
   `keyword_match` ("พบคำที่เกี่ยวข้อง" / "found related terms"). It is **never** labelled
   `pass`, `ผ่าน`, `match`, or shown with a green "compliant" affordance.

2. **New per-row semantic verdict** with exactly these values (see
   [SOC-DOMAIN-GLOSSARY](../SOC-DOMAIN-GLOSSARY.md) for precise definitions):
   - `pass` — the datasheet demonstrably meets the spec
   - `better` — the datasheet meets *and exceeds* the spec on a comparable dimension
   - `needs_review` — plausible but at least one auto-pass precondition is missing
   - `insufficient_evidence` — cited page(s) unreadable / absent / not about this claim
   - `conflict` — the datasheet states something that contradicts the spec (e.g. a lower value,
     an explicit "not supported", a disclaimer/exclusion)

3. **Evidence-driven comparison, not string overlap.** The semantic layer must:
   - extract numeric quantities with **units and comparators** from both the SOC claim and the
     evidence, normalise them (`docs/SOC-DOMAIN-GLOSSARY.md` §Normalisation), and compare
     (`≥`, `≤`, range membership, "ไม่น้อยกว่า" / "ไม่เกิน" / "no less than" / "up to");
   - work across **Thai ↔ English** (claim in Thai, datasheet in English is the common case);
   - detect **negation / refusal / exclusion** phrases and route them to `conflict`.

4. **Per-page evidence, then merge.** Evaluate each cited page independently, keep only the
   pages that yield usable evidence, and merge. One thin/blank page never poisons the row.

5. **Separate independent evidence from vendor declarations.** A page is tagged
   `vendor_declaration` when it is the bidder's own certification/รับรอง letter (heuristics:
   letterhead, "หนังสือรับรองผลิตภัณฑ์", restates SOC clause numbers verbatim, signature block).
   `pass`/`better` require **at least one non-declaration page** as evidence; a declaration page
   alone → `needs_review`.

6. **OCR for scanned PDFs.** Pages with < N extractable chars are sent through OCR
   (Thai + English) before evaluation. OCR text is marked `low_fidelity` and can support
   `needs_review` / `insufficient_evidence` but **not** an unattended `pass` unless the numeric
   evidence is unambiguous.

7. **Structured output + schema.** The semantic layer (rule-based and AI) emits a single JSON
   object per row that MUST validate against `soc-worker/schemas/semantic_result.schema.json`.
   Invalid output is treated as `insufficient_evidence` and logged.

8. **Rule-based and AI results are stored separately.** Two engines run per row:
   - `rule_semantic` — deterministic Python (number/unit/negation parsing, no LLM)
   - `ai_semantic` — the provider behind `SOC_AI_PROVIDER`, still fail-closed
   Both are persisted next to `keyword_match` for A/B benchmarking. The UI shows the
   **rule_semantic** verdict; the AI verdict is advisory until it clears the benchmark.

9. **Auto-pass stays OFF in the UI** (no row is hidden from the reviewer, no "confirm all"
   shortcut treats `pass` as done) until the benchmark in
   [SOC-ACCURACY-ACCEPTANCE](../SOC-ACCURACY-ACCEPTANCE.md) is met. See
   [ADR-SOC-AUTO-PASS-POLICY](ADR-SOC-AUTO-PASS-POLICY.md).

**Key principle (also in ADR-SOC-AUTO-PASS-POLICY):** `confidence = high` does not mean "pass".
Auto-pass is earned by the **completeness and correctness of the evidence**, not by the model's
self-reported confidence.

## Data model impact

`SocCheckResult` gains (nullable, additive — a migration on the feature branch only):

| column | purpose |
|---|---|
| `keywordMatch` | the renamed former `finalReferenceCheck`-style value (`keyword_match` / `not_found` / ...) |
| `ruleVerdict` | `pass` \| `better` \| `needs_review` \| `insufficient_evidence` \| `conflict` |
| `aiVerdict` | same enum, from `ai_semantic`, nullable |
| `evidence` | JSON: array of `{ file, page, socQuote, evidenceQuote, brandModel, numbers:[{value,unit,comparator}], highlight:{page,bbox|charRange}, sourceType: "datasheet"|"vendor_declaration", fidelity: "text"|"ocr" }` |
| `verdictReason` | short human-readable rationale (shown in the review panel) |
| `benchmarkTag` | set only when the row is part of a labelled gold set |

Existing `final*` columns keep their meaning (the reviewer's decision) and are unchanged.

## Alternatives considered

- **Tune the keyword threshold / tokeniser only.** Rejected: fixes some false-`review` but does
  nothing for numeric comparison, negation, circular evidence, or OCR — the substantive gaps.
- **Replace the keyword layer with the AI outright.** Rejected: no benchmark yet; loses the
  cheap, offline, explainable citation check; provider is fail-closed by policy.
- **Keep AI disabled, do rule-based numeric parsing only.** Adopted as the *first* deliverable
  (`rule_semantic`); AI is layered on and A/B-compared rather than trusted up front.

## Consequences

- More columns, more worker CPU, an OCR dependency (and its model/binary), a schema to maintain.
- Reviewers get a defensible verdict + explicit evidence quotes instead of a raw overlap %.
- Nothing is auto-passed until measured; the change is safe to ship "dark" (verdicts visible,
  no workflow shortcut) and evaluated on real jobs before any auto-pass switch.
- `mismatch` (page-out-of-range) is folded into `insufficient_evidence`; the standalone value is
  retired from new results.

## Rollout

1. Docs (this ADR + the other three) — **done on branch, no code yet.**
2. `rule_semantic` engine + schema + migration + `soc:test` cases. UI shows `keyword_match`
   renamed + `ruleVerdict`, no auto-pass.
3. Labelled gold set + benchmark harness (rule vs keyword). Meet the thresholds in
   SOC-ACCURACY-ACCEPTANCE for `rule_semantic`.
4. `ai_semantic` provider implementation + schema validation + A/B against the gold set.
5. Only if the benchmark passes: a separate ADR/PR to enable an auto-pass affordance in the UI,
   guarded by the policy in ADR-SOC-AUTO-PASS-POLICY.
6. Permanent local PostgreSQL and `update.ps1` / NSSM fixes are **deferred until step 3 passes**
   — no point hardening deployment for logic that has not cleared its benchmark.
