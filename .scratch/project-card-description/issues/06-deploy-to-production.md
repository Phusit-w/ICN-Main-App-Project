# 06: Deploy the Description/Category code to production

**What to build:** Production runs the code from tickets 01-04, so batch pushes can carry Descriptions, Categories, Tags, Work Types and Project Folders, and the existing 272 cards keep working unchanged.

**Blocked by:** 02 (Work Types), 03 (Description with Description Source), 04 (Project Folder path)

**Status:** ready-for-human

- [ ] Commits fast-forward onto `origin/main` (only Project Card work; never stage the unrelated SOC WIP in the working tree)
- [ ] The user runs `git pull` then `.\deploy\windows\update.ps1` on the production server (`C:\Apps\expense-billing-app-deploy-git`) themselves; backup taken, migrations applied, health check returns 200
- [ ] Production search page still shows 272 cards; Category filter present (empty until batches are pushed); popup opens
