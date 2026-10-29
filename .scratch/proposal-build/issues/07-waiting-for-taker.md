# 07: รอคนรับ

**What to build:** A user without a SOC Runner (or one who chooses "ขอให้คนอื่นตรวจแทน") sends AI work to รอคนรับ. Users with a Runner see a count on the SOC menu and a รอคนรับ list (Proposal, step, major item, rows, asker, time), take one major item or "รับทั้งชุด" by their own click after a quota popup, and it runs on their Runner only. Asker sees "ข รับแล้ว", can cancel before the run; a quiet taker's request returns to รอคนรับ; results record "ขอโดย · ตรวจโดย". Works for ตรวจหลักฐาน and the TOR Match judge. ADR 0013; spec stories 73–85.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Check Request gains taker + "sent to รอคนรับ"; claim rule: taker's Runner, or asker's own Runner when not sent; nothing takes automatically (no API, flag or background process).
- [ ] Take action requires the taker's active Runner Link and an explicit confirm; whole-SOC take takes every open request of that set.
- [ ] Stale taker (existing stale time) → back to รอคนรับ, taker cleared; asker or ADMIN cancel before running; no expiry.
- [ ] Imported results record asker and taker; review page shows both.
- [ ] SOC menu count and list for Runner users; รอคนรับ panel on the Proposal page with cancel; own-Runner flow unchanged.
- [ ] Tests at seam B (prior art `test/soc-check-requests.test.ts`, `test/soc-tor-judge.test.ts`, `test/soc-runner-link.test.ts`). Browser check.
