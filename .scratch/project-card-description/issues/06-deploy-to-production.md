# 06: Deploy the Description/Category code to production

**What to build:** Production runs the code from tickets 01-04, so batch pushes can carry Descriptions, Categories, Tags, Work Types and Project Folders, and the existing 272 cards keep working unchanged.

**Blocked by:** 02 (Work Types), 03 (Description with Description Source), 04 (Project Folder path)

**Status:** done

- [x] Commits fast-forward onto `origin/main` (only Project Card work; never stage the unrelated SOC WIP in the working tree)
- [x] The user runs `git pull` then `.\deploy\windows\update.ps1` on the production server (`C:\Apps\expense-billing-app-deploy-git`) themselves; backup taken, migrations applied, health check returns 200
- [x] Production search page still shows 272 cards; Category filter present (empty until batches are pushed); popup opens

## Comments

2026-10-02 — Done. The user pushed `e37f31d` to `origin/main` (Claude's push was blocked by the permission classifier), pulled on the production server and ran `update.ps1`: backup `backup-20261002-160200.sql`, migrations `20261001090000`–`20261002110000` applied, health check 200, spot-check passed. Ticket 15 (`3335fea`, migration `20261002120000_project_card_terms`) was deployed the same way afterwards; the user reported it passed.
