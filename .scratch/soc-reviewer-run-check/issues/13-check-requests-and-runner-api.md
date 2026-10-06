# 13: Check Requests and the runner API (seam 2)

**What to build:** On an imported job, a user clicks ตรวจ on a major item or ตรวจทั้งชุด for every unchecked one. This creates Check Requests owned by that user, and they can cancel a request that hasn't started. A token-authenticated API lets the runner claim the oldest request belonging to its own user, download the job's SOC and evidence plus the current skill package, report progress, and submit results through the import from ticket 05 (source = runner). A request whose runner stops sending heartbeats returns to `requested`. The major item shows its state, including "รอเครื่องของคุณเปิด" when the owner's runner is offline.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05, 11, 12

**Status:** ready-for-agent

- [ ] A token for user A can never claim, download or report on user B's requests (tested)
- [ ] Claims are oldest first; cancel works before a claim
- [ ] Submit goes through the ticket 05 import, and invalid results are rejected the same way
- [ ] A stale claim returns to `requested`
- [ ] Every state shows on the major item in Thai
- [ ] Audited; lint, typecheck and build pass

## Comments
