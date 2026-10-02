# 04: Project Folder path end to end

**What to build:** A card can carry a Project Folder path (the project's folder in the wider archive, `_Project ...` on the `PS` share), shown in the popup with a copy button next to the existing Contract and Work Certificate paths, and blank when the project has none. The ingest API accepts it; a blank/absent value never erases a stored one. See the Project Folder glossary entry.

**Blocked by:** 01 (Category and Tags end to end), which shares the ingest merge code and the popup

**Status:** done

- [x] Additive migration adds the Project Folder field (nullable)
- [x] Ingest POST accepts an optional Project Folder (a UNC path under the `PS` share's `_Project` archive); preserve-if-null on update
- [x] Popup shows the path with a copy button, labelled distinctly from the Contract / Work Certificate paths; shown as blank/"-" when there is none
- [x] Scripted ingest check covers accept + preserve-if-null; passes
- [x] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass

## Comments

2026-10-02 — Done. Migration `20261002110000_project_card_project_folder` (nullable `projectFolderPath`; applied to `pilot-db` only, production in ticket 06). Ingest accepts `projectFolderPath` only as `\\<server>\PS\_Project <years>\…` (case-insensitive); a local path, a `_BID` path, another share, `_ProjectX` or `""` rejects the record (same convention as `contractPath`: send null/omit when unknown, never `""`). Preserve-if-null on update; a non-null value replaces. Popup lists "โฟลเดอร์โครงการ (TOR และไฟล์ทำงาน)" first under ตำแหน่งไฟล์ with a copy button, "-" when blank. Glossary updated: Folder Path is now "up to three"; a Project Folder is blank also when no single folder can be identified with confidence. Scripted check: 27 checks in total, all pass (written first, ran red). Browser-checked: path + copy ("คัดลอกแล้ว") on a ZZTEST card, "-" on real card NT014.

Gotcha for later sessions: in this machine's Git Bash, heredocs (even quoted `<<'EOF'`) halve backslashes — write anything containing UNC paths with the Write/Edit tools, not shell heredocs.
