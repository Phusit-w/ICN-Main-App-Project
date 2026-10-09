# 03: Gate + upload

**What to do:** Check that Compact Results keeps quality and cuts output, then upload the package and confirm on a live run. Criteria: `../spec.md` decision 7.

**Blocked by:** 01, 02

**Status:** ready-for-agent

## Steps

1. `claude -p` runs with the Runner's flags (`../soc-evidence-packet/fixtures/11-slim/run_runner.py`, pointed at the new package; fixtures under `fixtures/03-gate/`), packet on, quota read by the user before/after each:
   - ๕.๕ on the **original** SOC (not R1).
   - ๕.๘ on R1.
   - ๕.๕ old flow (`SOC_RUNNER_PACKET=0`): still writes full results.json, validator 0 issues.
2. Score against the keys; count output size (results builder `Write` chars) and units.
3. If quality passes: upload the package (user), deploy if HEADLESS changed, then one ๕.๘ live run alone in the queue; compare with 01.

## Acceptance

- [ ] ๕.๕ original: 02 key (ref 22 match / 2 mismatch ๒.๑ + ๒.๘ / ๕.๕ n/a), ๑.๕ and ๒.๒ `non_compliant` with the DS value in `tor_decision_basis`, ๑.๓ `partial_visible`, ๑.๒ names the Zebra letter.
- [ ] ๕.๘ R1: 171→p.43, 172→p.47/54, 177→p.34/37, 190→p.5, 193 no AMS licence doc.
- [ ] Every row with a TOR threshold quotes a datasheet value in `tor_decision_basis` (no bare "ตรงตาม TOR").
- [ ] Validator 0 issues; import accepted.
- [ ] Output tokens −35% or more; ๕.๘ live units −15% or more vs 01. Quota points recorded as a cross-check (accept even if they don't move).
- [ ] Any quality miss → roll back to `2026-10-09-slim` and note why.

## Comments
