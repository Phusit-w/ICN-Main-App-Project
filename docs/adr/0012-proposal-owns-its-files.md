# A Proposal owns its TOR, SOC Versions and Datasheets; SOC Builds and SOC jobs run on them

Decided 2026-10-29 (`.scratch/proposal-steps/issues/03-proposal-record-shape.md`); builds on ADR 0011, does not supersede it.

A Proposal (glossary § Proposal) lets its steps be done in any order, and its Datasheets are uploaded once and shared by กรอกอ้างอิง and ตรวจหลักฐาน. Today every file belongs to the run that uses it: a SOC Build keeps its own TOR, template and draft, and a SOC job keeps its own SOC, Datasheets and TOR ต้นฉบับ, each in its own folder. Making steps share files that way would mean copying up to 1 GB of Datasheets into every job. So the Proposal holds the files and the runs read them:

- One TOR per Proposal feeds both สร้าง SOC and ตรวจ TOR ตรงต้นฉบับ. Replacing it marks an existing TOR Match as made from the old TOR; a draft already built is left alone.
- The SOC is a numbered list of SOC Versions; the latest is current. A finished SOC Build's draft is copied in as a new version, so the build itself can still be purged after 30 days as ADR 0011 says.
- Each SOC Version gets its own SOC job, created when ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน is first started on it. A SOC job still can't swap its SOC, so results always belong to the version they checked. A new version starts both checks over; results are not carried across (open question on the map).
- A SOC job reads the Proposal's Datasheets instead of copying them. Datasheets can be added and removed at any time, except while a SOC Runner is checking. Removing one takes it off the Proposal, but the file is kept while any check result cites it, so a finished review never loses its evidence. Limits are the SOC job's, counted per Proposal.

## Considered Options

- **Each step keeps its own files, the Proposal only links them**: no storage change, but Datasheets are copied per job and "upload once" becomes "upload once, copy many".
- **One SOC job per Proposal whose SOC is swapped per version**: fewer jobs, but every result, major item and TOR Match would have to remember which SOC it checked.
- **Delete a removed Datasheet at once / forbid removal while cited**: simpler, but either breaks finished reviews or blocks the user.

## Consequences

- ADR 0011's "use this draft for a check" step is this: draft → SOC Version → SOC job.
- SOC jobs made before Proposals keep their own files and stay viewable as they are.
