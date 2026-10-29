# เมนู SOC เข้าผ่าน Proposal และงานเก่า

Type: grilling
Status: resolved
Blocked by: 06

## Question

With Proposal as the one way into the SOC app: what does `/soc` open on, where do old SOC jobs and SOC Builds stay listed, can an old SOC job be attached to a Proposal later, and what happens to the SOC Guided Tours and the launcher tile/sidebar?

## Answer

Decided 2026-10-29:

1. `/soc` opens on the Proposal list with "+ Proposal ใหม่"; tabs become Proposal | งานตรวจเดิม | สร้าง SOC เดิม (today's SOC job list and SOC Build list, still open/check/review as now).
2. No new SOC job or SOC Build outside a Proposal: "+ สร้างงานตรวจ" and "+ สร้าง SOC" go. The old flow = a Proposal started at ตรวจหลักฐาน with an uploaded SOC + Datasheets.
3. Old SOC jobs can't be attached to a Proposal; they stay in งานตรวจเดิม until trashed ("สร้าง Proposal จากงานนี้" is a possible later add-on, not in this map).
4. Proposal list: title, creator, progress เสร็จ N/5 (โครง Content not counted), current SOC Version, รอคนรับ count, last update; everyone with SOC access sees all.
5. Proposal title unique by the Job Title rule (trim, collapse spaces, ignore case); auto SOC job per version titled "<Proposal> · ฉบับ N". Rename and trash by creator or ADMIN; trash → purge after 30 days, taking all its SOC Versions, SOC jobs, builds and Datasheets. No separate archive.
6. New Guided Tours for the Proposal list and Proposal page; the 4 existing tours stay on their screens (job/review pages reached via ↗); the job-list and new-job tours are updated for the removed buttons.
7. Launcher tile and sidebar: "ตรวจสอบ SOC" → "Proposal & SOC", description "เตรียมข้อเสนอตั้งแต่ TOR ถึงตรวจหลักฐาน"; still the `soc` app access.
