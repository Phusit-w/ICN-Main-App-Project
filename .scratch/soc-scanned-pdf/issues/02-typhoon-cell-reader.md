# 02: Typhoon cell reader

**What to build:** The production cell reader. It sends one cell image per call to the Typhoon OCR API (model `typhoon-ocr`, the v1.5 prompt from the prototype), keeps below the documented limit of 20 requests per minute (shared by all users), and retries when Typhoon answers a rate limit or fails. The key is one shared `TYPHOON_API_KEY` in the server `.env`. See spec and ADR 0010.

**Blocked by:** None (can start immediately; can run in parallel with 01)

**Status:** done (2026-10-16)

- [x] Given a cell image, returns the cell text (and tells a figure-only answer apart from text)
- [x] Never sends more than 20 calls in any 60-second window, across concurrent callers in the process
- [x] A rate-limit answer or transient failure is retried with a delay; a permanent failure surfaces as an error the caller can see
- [x] Missing `TYPHOON_API_KEY` is reported as "OCR service not set up" without any network call
- [x] Tests use a fake fetch; no real Typhoon call; the key value is never logged

## Comments

- 2026-10-16: Done. lib/soc-typhoon.ts: createTyphoonReader({apiKey,fetch,now,sleep}) (injected for tests), typhoonCellReader (one process-wide rate window, reads TYPHOON_API_KEY per call), typhoonConfigured() for the upload gate (ticket 07), cleanCell, OcrNotSetUpError, TyphoonError. 6 attempts, delay 5 s x attempt or Retry-After; 400/401 not retried. 7 tests pass, tsc + eslint clean.
