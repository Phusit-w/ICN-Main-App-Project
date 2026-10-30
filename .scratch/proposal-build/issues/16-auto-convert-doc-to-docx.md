# 16: แปลง .doc เป็น .docx อัตโนมัติตอน upload

**What to build:** When a user uploads an old Word file (`.doc`) as a SOC or a SOC Template, the system converts it to `.docx` itself instead of refusing it with "Save As เป็น .docx" (today's message: `lib/soc-shared.ts` SOC upload, `lib/soc-templates.ts` template). Raised by the user 2026-10-30 while finishing ticket 13 group J. Most real SOCs in the sample set are `.doc` (MOF, NT, OBEC, PEA: 48 of 64 files).

**Blocked by:** none technically; best after 13 and 12 (do not take on a server install before the build work is right). Needs IT's agreement.

**Status:** needs-triage (design and a quality test first)

## Open points

- The production server is native NSSM behind IIS and has no Word. The usual route is LibreOffice headless (`soffice --headless --convert-to docx`) installed on the server: needs IT to allow the install (Smart App Control and no code-signing cert were an issue before) and the user to approve a new dependency on prod.
- Alternative: convert on the user's own PC through the SOC Runner when Word is there. Not every reviewer's PC has Word, so it cannot be the only route.
- Quality is unknown: Word converted all 64 sample files fine (copies in `.scratch/proposal-build/fixtures/13-real-soc/`, git-ignored), LibreOffice has not been tried. Thai tables with merged cells (NT, PEA) are the risk; compare the table text and merged cells of each converted sample with the Word-converted copy before deciding.
- Where the converted file is kept: both the original `.doc` and the `.docx`, or only the `.docx`; audit log line either way. Conversion must run with a time limit and a size limit (the 25 MB SOC file limit applies to the original).
- A converted file is a customer document: the conversion must not send it outside the system.

## Acceptance (to be set after the design pass)

- [ ] Decide the route (server LibreOffice, Runner with Word, or keep Save As) with the user and IT.
- [ ] Each of the 48 sample `.doc` files converts, and its table (row count, item numbers, merged cells) matches the Word-converted copy; failures are listed.
- [ ] Upload of a `.doc` SOC and a `.doc` template works end to end; a file that fails to convert is refused with a message that still names Save As.
- [ ] Tests at the same seam as `lib/soc-table-excel.test.ts` and `test/soc-templates.test.ts`.
