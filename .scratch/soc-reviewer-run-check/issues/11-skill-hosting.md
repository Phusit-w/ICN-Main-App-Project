# 11: Host versioned SOC skill packages on the server

**What to build:** An admin uploads a SOC skill package (`.skill`/zip) to the server, sees the list of versions, and marks one as current. The served package carries a headless instruction: when cited documents are missing (skill step 0), write a structured missing-documents result and stop, instead of asking a question. The job page shows which skill version each major item was checked with, and flags items checked with an older version than the current one.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 01

**Status:** done

- [x] Upload, list and set-current work, for ADMIN only
- [x] Exactly one version is current at a time
- [x] The headless step-0 instruction is part of the served package and is documented
- [x] Major items show their skill version and an "older than current" flag
- [x] Audited; tests cover set-current and access; lint, typecheck and build pass

## Comments

### 2026-10-06: done (commit on `feature/soc-reviewer-run-check`)

What was built:
- `lib/zip.ts` (new shared zip read/write; `readZipEntry` in `lib/soc-major-items.ts` now uses it)
- `lib/soc-skill-headless.ts` (HEADLESS.md text, marker `SOC_RUNNER_HEADLESS=1`, `missing_documents.json` format)
- `lib/soc-skill-package.ts`: `prepareServedPackage`, `uploadSocSkillPackage`, `listSocSkillPackages`, `setCurrentSocSkillPackage` (each requires ADMIN), plus `currentSocSkillPackage`, `socSkillVersions`, `readSocSkillPackage` (no auth check, for ticket 13 / the job page)
- Schema + migration `20261006180000_soc_skill_packages`: `SocSkillPackage` and `SocCurrentSkill` (a single row with a CHECK on `key = 'current'`). The first upload becomes current. Already applied to the dev DB (pilot-db).
- `POST /api/admin/soc-skills`, `GET /api/admin/soc-skills/[id]`, `actions/socSkills.ts`, page `/admin/soc-skills` + `components/AdminSocSkills.tsx`, and an Admin nav link
- Job page: "skill ปัจจุบัน", plus a flag per item: `skillVersionStatus` in `lib/soc-shared.ts` (older / unhosted)
- Docs: `docs/SOC-SKILL-HOSTING.md`, and a Skill Package entry in the glossary
- Tests: `test/soc-skill-package.test.ts` (13 tests)

Validation run: typecheck ✓, lint ✓, `npm test` 91/91 ✓, build ✓ (with NEXT_DIST_DIR=.next-verify; the build rewrote tsconfig.json, which was restored with git checkout).
Browser: uploaded the real skill on /admin/soc-skills; it became current, and the stored file contains HEADLESS.md and the note in SKILL.md. The SOC_Demo job page shows the "ไม่ใช่เวอร์ชันบน server" flag (item ๑ was imported with a local sha256 version).
Note: the dev DB now has 1 uploaded package (sha256:75f3d06292b90b40).

`/code-review` (Standards + Spec) found no breaches of the documented standards and no missing requirements. Fixed after the review:
- `readZip` now rejects truncated entries and CRC mismatches (a test covers this);
- the set-current read and switch run in one transaction, so the audit's `before` is the version that was actually replaced;
- the admin routes return 500 with a generic message for unexpected errors (logged), so storage paths are never shown;
- the size message is derived from `MAX_SKILL_PACKAGE_BYTES`;
- docs: the default `sha256:` version hashes the uploaded zip, so it won't match versions from local runs (those show "ไม่ใช่เวอร์ชันบน server"). The no-current-version case is documented for ticket 13.

Left as is (judgement calls): `test/docx-fixture.ts` `buildZip` still duplicates `writeZip` (it also needs stored entries); the routes check ADMIN before parsing the body, and the lib checks again; "older" means *uploaded* earlier, so after a rollback, items checked with the abandoned newer version are not flagged.
Final validation: typecheck ✓, lint ✓, `npm test` 92/92 (0 skipped) ✓, build ✓.

Notes for ticket 13: use `currentSocSkillPackage()` + `readSocSkillPackage()` for the runner download, with the version from the record. `currentSocSkillPackage()` is `null` until the first upload; answer that clearly (e.g. "ยังไม่มี skill บน server"). For ticket 14: the prompt must contain `SOC_RUNNER_HEADLESS=1`, the major item, the output dir and `acknowledged_missing` (see docs/SOC-SKILL-HOSTING.md).
