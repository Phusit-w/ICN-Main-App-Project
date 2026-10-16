# 07: Upload confirmation for external OCR and the missing-key gate

**What to build:** Before the upload is sent, the system detects without OCR whether the PDF has at least one scanned table page. If so, the upload screen shows "ไฟล์นี้จะส่งไป OCR ภายนอก" and the user must confirm each time; cancelling at the notice uploads nothing. A PDF with no scanned table page shows no notice and never calls Typhoon. When `TYPHOON_API_KEY` is not set, a scanned PDF is refused with a message that tells the user to ask the admin. See spec and ADR 0010.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Scanned or mixed PDF: notice appears, confirm is required, cancel sends nothing
- [ ] Text PDF, Word and Excel uploads: no notice, behaviour unchanged
- [ ] No key: scanned PDF refused with the "ask the admin" message and no job is created
- [ ] The confirm cannot be skipped by calling the upload endpoint without it
- [ ] Detection runs without OCR and is covered by tests with generated PDFs
