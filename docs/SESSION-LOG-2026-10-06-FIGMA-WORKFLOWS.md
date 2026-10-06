# Session Log — Figma Workflow and Architecture Update

**Date:** 2026-10-06  
**Project:** ICN Apps / `Main_Project_Build_App`  
**FigJam:** [Expense Billing System Architecture](https://www.figma.com/board/A1ekE2b0TfTl9yS762XmY4/Expense-Billing-System-Architecture)

## Objective

Read the current project structure and update the existing FigJam board so it reflects the system that is implemented now, including application workflows, production deployment, file transfer to the server, and the latest SOC direction.

## Project structure reviewed

The source of truth used for the diagrams was the current code and deployment scripts, especially:

- `prisma/schema.prisma`
- `lib/access.ts`
- `lib/authorization.ts`
- `lib/nav.ts`
- `proxy.ts`
- `actions/records.ts`
- `actions/projectCard.ts`
- `actions/admin.ts`
- `app/(app)/**`
- `deploy/windows/update.ps1`
- `deploy/windows/stage-standalone.ps1`
- `docs/DEPLOY-WINDOWS.md`
- `docs/adr/0005-project-card-push-based-ingest.md`
- `docs/adr/0007-per-app-access.md`
- `docs/adr/0008-soc-check-runs-on-reviewer-machine.md`

The old README and some older deployment/SOC documents describe earlier versions of the system. The diagrams therefore follow the current schema, routes, ADRs, and scripts instead of relying only on the README.

## Current system summary

### Authentication and access

- Users sign in with an individual username and password.
- A signed session cookie identifies the user.
- Accounts may be `USER` or `ADMIN`.
- `ADMIN` can open every application and Admin Center.
- `USER.appAccess` controls access to:
  - Expense Billing
  - Project Card — view only
  - Project Card — view and edit
  - SOC
- Admin Center is a web application permission and is separate from Windows Administrator rights.

### Expense Billing

- Supports FA-017 and FA-018.
- Users enter employee and expense data, optionally use saved templates, and calculate travel costs.
- Saved documents appear in Records and can be edited, duplicated, moved to trash, printed, or downloaded as PDF.
- Approval remains a paper-signature process; there is no digital approval workflow.

### Project Card

- The production server cannot directly access the PS file share.
- A crawler runs on a PC that can access the share and pushes records to the authenticated ingest API.
- Users can search and filter Project Cards.
- Users with edit access can edit descriptions and classification and confirm budgets.
- Human-edited fields are protected from later crawler overwrites.

### SOC direction

- The old server-side Python SOC worker / AI-provider approach is no longer the target architecture.
- The current direction is a per-user SOC Runner on each reviewer's PC.
- The runner uses the reviewer's own Claude Pro login, downloads the job and current skill, runs checks per major item, and uploads results back to the server.
- The server stores jobs, results, and private files and provides the human-review workflow; it does not call the AI model itself.
- SOC remains work in progress and is shown as “เร็ว ๆ นี้” in the application launcher.
- Reviewer PCs do not have Windows Administrator rights. The runner must install per-user without elevation. AppLocker/WDAC may still require an IT allowlist.

## Admin clarification

The statement that “this PC cannot use admin” was interpreted as the PC not having Windows Administrator privileges, not the ICN Apps Admin Center.

The live web session for `phusit.w` was tested and successfully opened `/admin`. The page displayed Admin Center without an application error. Windows Administrator permission remains a separate constraint for installing services or software.

## FigJam changes completed

### 1. ICN Apps — User and Application Workflow

Added a workflow covering:

- Login, session validation, and mandatory password change
- Application Launcher and permission-based application visibility
- Expense Billing flow
- Project Card search, detail, edit, budget verification, and audit flow
- SOC Runner and human-review flow marked as WIP
- Admin Center functions

### 2. ICN Apps — Deployment and Data Flow

Added a diagram covering:

- User Browser
- Project Card Crawler PC
- Reviewer PC with SOC Runner
- HTTPS gateway
- Next.js full-stack application
- PostgreSQL and backup
- Private SOC file storage

### 3. Current File Upload and Server Redeploy Workflow

Documented the deployment method currently used:

1. Validate the code on the development PC.
2. Commit changes.
3. Push `origin main`.
4. Create `expense-billing-app-deploy.zip` with `git archive` from `HEAD`.
5. Connect to the Windows Server using RDP.
6. Transfer the ZIP through RDP clipboard or drive redirection.
7. Extract over `C:\Apps\expense-billing-app-deploy`.
8. Remove stale files when files were renamed or deleted between versions.
9. Run `deploy\windows\update.ps1`.

The `update.ps1` portion of the workflow includes:

- Reuse the existing service environment and secrets.
- Back up PostgreSQL.
- Stop `ExpenseBillingApp` through NSSM.
- Run `npm ci` only when the lock-file hash changed.
- Run `prisma migrate deploy`.
- Run `prisma generate`.
- Run the production build.
- Stage `.next/standalone`, `.next/static`, and `public`.
- Start the NSSM service.
- Health-check `GET /login` for HTTP 200.
- Spot-check `https://psaidemo.icn21.local`.
- On failure, inspect `service-err.log`, restore the previous code, and restore the SQL backup only when a migration changed data/schema and rollback requires it.

### 4. Native Windows Production Architecture

The existing diagram was replaced in its original location with the latest version.

Removed from the architecture:

- Python SOC Worker on the server
- SOC AI Provider on the server
- Old SOC worker queue flow

Added or updated:

- Staff Browser and Admin Browser
- Project Card Crawler PC
- PS File Share
- Reviewer PC with SOC Runner
- Label: `WIP — per-user — no Windows Admin`
- Reviewer-owned Claude Pro subscription
- HTTPS Reverse Proxy
- Next.js 16 running through NSSM
- PostgreSQL 16
- Private SOC Storage
- Scheduled PostgreSQL Backup and Backup Folder

The replacement FigJam section is named `Native Windows Production Architecture`. The outdated section was removed after the replacement was generated and visually verified.

## Files and systems changed

- **FigJam:** diagrams added and Native Windows Production Architecture replaced.
- **Repository:** this session log was added.
- **Application code/database:** no application source code, migration, or production data was changed during this session.

## Follow-up considerations

- The current ZIP-over-RDP deployment method can leave stale files after renames/deletions. Git-based deployment remains the safer long-term replacement.
- The SOC Runner installer and pairing flow are still WIP and must be validated on a real company PC without Windows Administrator rights.
- If AppLocker or WDAC blocks per-user executables, coordinate an allowlist with IT.
- Keep the SOC diagram marked WIP until the runner, pairing API, and end-to-end upload flow are production-ready.
