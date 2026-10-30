# 07: รอคนรับ

**What to build:** A user without a SOC Runner (or one who chooses "ขอให้คนอื่นตรวจแทน") sends AI work to รอคนรับ. Users with a Runner see a count on the SOC menu and a รอคนรับ list (Proposal, step, major item, rows, asker, time), take one major item or "รับทั้งชุด" by their own click after a quota popup, and it runs on their Runner only. Asker sees "ข รับแล้ว", can cancel before the run; a quiet taker's request returns to รอคนรับ; results record "ขอโดย · ตรวจโดย". Works for ตรวจหลักฐาน and the TOR Match judge. ADR 0013; spec stories 73–85.

**Blocked by:** 06

**Status:** done 2026-10-30 in code and tests (test/soc-check-waiting.test.ts, 8 tests); browser check (light/dark/narrow) NOT done; not deployed (no deploy until the whole Proposal build set is finished)

- [x] Check Request gains taker + "sent to รอคนรับ"; claim rule: taker's Runner, or asker's own Runner when not sent; nothing takes automatically (no API, flag or background process).
- [x] Take action requires the taker's active Runner Link and an explicit confirm; whole-SOC take takes every open request of that set.
- [x] Stale taker (existing stale time) → back to รอคนรับ, taker cleared; asker or ADMIN cancel before running; no expiry.
- [x] Imported results record asker and taker; review page shows both.
- [x] SOC menu count and list for Runner users; รอคนรับ panel on the Proposal page with cancel; own-Runner flow unchanged.
- [x] Tests at seam B (prior art `test/soc-check-requests.test.ts`, `test/soc-tor-judge.test.ts`, `test/soc-runner-link.test.ts`). Browser check.

## How it was built (2026-10-30)

- Migration `20261030130000_check_request_waiting`: `SocCheckRequest.waiting`, `takerId`, `takenAt` (relations to User named Asker / Taker).
- `lib/soc-check-requests.ts`: `heldBy(userId)` = own requests not sent away, or taken by the user; used by the claim rule, `claimedRequest` (so only the taker's Runner downloads files, reports and submits), the heartbeat's cancelled / quota-paused lists. `takeCheckRequests` (one, or every waiting request of a job): refused without `confirmed`, without an online Runner of the taker, or for what the taker's Runner version can't carry; no API route takes. `releaseStaleCheckRequests` clears the taker of a quiet or never-claiming one; no expiry. `waitingCheckRequests` / `proposalWaitingRequests` / `waitingCheckRequestCount` for the pages.
- Asking: a user with no Runner always sends to รอคนรับ; with a Runner the confirm popup has a second button ขอให้คนอื่นตรวจแทน (job page ตรวจ and ตรวจทั้งชุด, TOR Match judge). The review page's "ตรวจใหม่ N แถว" has no choice (a user without a Runner still goes to รอคนรับ).
- Results: the import already stored `requestedById` and `ranById` on the major item; the job page now shows "ขอโดย ก · ตรวจโดย ข (บัญชีของ ข)" when they differ.
- Pages: `/soc/waiting` (tab with the count for users with a Runner; take and รับทั้งชุด behind a quota popup), a รอคนรับ panel on the Proposal page with cancel.

## Open points

- The Runner itself is unchanged (it asks the same claim route), so no Runner version bump.
- Row re-check (ส่งให้ Claude ตรวจใหม่) and the กรอกอ้างอิง AI request kind (ticket 10) don't offer ขอให้คนอื่นตรวจแทน yet.
