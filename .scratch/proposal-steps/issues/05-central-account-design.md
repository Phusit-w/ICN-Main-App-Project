# บัญชี Claude ส่วนกลาง: ออกแบบ

Type: grilling
Status: resolved
Blocked by: 01

## Question

Given the terms found in 01, where does the central account run (server vs a teammate's PC) and how: a SOC Runner in a "central" mode that takes any granted user's Check Request, how ADMIN grants central use, queue order and "รอคิวส่วนกลางที่ N", quota-exhausted behaviour, whose name a central run's result records, what the confirm popup must tell the user — and the ADR that supersedes the "a Check Request belongs to its reviewer's Runner only" consequence of ADR 0008.

## Answer

Recorded as ADR 0013 (`docs/adr/0013-teammate-takes-check-requests.md`, amends ADR 0008) and glossary รอคนรับ. Decided 2026-10-29:

1. No central account, neither on the server nor on a teammate's PC, and no code that takes requests automatically (terms, ticket 01). User asked twice (server auto-take; server script clicking take) — both are the forbidden shape.
2. Instead **รอคนรับ**: a user without a Runner (or with one, by choice, e.g. quota out) sends the request there; any user with an active Runner Link takes it by their own click (per major item or "รับทั้งชุด"), after a popup that it uses their quota.
3. List shows Proposal, step, major item, row count, asker, time.
4. Result records both: "ขอโดย ก · ตรวจโดย ข (บัญชีของ ข)"; review/confirm unchanged.
5. In-app only: asker sees รอคนรับ / "ข รับแล้ว"; Runner users see a waiting count on the SOC menu.
6. Asker can cancel before the run starts; no expiry; taker's Runner quiet 2 min → back to รอคนรับ.
7. Charting note "ADMIN grants central use per user / รอคิวส่วนกลางที่ N" is dropped.
8. Long term if รอคนรับ bottlenecks: company-paid Team seats (no code change) or pay-per-use API.
