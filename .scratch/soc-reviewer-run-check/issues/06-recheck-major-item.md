# 06: Re-check a major item (replace with audit)

**What to build:** Importing again for a major item that already has results replaces its rows in one transaction and copies the replaced rows into an audit event. If any replaced row already has a Final Decision, the import returns a warning listing those rows, and goes ahead only after the user explicitly confirms "แทนที่แถวที่ยืนยันแล้ว".

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A re-import replaces only that major item's rows; other major items are untouched
- [ ] The replaced rows are recoverable from the audit event
- [ ] A re-import over confirmed rows warns and writes nothing without the confirmation flag, and succeeds with it
- [ ] Tests cover all three cases; lint, typecheck and build pass

## Comments
