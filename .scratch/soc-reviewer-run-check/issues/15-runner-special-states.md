# 15: Runner special states

**What to build:** First verify how `claude -p` reports quota exhaustion and an expired login, and record the evidence in Comments. Then handle each state:

- missing cited documents: report `needs_documents` with the names, without running the rows, and let the user choose [อัปโหลดเพิ่ม] or [ตรวจต่อโดยไม่มีไฟล์นี้] (which re-issues the request with an acknowledgement);
- quota exhausted: `paused_quota` with an expected resume time, keep finished rows, and resume automatically;
- expired login: `needs_login`, told to the user on the web;
- any other failure: `failed` with a Thai reason and a retry button.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] How the CLI signals quota and login state is verified and documented
- [ ] Each state is unit-tested with fakes
- [ ] Each state shows correctly on the web, with its action buttons
- [ ] Continue-without-file runs and the major item gets the missing-documents banner
- [ ] An automatic resume after the quota pause is tested

## Comments
