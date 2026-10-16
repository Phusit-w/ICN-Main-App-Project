# 07: Upload confirmation for external OCR and the missing-key gate

**What to build:** Before the upload is sent, the system detects without OCR whether the PDF has at least one scanned table page. If so, the upload screen shows "ไฟล์นี้จะส่งไป OCR ภายนอก" and the user must confirm each time; cancelling at the notice uploads nothing. A PDF with no scanned table page shows no notice and never calls Typhoon. When `TYPHOON_API_KEY` is not set, a scanned PDF is refused with a message that tells the user to ask the admin. See spec and ADR 0010.

**Blocked by:** 03

**Status:** done (2026-10-16), not committed

- [x] Scanned or mixed PDF: notice appears, confirm is required, cancel sends nothing
- [x] Text PDF, Word and Excel uploads: no notice, behaviour unchanged
- [x] No key: scanned PDF refused with the "ask the admin" message and no job is created
- [x] The confirm cannot be skipped by calling the upload endpoint without it
- [x] Detection runs without OCR and is covered by tests with generated PDFs

## Comments

- 2026-10-16: Done. Gate in createImportedSocJob (lib/soc.ts): scanned PDF + no key -> "ask the admin" message; key but no `ocrConfirmed` -> OCR_CONFIRM_REQUIRED (HTTP 409 {needsOcrConfirm}); route reads form field ocrConfirmed=1. SocUploadForm shows a ConfirmDialog "ไฟล์นี้จะส่งไป OCR ภายนอก" on 409 and re-posts with the confirm; cancel stops there. Detection is hasScannedTable (no OCR). Cost: a scanned file is posted twice (first one is refused, nothing stored; SOC file max 25 MB). Tests: test/soc-scan-read.test.ts (11 pass); tsc + eslint clean. Browser flow not clicked through.
