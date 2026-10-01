# 05: Worklist and Project Folder matching for all 272 cards

**What to build:** A progress record (the worklist) in this feature's folder with one row per Project Code (Client, batch, matched Project Folder or candidate folders, planned Description Source, status `todo` | `written` | `reviewed` | `pushed`, open question), and every card matched to its Project Folder where one exists, so later batch tickets can start reading immediately and any new session can resume from this file alone. No app code changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Worklist created and committed, rows for all 272 Project Codes from `pilot-db`, each assigned to its batch (07 NT A ... 14 TOT, following the spec's batch order)
- [ ] Matching done read-only against `\\192.168.99.1\PS\_Project 2018-2025` and `_Project 2026` (via PowerShell; never write, rename or delete on the share): first by Project Code, then by project name + year + Client
- [ ] When more than one folder fits, or a folder looks like a lost bid ("Participate", "Re-bidding" without an award), the Project Folder stays blank and the candidates are listed for the user
- [ ] Planned Description Source per card recorded from what the folder holds (TOR present / Proposal only / none -> Contract / name only)
- [ ] Summary for the user: how many cards have a confident folder, how many are ambiguous (with candidates), how many have none; the user's answers are recorded back in the worklist
