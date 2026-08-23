# RIDDLER

Riddler is a deterministic event platform for college challenge rounds. It provides a fullscreen-first participant experience, server-side answer validation, server-authoritative timers, event logging, admin controls, and a mobile-friendly pirate-trials presentation without any AI runtime dependency.

## Stack

- Client: React, Vite, TypeScript, React Router
- Server: Node.js, Express, TypeScript
- Database: Prisma ORM with SQLite for local development and PostgreSQL recommended for production
- Auth: session-based admin authentication with bcrypt password verification
- PWA: manifest + service worker + standalone-ready metadata

## Features

- Team registration from QR landing flow
- Fullscreen challenge shell with interruption detection
- Deterministic pseudocode answer checking
- Persistent timers backed by server timestamps
- Admin dashboard with team/task/event controls
- Event timeline logging
- Optional music and subtle sound effect hooks
- Database-driven tasks and unlock flow

## Project Structure

```text
riddler/
├── client/
├── server/
├── .env.example
├── package.json
└── README.md
```

## Installation

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file:

```bash
cp .env.example .env
```

3. Update the values for:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `CLIENT_URL`

## Database Setup

1. For local development, the default `.env.example` uses SQLite at `server/prisma/dev.db`.
2. For production, set `DATABASE_URL` to your PostgreSQL instance and maintain a PostgreSQL Prisma datasource for deployment.
3. Run Prisma sync and seed:

```bash
npm run prisma:push
npm run prisma:seed
```

## Development

Run both apps:

```bash
npm run dev
```

Client:

- `http://localhost:5173`

Server:

- `http://localhost:4000`

## Production Build

```bash
npm run build
```

Serve the generated client assets using your preferred static hosting and run the server separately with the same environment variables.

## Admin Login Setup

Admin login lives at:

- `/admin/login`

Credentials come from:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

The seed script hashes the configured admin password before storage.

## Tasks and Answers

Tasks are stored in the `Task` table and can be managed from the admin dashboard.

For answer checking:

- `answerType` supports `TEXT`, `NUMBER`, `MULTIPLE_CHOICE`, `TOWER_VERIFICATION`
- `correctAnswer` stores the canonical value server-side
- `acceptedAnswers` stores alternative accepted values as JSON

Answers are normalized on the server using trim, lowercase normalization where relevant, and numeric parsing for numeric tasks.

## Music and Sound

Participant audio is optional. The client reads:

- `VITE_API_BASE_URL`
- `VITE_MUSIC_TRACK_PATH`
- `VITE_MUSIC_ENABLED`
- `VITE_SOUNDS_ENABLED`

Replace the placeholder file at:

- `client/public/audio/odyssey-theme.mp3`

with your licensed or royalty-free soundtrack.

If the file is missing, the app still works. Audio failures are handled gracefully.

## QR Code Setup

Point the QR code directly to the participant landing route:

- `/`

Recommended flow:

1. Open the participant URL on the deployed frontend
2. Print the QR code
3. Participants scan and enter their team name

## Fullscreen Reality

Riddler requests fullscreen after explicit user interaction. Browsers do not allow forced fullscreen without user activation, and users can still exit fullscreen. The app detects interruptions, logs them, and presents a resume overlay without losing progress.

## Deployment

Provider-independent deployment works well with:

- Frontend: Vercel, Netlify, static host, or reverse-proxied Express assets
- Backend: Render, Railway, Fly.io, VPS, or container platform
- Database: SQLite locally, managed PostgreSQL in production

Required production considerations:

- set secure environment variables
- configure `CLIENT_URL`
- enable HTTPS
- use strong session secrets
- provision PostgreSQL backups

## Resetting Event Data

Recommended approaches:

1. Use admin controls to reset or disqualify teams individually.
2. For a fresh event, truncate `Submission`, `EventLog`, and `TeamTaskState`, then reset `Team` state.
3. If you want a full reset including tasks, reset the database and re-run migrations + seed.

## Error Handling

Participant-facing errors are sanitized. Raw stack traces are not returned to the browser. The server exposes only structured error payloads.

## Demo Data

The seed script creates:

- demo admin account from environment
- `BLACK PEARL` sample team only when explicitly inserted through the UI
- Round 1 sample tasks:
  - Mystery Box
  - Pirate Tower

All seed content is marked as demo-editable through descriptions and titles.
