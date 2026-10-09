# SOC output tokens: spec (grilled 2026-10-09)

Follow-up to `../soc-evidence-packet/issues/11-shrink-skill-docs.md`, which cut the skill docs a Runner run reads (context −68% on live ๕.๕) but left the quota meter at 8 pts. Its closing breakdown ("where the quota still goes") is the input here.

## Problem

After ticket 11, **output** is the biggest cost share of a packet-flow run (live ๕.๕ slim: read 17% / cache write 39% / **output 44%** of API-equivalent units). The output is almost all one `Write`: the results builder script Claude writes (live ๕.๕: 28.8k chars). Much of it is text the Evidence Packet already knows, or text repeated across fields:

- ๕.๕ field share of results.json characters: `tor_claim_results` 17% (stored, shown nowhere on the web), `reference` 16% (copy of the SOC cell), `reference_detail` 13%, `evidence_detail` 11%, `highlight_evidence` 8%, `key_issue` 7%, `reference_file` 4%.
- Rows that pass on every axis still get a full explanation in every field.

## Decisions (2026-10-09)

Vocabulary: **Evidence Packet** and **Compact Results** are in `docs/SOC-DOMAIN-GLOSSARY.md`.

1. **Measure:** API-equivalent units (`../soc-evidence-packet/fixtures/11-slim/cost_breakdown.py`, weights input 1, cache write 1.25, cache read 0.1, output 5) and output tokens from Runner session logs are the meter; quota points are a cross-check. A ๕.๘ live run on the slim skill is the baseline (ticket 01), because the meter's 1-point step hides changes on small items like ๕.๕.
2. **Scope:** Compact Results is the main ticket. Stable prompt prefix (cross-run cache hits) is a separate spike. A smaller model (Haiku) is deferred.
3. **`tor_claim_results`:** Claude no longer writes it; the expand script writes `[]` (the import's required-field check treats `[]` as present, so the server needs no change). The per-condition comparison moves into `tor_decision_basis`, which the review page shows: one line per condition, `เงื่อนไข: ค่าใน DS (หน้า X) → ผล`. **A row whose offer copies the TOR must still quote the datasheet value**, never just "ตรงตาม TOR", so rule 8 (SOC value ≠ DS → `non_compliant`) keeps its evidence. The user's concern: offers often copy the TOR word for word while the cited datasheet says something else.
4. **Who expands:** a new skill script reads `job.json` and turns Compact Results into the full results.json before the validator and the append step, which stay as they are. It fills `row`/`item`, `reference` (raw SOC cell), `declared_status` + `declared_status_check` (from `tick_signals`), `reference_file` when the row has one candidate file, the n/a fields of heading rows, `tor_claim_results: []`, and standard wording for pass rows (5). Server contract, manual import (still both files, decided 2026-10-08) and the Runner are unchanged; no `RUNNER_VERSION` bump. HEADLESS.md (`lib/soc-skill-headless.ts`) may need a line for the new step: a repo change, deploy only.
5. **Pass on every axis** = `reference_check: match`, `item_label_check: match`, `highlight_check: complete`, `evidence_support: fully_supported`, `tor_decision` `compliant` or `not_applicable` (added in 03: a heading row that cites only a folder and has no criteria may also have `reference_check`/`evidence_support` `not_applicable`). For those rows the script writes:
   - `reference_detail`: `{ไฟล์} หน้า {หน้า} ตรงหัวข้อ`
   - `highlight_evidence`: `Highlight ครอบข้อความที่ตรวจครบ`
   - `evidence_detail`: `-` (the basis is already shown)
   - `detail`, `key_issue`: `ผ่าน`

   Claude writes only `tor_decision_basis` (and `verified_value`/`tor_threshold` where there is a threshold) and `confidence`.
   Rows near the line write only the field their rule demands, the rest standard: `partial_visible` → `highlight_evidence` (rule 11: which words aren't highlighted, seen on which row); a file picked among several candidates → `reference_detail` (P5: how it was picked); `better` → `tor_decision_basis` says what is better.
   Rows with a problem write every field in full, but **no text repeated across fields**.
6. **Packet flow only.** The old flow (no packet, no `job.json`) and interactive use keep writing full results.json.
7. **Gate:** quality on `claude -p` runs with the Runner's flags: ๕.๕ on the **original** SOC (02 key: ๑.๕ and ๒.๒ `non_compliant`, ๑.๓ `partial_visible`, ๑.๒ names the Zebra letter; live ๕.๕ uses R1, which already fixed ๑.๕/๒.๒, so it doesn't exercise rule 8) and ๕.๘ R1 (171→p.43, 172→p.47/54, 177→p.34/37, 190→p.5, 193 no AMS licence doc). Size: output tokens −35% or more, ๕.๘ units −15% or more vs ticket 01's baseline. Quality passes and units meet the target → accept even if quota points don't move. Any quality miss → roll back.
8. No ADR: the change lives in the skill and is easy to reverse.

## Out of scope

- Haiku per item (accuracy risk; only behind a gate against the keys).
- Shortening `job.md` (ticket 11 item 6, not done).
