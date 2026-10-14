# 09: Live acceptance and quota

**What to build:** Ship both lanes and let the user judge them on real jobs.

1. Push and deploy the web; apply migrations.
2. Upload the new Skill Package and make it current.
3. Re-paste the install command on the reviewer PC (new Runner version).
4. Surat Thani (Excel): upload, check one major item, review, export the results Excel.
5. MEA Y69 (Word saved as `.docx`): upload, check one major item with Image Rows and one of similar size without, reading the quota meter before and after each.
6. The user decides whether the quota cost of image reading is acceptable. If not, the fallback to discuss is "every Image Row waits for the reviewer; Claude reads none".

**Blocked by:** 05, 08

**Status:** ready-for-human

- [ ] Deployed; Skill Package current; Runner re-installed
- [ ] Surat Thani: one major item checked, reviewed and exported on prod
- [x] MEA Y69: one major item with Image Rows checked and reviewed on prod; the user has compared the readings with the images
- [x] Quota in pts recorded here for the image major item and the comparison item
- [x] The user's decision on the quota cost is recorded here

## Comments

**2026-10-14: ready to deploy; the rest is the user's.** Done by the agent:

- Pushed `885a601` to `origin/main` (fast-forward from `dd09fbc`, 8 commits: tickets 01 to 08) and to the feature branch.
- Skill Package built from the skill source (161 skill tests pass): `SOC model compliance/Skill/tor-word-compliance-check-2026-10-14-images.skill` (21 files, 78,415 bytes, sha256 `674cf59da457…`). It has Excel SOC and Image Row support. Not uploaded.

Left for the user, in this order (the order matters, see the end of tickets 05 and 08):

1. Upload the package above on prod and make it current.
2. Deploy on the server: `git pull`, then `update.ps1`. Three migrations, all additive: `soc_job_warnings`, `soc_check_run_without_document`, `soc_image_rows`.
3. On the reviewer PC paste the install command again (Runner 0.6.0). Until then requests for an Excel SOC or for an item with Image Rows wait with "รอติดตั้ง SOC Runner รุ่นใหม่"; Word jobs without Image Rows go on as before.
4. Surat Thani (Excel): upload, check one major item, review, export the results Excel.
5. MEA Y69 (save the `.doc` as `.docx` first): check one item with Image Rows and one of similar size without; read the quota meter before and after each, with nothing else in the queue. The local runs used 2.5 (mixed image), 1.7 (picture) and 1.12 (no image).
6. Decide on the quota cost.

**2026-10-14: MEA Y69 quota on prod (after ticket 10, whole ผนวก per request), meter as the user read it:**

| Major item | Rows | Image Rows | Meter | Points | Points per 10 rows |
|---|---|---|---|---|---|
| ผนวก 9 | 34 | 2 | 40% → 47% | 7 | 2.1 |
| ผนวก 7 | 37 | 0 | 48% → 53% | 5 | 1.4 |

ผนวก 9 cost 2 points more with 3 fewer rows. The meter moves in whole points and each item ran once, so the share of the 2 points that is image reading isn't known; the two ผนวก also differ in their text and evidence pages. The meter moved 47% → 48% between the runs, outside both. Not yet: the user's look at the readings against the images, and the decision.

**2026-10-14: decision: Claude keeps reading Image Rows.** Asked whether the ผนวก 9 readings match the images and whether the quota above is acceptable, the user answered "คิดว่าน่าจะผ่าน" (I think it should pass). Recorded as accepting both; the fallback ("every Image Row waits for the reviewer") is not built. Left in this ticket: the Surat Thani (Excel) run.

Known before the MEA run (board, "Found on the way"): MEA restarts item numbers in every ผนวก, so the web shows one ข้อ 1 split into 1.1, 1.2 … mixing all ผนวก, and the skill reaches only 3 of its 19 Image Rows (2.5, 1.7, 11.). Items 2.5 and 1.7 can be checked as they are; the other Image Rows wait for that decision.
