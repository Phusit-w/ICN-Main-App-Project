# SOC Accuracy Acceptance

The benchmark that `rule_semantic` and `ai_semantic` must clear before an auto-pass affordance
is enabled in the UI. Referenced by [ADR-SOC-SEMANTIC-REVIEW](adr/ADR-SOC-SEMANTIC-REVIEW.md) and
[ADR-SOC-AUTO-PASS-POLICY](adr/ADR-SOC-AUTO-PASS-POLICY.md).

## 1. Baseline (keyword layer, 2026-08-31)

Stratified sample of 81 rows from one real job (`Udon CASRI-H3C`, SOC 327 rows / datasheet 287
pages). Worksheet + scripts: session scratchpad `accuracy_worksheet.txt`, `accuracy_uat.py`,
`uat_downloads.py` (to be committed under `soc-worker/benchmark/` as the first labelled set).

| Metric (keyword `match` read as "pass") | Baseline |
|---|---|
| `match` precision — cited page on-topic | ~93% |
| `match` precision — independently substantiates the value | ~80% |
| Confirmed false-auto-pass | 0 / 30 (but the heuristic *cannot* detect the "worse value" kind) |
| "Soft pass" (`match` w/o independent evidence — reviewer must still open) | ~17% |
| False-`review` (datasheet clearly meets the spec, flagged review) | ~32% clear (≤ ~63% incl. borderline) |
| Page-reference accuracy (right page for the topic) | ~92% |
| `not_found` accuracy | 100% (11/11) |
| Brand/model verification | effectively non-functional |
| `conflict` detection | not possible (no comparison) |

## 2. Gold set

- **Source:** the 2026-08-31 sample, expanded. Target **≥ 300 labelled rows** spanning ≥ 3 real
  jobs / different product domains (camera, network, server, display, tablet, certificate-only).
- **Label per row** (human, double-checked): `gold_verdict` ∈ {`pass`,`better`,`needs_review`,
  `insufficient_evidence`,`conflict`}, plus the supporting `{file, page, socQuote, evidenceQuote,
  brandModel, numbers, sourceType}` where a verdict is `pass`/`better`/`conflict`.
- **Must include, by construction:**
  - ≥ 30 true `pass` (verbatim + numeric)
  - ≥ 20 true `better` (datasheet exceeds spec)
  - ≥ 20 true `conflict` — including **planted** cases: spec "≥ 8 MP" vs datasheet "4 MP",
    spec "2 ports" vs "1 port", an explicit "not supported", a disclaimer that negates the claim
  - ≥ 30 `needs_review` (prose-only, ambiguous units, vendor-declaration-only)
  - ≥ 20 `insufficient_evidence` (blank page, OCR-fail, wrong topic, out-of-range page)
  - ≥ 20 Thai-claim / English-datasheet rows across the above
  - ≥ 15 vendor-declaration / circular-evidence rows (must NOT become `pass` on the declaration
    alone)
  - ≥ 15 scanned-page rows (OCR path)
- Stored as JSONL under `soc-worker/benchmark/gold/`, with a `datasets.md` describing provenance
  and redaction (no real pricing / customer data beyond what the public brochures contain).

## 3. Metrics

Computed by `soc-worker/benchmark/run.py` for each engine (`keyword`, `rule_semantic`,
`ai_semantic`) against the gold set. Confusion matrix over the 5 semantic verdicts, plus:

| Metric | Definition |
|---|---|
| **auto_pass_precision** | of rows the engine would auto-pass (`pass`/`better` **and** all 8 conditions met), fraction whose `gold_verdict` ∈ {`pass`,`better`} |
| **false_auto_pass_count / rate** | rows the engine would auto-pass whose `gold_verdict` ∈ {`conflict`,`needs_review`,`insufficient_evidence`}. **The number that gates the UI switch.** |
| **conflict_recall** | of gold `conflict` rows, fraction the engine labels `conflict` (never auto-passed) |
| **conflict_miss_as_pass** | gold `conflict` rows the engine would auto-pass — subset of false_auto_pass; must be **0** |
| **needs_review_rate** | fraction of all rows sent to `needs_review` (review workload proxy) |
| **false_review_rate** | of gold `pass`/`better` rows, fraction the engine sends to `needs_review` (over-caution) |
| **page_reference_accuracy** | of rows with a usable citation, fraction where the engine's chosen evidence page matches the gold page |
| **brand_model_accuracy** | of gold rows naming a brand/model, fraction the engine correctly reconciles (or correctly flags "model not found") |
| **number_parse_accuracy** | of gold rows with a quantitative requirement, fraction where the engine extracts the value+unit+comparator matching the gold annotation |
| **schema_valid_rate** | fraction of engine outputs that validate against `semantic_result.schema.json` (must be 100%) |
| **ocr_yield** | of gold scanned rows, fraction where OCR produced usable text |

## 4. Acceptance thresholds — enable auto-pass in the UI only when ALL hold for `rule_semantic`

| Metric | Threshold |
|---|---|
| `false_auto_pass_rate` | **0** on the gold set (hard gate) |
| `conflict_miss_as_pass` | **0** (hard gate) |
| `conflict_recall` | ≥ 0.95 |
| `auto_pass_precision` | ≥ 0.99 |
| `schema_valid_rate` | 1.00 |
| `false_review_rate` | ≤ 0.15 (down from the ~0.32 keyword baseline) |
| `page_reference_accuracy` | ≥ 0.95 |
| `number_parse_accuracy` | ≥ 0.95 |
| `brand_model_accuracy` | ≥ 0.90 |
| Coverage | benchmark run on ≥ 300 rows / ≥ 3 jobs; results reproducible from committed data |
| Sign-off | a named human reviews the benchmark report and approves in the enabling PR |

`ai_semantic` is held to the same table. Until it clears it, the AI verdict is advisory only and
the UI shows `rule_semantic`.

## 5. A/B procedure

1. Freeze the gold set (`gold/vN/`). Record engine versions and `SOC_AI_PROVIDER`.
2. `run.py --engine keyword|rule_semantic|ai_semantic --gold gold/vN` → per-engine metrics JSON +
   a Markdown report under `benchmark/reports/`.
3. Compare rule_semantic and ai_semantic **against keyword and against each other**; every
   regression vs keyword on any metric must be explained in the report.
4. Re-run on each change to the engines or normalisation config; the report is a required PR
   artefact for changes to `soc-worker/` semantic code.
5. When thresholds are met: a dedicated PR (not this feature branch's merge) enables the UI
   affordance, links the passing report, and adds the `ROW_AUTO_PASSED` audit path.

## 6. Non-goals for this benchmark

- It does not certify the tool as a substitute for human compliance judgement. Even at 100% on
  this set, reviewers still see every `needs_review`/`conflict` and can override any `pass`.
- It does not measure legal sufficiency of evidence, only whether the engine's verdict matches a
  careful human's reading of the same pages.
