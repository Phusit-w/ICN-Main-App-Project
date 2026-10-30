# 01: Proposal: รายการ หน้า step และถังขยะ

**What to build:** A SOC user opens `/soc` and lands on the Proposal list, creates a Proposal by title, opens its page and sees the six Proposal Steps as a vertical stepper (spec "Proposal page layout", prototype variant A on branch `prototype/proposal-page`), all ยังไม่ทำ except โครง Content (เร็ว ๆ นี้). The creator or an ADMIN renames it or moves it to the trash; it is purged 30 days later. Old SOC jobs and builds stay reachable in tabs งานตรวจเดิม and สร้าง SOC เดิม; their create buttons are gone. The launcher tile and sidebar read "Proposal & SOC". Spec stories 1–22.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] Proposal model + additive migration; title unique among live Proposals by the Job Title rule (create and rename), refused with a clear Thai message.
- [ ] `/soc` lists all Proposals to every SOC user with title, creator, เสร็จ N/5, current SOC Version (— when none), รอคนรับ count (0 for now), last update; "+ Proposal ใหม่".
- [ ] Tabs Proposal | งานตรวจเดิม | สร้าง SOC เดิม; the old lists work as before without "+ สร้างงานตรวจ" / "+ สร้าง SOC".
- [ ] Proposal page: header, file chips (empty state), six step cards with status badge, AI tag ("Runner ของคุณ" / "ไม่มี Runner → รอคนรับ" from the viewer's Runner Link), ใช้/ได้/current line; step status is derived by the Proposal module, not stored.
- [ ] Rename and trash by creator or ADMIN only; trash/restore/early purge through the existing admin trash page; the 6-hourly purge removes the Proposal and its folder after 30 days.
- [ ] Launcher tile and sidebar renamed with the new description; access still the `soc` app gate (non-SOC users refused).
- [ ] Tests at seam A (server actions + test DB): unique title, list visibility, rename/trash rights, purge cascade, derived statuses of an empty Proposal. Browser check light/dark/narrow.
