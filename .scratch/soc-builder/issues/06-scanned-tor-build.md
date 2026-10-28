# 06: Scanned TOR build through the shared OCR queue

**What to build:** A scanned TOR is read by Typhoon for the chosen pages only, after the same confirm as TOR Match, through the shared OCR queue (one read at a time across check jobs, TOR Match and builds). Statuses: waiting in queue (รอคิวที่ N) / reading (pages done of total) / ready / read failed (resume) / cancelled (resume); pages already read are kept so resume continues. Scanned builds carry the Beta label and "ทวนทุกข้อเทียบ TOR จริง" on the build page; nothing is inserted into the Word file. A page that cannot be read is named in the warnings.

**Blocked by:** 04, 05

**Status:** code done 2026-10-28; live OCR check on prod left (ready-for-human)

- [x] API/DB tests like test/soc-tor-scan.test.ts: confirm required, queue order, progress, cancel, resume keeps read pages, failed read, only chosen pages sent
- [ ] Live check on MOF or Apron on prod after deploy
- [x] lint, typecheck, tests pass

## Comments

2026-10-28: scanned TOR build done. SocBuild.stage column (migration 20261028150000_soc_build_stage, NOT yet on prod). lib/soc-builds.ts: createSocBuild needs OCR key + ocrConfirmed (409 needsOcrConfirm over HTTP, form asks), template validated before queueing, startBuildRead in the shared OCR line (key build:<id>), only the chosen pages sent (readScannedTor `only`), cancel/resume routes + resumeBuildReads at startup (instrumentation). UI: Beta note + SocBuildReadPanel (queue place/pages, cancel/resume, 5 s refresh) + list refresh. Tests test/soc-build-scan.test.ts (10) pass; full suite 486 pass; build OK. Browser: list + build pages in QUEUED/READING/FAILED/CANCELLED states (seeded rows, nothing sent to OCR), resume without key shows the OCR-not-set-up message. NOT done: live read on prod (Typhoon key + real scanned TOR, e.g. Apron p13-39); confirm dialog click-through not exercised in browser (needs OCR key). Unpushed.
