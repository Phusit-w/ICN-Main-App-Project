# 06: Scanned TOR build through the shared OCR queue

**What to build:** A scanned TOR is read by Typhoon for the chosen pages only, after the same confirm as TOR Match, through the shared OCR queue (one read at a time across check jobs, TOR Match and builds). Statuses: waiting in queue (รอคิวที่ N) / reading (pages done of total) / ready / read failed (resume) / cancelled (resume); pages already read are kept so resume continues. Scanned builds carry the Beta label and "ทวนทุกข้อเทียบ TOR จริง" on the build page; nothing is inserted into the Word file. A page that cannot be read is named in the warnings.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] API/DB tests like test/soc-tor-scan.test.ts: confirm required, queue order, progress, cancel, resume keeps read pages, failed read, only chosen pages sent
- [ ] Live check on MOF or Apron on prod after deploy
- [ ] lint, typecheck, tests pass

## Comments
