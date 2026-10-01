# 04: Project Folder path end to end

**What to build:** A card can carry a Project Folder path (the project's folder in the wider archive, `_Project ...` on the `PS` share), shown in the popup with a copy button next to the existing Contract and Work Certificate paths, and blank when the project has none. The ingest API accepts it; a blank/absent value never erases a stored one. See the Project Folder glossary entry.

**Blocked by:** 01 (Category and Tags end to end), which shares the ingest merge code and the popup

**Status:** ready-for-agent

- [ ] Additive migration adds the Project Folder field (nullable)
- [ ] Ingest POST accepts an optional Project Folder (a UNC path under the `PS` share's `_Project` archive); preserve-if-null on update
- [ ] Popup shows the path with a copy button, labelled distinctly from the Contract / Work Certificate paths; shown as blank/"-" when there is none
- [ ] Scripted ingest check covers accept + preserve-if-null; passes
- [ ] Browser check on local; `npm run lint`, `npm run typecheck`, `npm run build` pass
