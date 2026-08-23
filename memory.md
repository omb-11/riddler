# RIDDLER Memory

## Product Intent

Riddler is a production-oriented event website for a college department competition. It is designed as a fullscreen-first puzzle application with a premium ancient-maritime aesthetic and strictly deterministic runtime logic. No AI, LLM, inference SDK, or external generative service is allowed anywhere in the runtime flow.

## Brand

- Name: `RIDDLER`
- Round theme: `The Pirate Trials`
- Tagline: `ENTER THE TRIAL. SOLVE THE RIDDLE. CLAIM THE TREASURE.`
- Visual direction:
  - dark ocean
  - parchment and bronze
  - minimalist interface
  - ancient Greek / Odyssey influence
  - cinematic but restrained
  - mobile-first challenge shell

## Core Runtime Rules

- No AI services at runtime.
- All answer evaluation is deterministic and server-side.
- Correct answers should not be exposed in participant-facing frontend code.
- The browser is treated honestly:
  - fullscreen can only be requested after user interaction
  - fullscreen exit can be detected and logged
  - interruptions can pause the experience if configured
  - the app cannot truly trap the user in the browser

## Required User Journey

1. Participant scans QR code and lands on the welcome screen.
2. Participant enters team name.
3. Backend creates or restores a team session and persists it.
4. Frontend requests fullscreen after the click event.
5. Background music may begin only after that same interaction path.
6. Team enters Round 1 rules screen.
7. Team begins the trial.
8. Task 1 starts with a persisted server-backed timer.
9. Answer submission is validated on the server.
10. Correct completion unlocks Task 2.
11. Task 2 is submitted for operator verification.
12. Admin/operator marks it complete.
13. Completion order is recorded and visible on the admin dashboard.

## Current Implementation

### Repository Layout

- Root workspace with `client` and `server`
- Root `package.json` configured with npm workspaces
- Environment template in `.env.example`
- Project documentation in `README.md`
- Local build memory in this `memory.md`

### Backend

- Stack:
  - Express 5
  - TypeScript
  - Prisma
  - PostgreSQL
  - session auth with `express-session` + `connect-pg-simple`
  - bcrypt admin password verification
  - Zod validation
  - Helmet, CORS, rate limiting

### Backend Data Model

Implemented Prisma models:

- `Team`
- `Task`
- `TeamTaskState`
- `Submission`
- `EventLog`
- `AdminUser`
- `AppConfig`

Important enums:

- `TeamStatus`
- `TaskStateStatus`
- `AnswerType`
- `EventType`

### Backend Feature Coverage

Implemented or scaffolded server routes:

- Public:
  - `POST /api/teams/session`
  - `GET /api/session`
  - `POST /api/trial/begin`
  - `POST /api/events`
  - `POST /api/tasks/:taskId/submit`
  - `POST /api/tasks/:taskId/tower-submit`
  - `POST /api/trial/resume`
  - `GET /api/health`

- Admin:
  - `POST /api/admin/login`
  - `POST /api/admin/logout`
  - `GET /api/admin/me`
  - `GET /api/admin/dashboard`
  - `GET /api/admin/teams`
  - `GET /api/admin/teams/:teamId/timeline`
  - `POST /api/admin/teams/:teamId/reset`
  - `POST /api/admin/teams/:teamId/disqualify`
  - `POST /api/admin/teams/:teamId/advance`
  - `POST /api/admin/teams/:teamId/complete-task/:taskId`
  - `DELETE /api/admin/teams/:teamId`
  - `POST /api/admin/tasks`
  - `PUT /api/admin/tasks/:taskId`
  - `DELETE /api/admin/tasks/:taskId`
  - `POST /api/admin/config`
  - `POST /api/admin/event/reset`

### Deterministic Answer Checking

Server-side evaluator currently supports:

- `NUMBER`
- `TEXT`
- `MULTIPLE_CHOICE`
- `TOWER_VERIFICATION` as admin-verification-only mode

Normalization rules implemented:

- trim whitespace
- collapse repeated whitespace
- lowercase normalization for text-like answers
- numeric coercion for numeric answers
- accepted answer variants

### Timer Strategy

- Task start is persisted in `TeamTaskState.startedAt`
- Deadline is persisted in `TeamTaskState.deadlineAt`
- Expiry is checked server-side on submission and task access flows
- Negative time is prevented by frontend countdown clamping plan and backend expiry checks

### Event Integrity

Logged events include:

- team creation / session resume
- round start
- task start
- answer submit / correct / wrong
- task completion
- fullscreen enter / exit
- tab visible / hidden
- round completion
- admin event controls

### Demo Seed Data

Seeded:

- Admin user from env vars
- App config row
- Task 1: `Mystery Box`
- Task 2: `Pirate Tower`
- Test team: `BLACK PEARL`

## Frontend Status

Frontend scaffolding exists:

- Vite + React + TypeScript
- manifest
- service worker
- icon SVG
- root entry point

Remaining frontend implementation still to complete:

- participant challenge shell
- fullscreen overlay
- timer component
- pseudocode viewer
- answer submission UI
- success/error transitions
- music and SFX controls
- admin login page
- admin dashboard page
- responsive styling

## Design Principles To Preserve

- no navbar/footer clutter
- clean top-line challenge state
- minimal but premium visual hierarchy
- large touch targets
- no generic bootstrap look
- no cartoon pirate motifs
- subtle motion only

## Implementation Constraints To Preserve

- keep architecture simple
- prefer REST
- avoid unnecessary dependencies
- protect admin routes
- never hardcode secrets
- keep participant UI inside app shell
- log interruptions instead of pretending they are impossible

## Open Work Remaining

1. Finish the full React participant experience.
2. Finish the full React admin interface.
3. Add frontend audio system with graceful fallback.
4. Add fullscreen + visibility tracking hooks.
5. Add timer rendering from persisted deadlines.
6. Add admin task management forms.
7. Add participant and admin API service layer.
8. Verify end-to-end type consistency.
9. Run install/build checks once dependencies can be installed.

## Notes For Continuation

- This repository started empty.
- The user clarified that the deliverable must be a real website, not a non-UI implementation.
- `memory.md` was added specifically to preserve project memory, requirements, and implementation state in-repo.
