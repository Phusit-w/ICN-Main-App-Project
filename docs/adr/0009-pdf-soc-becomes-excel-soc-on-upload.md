# A PDF SOC is turned into an Excel SOC on upload

Decided 2026-10-14. Reviewers upload a PDF SOC as it is. The server reads its table once, at upload, and stores the result as an `.xlsx` beside the original PDF. From then on the job is an Excel SOC, so the major-item split, the SOC Runner, the skill, the review page and the results Excel all keep using the Excel path. That path is already deployed and tested on real jobs. We chose this so that only one PDF table reader exists (on the server), and so that PDF SOCs need no new Skill Package or Runner version, which would make every reviewer re-paste the install command.

## Considered Options

- **The skill on the Runner reads the PDF itself.** Rejected. There would be a second PDF table reader, and the major items would not be known at upload.
- **Claude reads the PDF SOC during each check.** Rejected. It spends quota every time it reads the table again, and the major items, ไม่ต้องตรวจ and picked-row re-checks all need the rows at upload.

## Consequences

- Each row keeps the PDF page it came from, so the review page can open the original page.
- The generated `.xlsx` must keep the header names the Excel reader recognises. Table pages that are scans are left out and named at upload.
- Scanned PDF SOCs are a later phase. They are expected to produce the same `.xlsx`, so everything downstream stays the same.
