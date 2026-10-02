# 05: Worklist and Project Folder matching for all 272 cards

**What to build:** A progress record (the worklist) in this feature's folder with one row per Project Code (Client, batch, matched Project Folder or candidate folders, planned Description Source, status `todo` | `written` | `reviewed` | `pushed`, open question), and every card matched to its Project Folder where one exists, so later batch tickets can start reading immediately and any new session can resume from this file alone. No app code changes.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Worklist created and committed, rows for all 272 Project Codes from `pilot-db`, each assigned to its batch (07 NT A ... 14 TOT, following the spec's batch order)
- [x] Matching done read-only against `\\192.168.99.1\PS\_Project 2018-2025` and `_Project 2026` (via PowerShell; never write, rename or delete on the share): first by Project Code, then by project name + year + Client
- [x] When more than one folder fits, or a folder looks like a lost bid ("Participate", "Re-bidding" without an award), the Project Folder stays blank and the candidates are listed for the user
- [x] Planned Description Source per card recorded from what the folder holds (TOR present / Proposal only / none -> Contract / name only)
- [x] Summary for the user: how many cards have a confident folder, how many are ambiguous (with candidates), how many have none; the user's answers are recorded back in the worklist

## Comments

2026-10-02 — Worklist written: `worklist.md` in this folder, 272 rows, batches 07–14 (32/31/13/32/32/41/44/47, matching the tickets; subcontract `PEA (...)` cards are in 12 per ticket 12's list and count, not in 10/11). Read-only scan of `_Project 2018-2025` and `_Project 2026` (PowerShell `Get-ChildItem` only): 336 candidate folders (247 project folders, 81 in Clients' `Proposal\<year>` collections, 8 `_Pre - Project`). Matching: 120 cards by Project Code in the folder name (incl. ranges like `CAT030-032` and lists like `NT018_019_020`), then by name + year + Client. Result: 147 confident, 17 ambiguous (candidates + a question in the row), 108 none (mostly CAT/TOT 2014–2018 and small PEA jobs). Planned sources: tor 141, contract 107, name 21, proposal 3. `NT032 MA_USO1_NE` carries the wrong code (the NT032 card is MA OTA → `NT032 MA_OTA66`). Remaining: the user's answers to the 17 questions, recorded back in the worklist.

2026-10-02 — Done. The user answered all 17: the Re-bidding folder won for NT022, RTP001, PEA050, PEA054; the other 13 follow Claude's recommendation (checked against the folder contents and the cards' contract file names; each answer and its reason is in the card's row). Final: 159 cards with a Project Folder, 113 without, none open. Planned sources: tor 153, contract 95, name 21, proposal 3.
