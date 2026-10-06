# 09: PDF evidence panel with highlights

**What to build:** When a row is expanded, the review page shows the rendered cited PDF page(s), with the highlights the skill reported, next to the TOR text, the bidder's text, the Declared Selection and the System Recommendation. Rendering happens on the server from the job's stored evidence (a deterministic render, not AI). Only users with `soc` access can fetch the images.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] The cited page renders for a typical row, and the highlight regions are visible
- [ ] Multi-page citations can be paged through
- [ ] A missing or unreadable page shows a clear Thai message instead of breaking the page
- [ ] Image fetching is access-checked; browser-verified; lint, typecheck and build pass

## Comments
