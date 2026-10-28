# 08: ให้ AI ทวนข้อความ OCR (optional, last)

**What to build:** On a scanned build, an optional button that creates a new check-request kind for the user's SOC Runner, modelled on the TOR Match judge request. The Runner renders the chosen pages as images, sends them with the OCR text; the skill's proofread instructions ask for corrections only (item, old -> new). The server applies them to the stored items, rebuilds the draft and keeps the list shown on the build page. The confirm names the AI of the Runner that will take it and says how the data may be used. Without a Runner the build works fully. Needs a Runner version bump and a skill package update (user uploads the package).

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Runner tests like the existing TOR judge tests; server tests for applying corrections and rebuilding
- [ ] Corrections listed one by one on the build page
- [ ] After deploy reviewers re-paste the install command (Runner version bump)
- [ ] lint, typecheck, tests pass

## Comments
