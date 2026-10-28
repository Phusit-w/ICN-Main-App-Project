# A SOC Build is its own record, not a SocJob kind

Decided 2026-10-27; supersedes ADR 0002. สร้าง SOC (SOC Build) turns chosen pages of a TOR PDF into a Generated SOC Draft from a SOC Template. It is a sub-menu of the SOC app with the same app access, but its builds are their own records and their own list, not a `BUILD` kind of `SocJob`.

ADR 0002 chose a `SocJob` kind to reuse ownership, queue, storage, audit and retention. Since then the SOC check moved to the reviewer's SOC Runner (ADR 0008) and `SocJob` grew check-only state (major items, check requests, results, TOR Match, review confirmation, unique titles). A build has none of that: no major-item checks, no results, no confirmation, duplicate titles allowed. Every check screen and query would need a "not a build" guard. The pieces a build really shares are libraries, not the table: the TOR reader, the shared OCR queue (one Typhoon read at a time), the SOC table reader (a Generated SOC Draft must read back as a SOC), storage helpers and the 30-day purge pattern. So builds get their own small model and list, and reuse those libraries.

Consequence: a later "use this draft for a check" link is a new step (create a check job from the draft file), not a kind switch.
