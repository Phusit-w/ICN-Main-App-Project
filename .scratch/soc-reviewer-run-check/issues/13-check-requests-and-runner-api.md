# 13: Check Requests and the runner API (seam 2)

**What to build:** On an imported job, a user clicks ตรวจ on a major item or ตรวจทั้งชุด for every unchecked one. This creates Check Requests owned by that user, and they can cancel a request that hasn't started. A token-authenticated API lets the runner claim the oldest request belonging to its own user, download the job's SOC and evidence plus the current skill package, report progress, and submit results through the import from ticket 05 (source = runner). A request whose runner stops sending heartbeats returns to `requested`. The major item shows its state, including "รอเครื่องของคุณเปิด" when the owner's runner is offline.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 05, 11, 12

**Status:** done

- [x] A token for user A can never claim, download or report on user B's requests (tested)
- [x] Claims are oldest first; cancel works before a claim
- [x] Submit goes through the ticket 05 import, and invalid results are rejected the same way
- [x] A stale claim returns to `requested`
- [x] Every state shows on the major item in Thai
- [x] Audited; lint, typecheck and build pass

## Comments

### 2026-10-06: done (commit abf62d2)

- `SocCheckRequest` (migration `20261006220000_soc_check_requests`). Open states `requested | running | paused_quota | needs_login`,
  closed `needs_documents | failed | done | cancelled`. One open request per major item; the item's `state` mirrors it
  (new item state `needs_login`). `priorState` is restored on cancel.
- Web: `actions/socCheckRequests.ts` (ตรวจ / ตรวจซ้ำ / ตรวจทั้งชุด / ยกเลิกคำขอ), buttons in `components/SocJobDetail.tsx`;
  state text from `majorItemStateText()` in `lib/soc-shared.ts` ("รอเครื่องของคุณเปิด" when the requester's runner is not online).
  The page polls every 10 s while a request is open. Manual import is refused while a request is open.
  The manual-import toggle on a checked item is now labelled "นำเข้าผลใหม่" (ตรวจซ้ำ = runner request).
- Re-check over confirmed rows: the request asks first and stores `replaceConfirmed`; the runner's submit passes it to the import.
- Runner API (`lib/soc-check-requests.ts`, docs/SOC-RUNNER.md): `POST /api/soc-runner/claim`,
  `GET /api/soc-runner/requests/:id/documents/:docId`, `GET .../skill` (package pinned at claim, `X-Soc-Skill-Version`),
  `POST .../report`, `POST .../submit` (multipart, through `importLocalCheckRun` with `checkRequest`, closed as done in the
  same transaction; any rejection closes the request as `failed`). Another user's request is always 404.
- Stale: running + no claim/report/download/heartbeat for 2 min (`SOC_CHECK_REQUEST_STALE_MS`) → `requested`
  (lazily, on claim and job page load). A heartbeat refreshes the claim. Claim returns this link's own running request first
  (runner restart). `needs_login` marks the link `logged_out`; claims wait until a heartbeat says `logged_in`.
- Tests: `test/soc-check-requests.test.ts` (17). Full suite 125/125, lint, typecheck, build pass.
- **Not checked in a browser**: the dev server on :3000 broke ("Jest worker encountered 2 child process exceptions")
  after `npm run build` ran against the same `.next` folder. pilot-db has the migration, plus a test user `uitest13` and the job
  "uitest13 SOC Demo" with a runner link for it. Restart `npm run dev`, then check the major-item states in the browser.
- **For ticket 14**: the runner must report `running` or send heartbeats at least every 2 min while a run takes long, send
  `model` (and `skillVersion` = the `X-Soc-Skill-Version` it downloaded) with submit, and treat 409 NOT_CLAIMED as "drop this run".
- **For ticket 15**: needs_documents → [ตรวจต่อโดยไม่มีไฟล์นี้] should create a request with `acknowledgedMissing` set (column
  exists, served in the claim, copied to `SocMajorItem.missingDocuments` on submit). Retry after `failed` already works by clicking ตรวจ.
