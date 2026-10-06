# 16: Installer that needs no admin rights

**What to build:** Package the SOC Runner as a Windows `.exe` and build an installer that a reviewer downloads from `/soc`, already carrying their token. It installs entirely in the user profile with no admin rights: it bundles the runtime, installs Claude Code silently (plus a portable Git if Claude Code still needs it), registers per-user autostart, and opens the Claude sign-in once. Re-downloading and installing again repairs a broken install. The download page explains the SmartScreen warning in Thai. It must be checked by hand on a real company PC.

Spec: `../spec.md`. Vocabulary: `docs/SOC-DOMAIN-GLOSSARY.md`. ADR: 0008.

**Blocked by:** 14 (and IT's answer on AppLocker/WDAC and unsigned installers)

**Status:** ready-for-human

- [ ] IT's answer is recorded in Comments before the build starts
- [ ] On a company PC without admin rights: download, install, sign-in and the first check all work with no other steps
- [ ] The runner starts again after a reboot
- [ ] Re-installing repairs a broken install
- [ ] The SmartScreen explanation is on the download page
- [ ] The manual test steps and results are written in Comments

## Comments
