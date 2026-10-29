# 06: ตรวจ TOR ตรงต้นฉบับ และตรวจหลักฐาน ต่อฉบับ

**What to build:** Starting ตรวจ TOR ตรงต้นฉบับ or ตรวจหลักฐาน on the current SOC Version creates that version's SOC job ("<Proposal> · ฉบับ N") automatically, using the Proposal's TOR and Datasheets without copying them, and the steps link ↗ to the existing job/review pages, which work as today. A newer SOC Version or a replaced TOR shows the old result as ต้องทำใหม่ with a link to it. Spec stories 28, 37–38, 67–72.

**Blocked by:** 02, 03, 04

**Status:** ready-for-agent

- [ ] Lazy SOC job per SOC Version via the existing imported-job creator fed with stored bytes; job linked to Proposal + version.
- [ ] The job's evidence and TOR ต้นฉบับ come from the Proposal; the Runner document API serves the Proposal's live Datasheets for such a job.
- [ ] Datasheet removal refused while a Runner is running on any job of the Proposal; a removed Datasheet cited by a result stays openable from the review page.
- [ ] Statuses: ยังไม่ทำ / กำลังทำ / เสร็จ from the current version's job; ต้องทำใหม่ when only an older version or the old TOR has a result.
- [ ] Starting at ตรวจหลักฐาน with only uploads (SOC + Datasheets) works end to end.
- [ ] Tests at seam A + runner routes (prior art `test/soc-imported-job.test.ts`, `test/soc-tor-attach.test.ts`, `test/soc-check-requests.test.ts`). Browser check.
