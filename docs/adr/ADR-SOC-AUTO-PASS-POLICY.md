# ADR: SOC Auto-Pass Policy

- **Status:** Proposed
- **Date:** 2026-08-31
- **Branch:** `feature/soc-semantic-review`
- **Related:** [ADR-SOC-SEMANTIC-REVIEW](ADR-SOC-SEMANTIC-REVIEW.md), [SOC-ACCURACY-ACCEPTANCE](../SOC-ACCURACY-ACCEPTANCE.md), [SOC-DOMAIN-GLOSSARY](../SOC-DOMAIN-GLOSSARY.md)

## Context

"Auto-pass" means: a SOC row is marked done **without a human opening and reading it**, e.g. a
"confirm all passing rows" action, or hiding `pass` rows from the review queue.

Today there is no auto-pass — the reviewer opens every row — but the keyword `match` verdict is
already being treated *informally* as "safe to skim". The accuracy UAT showed why that is unsafe:
the keyword layer cannot compare numbers, is fooled by the vendor's own certification letter, and
its `confidence = high` is assigned precisely to the rows it **could not** verify.

Before any auto-pass affordance exists in the UI, the rules for when the system is allowed to
assert "pass" without a human must be written down and tied to a measured benchmark.

## Decision

### Principle

> **Auto-pass is earned by the completeness and correctness of the evidence, never by the
> model's self-reported confidence.**

A `confidence: high` (from any engine) is **not** a pass signal. It is metadata about the
engine's certainty, not about whether the datasheet meets the spec. Where the current worker
emits `confidence = high` it usually means "confidently unable to verify" — the opposite of a
pass. New UI copy must not present confidence as a compliance indicator.

### Auto-pass eligibility — ALL of the following must be present

A row may be auto-passed (verdict `pass` or `better`, and eligible to be treated as "done"
without human review) only when the semantic result contains **every** one of:

1. **Evidence file name** — the exact stored datasheet file the evidence came from.
2. **A real page** — a page number that exists in that file (1 ≤ page ≤ pageCount) and yielded
   usable text (native extraction, or OCR that parsed cleanly).
3. **SOC quote** — the verbatim span of the SOC claim being checked.
4. **Evidence quote** — the verbatim span from the datasheet page that supports it.
5. **Brand/model match** — for rows that name a brand/model, the same brand *and* model
   appears in the evidence (normalised); for rows that name no brand/model, this condition is
   marked `not_applicable` and still counts as satisfied.
6. **Comparable numbers and units** — every quantitative requirement in the claim has a
   corresponding quantity in the evidence, with units reconciled and the comparator
   (`≥` / `≤` / range / exact) evaluated to true. If the claim has no quantitative part, this
   condition is `not_applicable` and satisfied.
7. **Highlight location** — a concrete location for the evidence quote (page + bounding box, or
   page + character range) so a reviewer can be taken straight to it.
8. **No conflicting text** — the evaluated pages contain no negation, refusal, exclusion, or
   lower/contradictory value for the same requirement.

Missing, ambiguous, or unverifiable on **any single** condition → verdict is downgraded to
`needs_review` (or `insufficient_evidence` / `conflict` as appropriate). There is no partial
auto-pass.

### Extra guards

- **Vendor declaration pages do not count as evidence** for conditions 3–8. A `pass`/`better`
  requires ≥ 1 independent datasheet page. (See [SOC-DOMAIN-GLOSSARY](../SOC-DOMAIN-GLOSSARY.md)
  §Circular evidence.)
- **OCR-only evidence** (`fidelity: "ocr"`) may support `pass` **only** when the numeric/brand
  match is exact and unambiguous; otherwise it caps at `needs_review`.
- **`better`** is `pass` plus a strictly-exceeds relation on at least one comparable dimension,
  with the same 8 conditions met.
- **Thai claim / English evidence** is allowed for auto-pass *only* through the numeric + brand
  path (conditions 5–6); a purely prose Thai claim matched to English prose evidence is
  `needs_review` regardless of engine confidence.

### UI gating

- The auto-pass affordance (any "confirm all pass rows" / hide-passed control) ships **disabled**
  and is enabled only by a **separate, explicit PR** after:
  - `rule_semantic` clears every threshold in
    [SOC-ACCURACY-ACCEPTANCE](../SOC-ACCURACY-ACCEPTANCE.md) on the labelled gold set, **and**
  - the **false-auto-pass rate is 0** on the gold set (a single missed `conflict` that would have
    been auto-passed blocks the switch), **and**
  - a named human owner signs off on the benchmark report.
- Until then: all rows remain in the review queue; `pass`/`better` are shown as
  recommendations with their evidence, not as completed work.
- The reviewer's manual confirmation flow (`acceptAllSocResults`, `confirmSocJob`) is unchanged
  and always available; auto-pass never removes the ability to review.

### Audit

- Every auto-pass (once enabled) writes a `SocAuditEvent` `ROW_AUTO_PASSED` with the engine, the
  8-condition evidence blob, and the benchmark version that authorised it.
- Turning the UI switch on/off writes an `AuditLog` entry naming the actor and the benchmark run.

## Consequences

- Conservative by construction: the system will mark many genuinely-compliant rows
  `needs_review` (low recall on `pass`) rather than risk one false auto-pass. That is the
  intended trade-off for a procurement-compliance tool.
- The 8-condition contract is also the schema the semantic engines must fill
  (`semantic_result.schema.json`), so "can we auto-pass this?" is a pure function of a validated
  object, not a judgement call at review time.
- Reviewers still read everything at launch; the value is a defensible verdict + one-click jump
  to the evidence, and a measured path to reducing review load later.
