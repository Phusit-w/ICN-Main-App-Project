# 12: SOC Runner link, token and heartbeat

**What to build:** A user downloads a SOC Runner config from `/soc` that is already tied to their account (no pairing code): a per-runner token bound to exactly one user, with only a hash stored. A token-authenticated heartbeat endpoint reports the runner version and the Claude login state. The web shows whether the user's runner is online and when it was last seen. An admin can see and revoke runner links. Until ticket 16, the config is a file the runner (run from source) reads.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Downloading creates a token bound to the user, and only its hash is stored
- [ ] A heartbeat with a valid token updates the online/last-seen state, and a revoked or unknown token is refused
- [ ] The user sees the runner's online state, and an admin sees and revokes links
- [ ] Audited; tests cover token binding and revocation; lint, typecheck and build pass

## Comments
