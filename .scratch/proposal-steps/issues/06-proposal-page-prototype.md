# หน้าจอ Proposal: หน้าตาและการไล่ step

Type: prototype
Status: resolved
Blocked by: 03

## Question

What should the Proposal page look like so the six steps read at a glance and any step can be started first: how each step shows its status, input (from an earlier step or uploaded), whether it needs AI and whose account runs it, and its output; how a skipped step's upload looks; how the existing SOC Build and SOC job screens are reached from a step?

## Answer

2026-10-29: user chose **A · ไล่ลงมาเป็นขั้น** (no changes asked to the shown fields).

- Header: Proposal title + "เลือกทำ step ไหนก่อนก็ได้ · step ที่ข้ามไป ให้อัปโหลดไฟล์แทน"; a strip of chips for the Proposal's files (TOR, SOC ปัจจุบัน ฉบับ N, Datasheet count/size).
- Six steps top-to-bottom joined by a line, numbered circle (✓ when done), every step open at once. Each card: title, status badge (เสร็จ / กำลังทำ / ยังไม่ทำ / ต้องทำใหม่ / เร็ว ๆ นี้), AI tag (ไม่ใช้ AI / AI ไม่บังคับ / ใช้ AI, plus "Runner ของคุณ" or "ไม่มี Runner → รอคนรับ"), ใช้: input, ได้: output, a current-state line, then buttons: main action, "อัปโหลด … เอง" for a skipped input, and a ↗ link to the existing SOC Build / SOC job screen.
- "ต้องทำใหม่" = a check done on an older SOC Version (e.g. TOR Match of ฉบับ 1 while ฉบับ 2 is current).
- โครง Content shown greyed as เร็ว ๆ นี้.
- Right column: รอคนรับ panel (requests waiting, asker, cancel).

Prototype (primary source): branch `prototype/proposal-page` (commit ef0e12f), route `/soc/prototype-proposal?variant=A|B|C`; removed from the main working tree.
