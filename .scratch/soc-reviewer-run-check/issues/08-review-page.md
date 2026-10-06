# 08: Build the new review page

**What to build:** Replace the `/soc/[id]` layout for imported jobs with the layout chosen in ticket 07. Each row shows its overall status, derived when read and never stored. Problem rows come first. Rows can be filtered by status and by major item. A row expands to show every axis with Thai labels. A reviewer sets the Final Decision and a note per row, stored separately from the System Recommendation. Any `soc` user may confirm, including the person who ran the check. There is no bulk confirm. A banner shows on major items checked with missing documents. The PDF side panel is ticket 09; leave a slot for it.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05, 07

**Status:** ready-for-agent

- [ ] The overall status follows the rule agreed in ticket 07, and a test covers the derivation
- [ ] The ordering and both filters work
- [ ] A Final Decision plus note saves, is audited, and is shown separately from the recommendation
- [ ] No affordance confirms more than one row at a time
- [ ] A major item shows `confirmed` when all its rows have a Final Decision
- [ ] Checked in a browser against a real imported job; lint, typecheck and build pass

## Comments
