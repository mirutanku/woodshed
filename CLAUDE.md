# CLAUDE.md — Woodshed (woodshed.fm)

## Project Overview

Woodshed is a full-stack jazz practice tracking app built for serious musicians. It tracks tunes, recordings, practice sessions, fundamentals work, setlists, and performances. The name comes from the jazz tradition of "woodshedding" — isolating yourself to practice intensely.

The app is built and maintained by Justin, a baritone saxophonist and senior staff writer, with Claude as an instructional development partner. This is not a team project with established conventions handed down — architectural decisions are made collaboratively, and Claude should explain the reasoning behind technical choices rather than just implementing them.

## Tech Stack

### Backend
- **Framework:** FastAPI (Python)
- **ORM:** SQLAlchemy
- **Database:** PostgreSQL
- **Auth:** Google OAuth 2.0
- **Structure:** Route modules split from original monolithic `main.py`

### Frontend
- **Framework:** React (TypeScript — migration from JavaScript is complete)
- **Build tool:** Vite
- **Styling:** Plain CSS files

### Infrastructure
- **Hosting:** Railway (single container)
- **DNS:** Cloudflare
- **Domain:** woodshed.fm
- **Database:** PostgreSQL (managed by Railway)
- **Deployment:** Multi-stage Dockerfile — Stage 1 builds the React frontend via Vite (`npm run build`), Stage 2 sets up the Python backend and copies the built frontend into `./static`. FastAPI serves both the API and the static frontend from a single container. Uvicorn runs on the port Railway assigns.
- **Uploads:** Audio recordings stored in `uploads/` directory, persisted via Railway volume mount across deploys.

## Data Model

Core entities (verify these are still current and add any new ones):

- **User** — account and preferences
- **Tune** — a song in the user's repertoire
- **Recording** — audio recording associated with a tune
- **Segment** — a marked section within a recording
- **PracticeSession** — a logged practice session with duration tracking
- **PracticeEntry** — individual tune entries within a session
- **Fundamentals** — tracked practice across 13 categories (scales, arpeggios, long tones, etc.)

## Key Features

- **Today view** with horizontal tune chips for quick access
- **Practice timer** via `useVisibilityTimer` — auto-tracks practice time using page visibility
- **Quick-log button** for fast session logging
- **Inline auto-saving tune notes** on the playback page
- **Session history** with week headers and chronological grouping
- **Setlist management** with sort options (persisted via sessionStorage)
- **Fundamentals tracking** across 13 categories with auto-logging
- **Streak tracking** with nudge feature
- **Google Calendar export** for performances
- **Reusable `ConfirmDialog` component** for destructive actions
- **UTC timezone normalization** across all date handling

## Design Principles

- **Mobile-first.** The primary use case is logging practice on a phone between sessions. Every UI decision should prioritize the mobile experience.
- **Minimize friction.** If a feature adds steps to the core workflow (pick a tune, practice, log it), it needs a very strong justification. The app should feel faster than a notebook, not slower.
- **Complete files over surgical diffs.** When changes touch multiple parts of a file or are complex, provide the entire updated file rather than fragmented patches that are hard to apply and verify.
- **Explain the why.** Justin is learning through building this project. Don't just implement — explain the reasoning, tradeoffs, and alternatives. Link concepts to fundamentals when relevant.

## Known Bugs

Track these and address when relevant work touches the affected areas:

1. **Most Practiced sessions counter frozen** — the time counter works correctly, but the sessions count doesn't update.
2. **Fundamentals-only auto-log loses Today view state** — creating a fundamentals-only session works, but the Today view forgets button selections until at least one tune is also logged.
3. **Spellcheck underline persists in notes field** — on the playback page, the red spellcheck underline remains visible after clicking out of the notes input. Visually distracting.
4. **Segment creation UX at timeline edges** — difficult to tap precisely in the first and last few seconds of a recording timeline to create segments.

## File Organization

(Fill in the current structure after the TypeScript migration. Example:)

```
woodshed/
├── backend/
│   ├── app/
│   │   ├── routes/          # split route modules
│   │   ├── models.py        # SQLAlchemy models (single file)
│   │   ├── schemas.py       # Pydantic schemas (single file)
│   │   └── main.py          # FastAPI app entry point
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # React components (.tsx)
│   │   ├── useVisibilityTimer.ts   # practice timer hook
│   │   ├── dateUtils.ts     # date/timezone utilities
│   │   └── App.tsx
│   ├── vite.config.ts
│   └── package.json
├── Dockerfile
├── CLAUDE.md                # this file
└── CHANGELOG.md             # progress tracking
```

## Working Conventions

- **Branch strategy:** Feature branches off main. The `typescript-migration` branch has been merged — all frontend code is now TypeScript.
- **When in doubt, ask.** If a design decision has meaningful tradeoffs (performance vs. readability, new dependency vs. manual implementation, etc.), surface the options rather than choosing silently.
- **Preserve existing patterns.** Before introducing a new pattern (new state management approach, new component structure, new API convention), check what the codebase already does and match it unless there's a clear reason to change.
- **Test on mobile.** Any UI change should be verified against the mobile viewport. Desktop is secondary.

## Progress Tracking

Maintain a CHANGELOG.md with dated entries summarizing completed work, decisions made, and any outstanding issues discovered during implementation. This serves as long-term memory across sessions.

## Subagent Guidance (for Claude Code)

If using subagents, the following specializations are suggested:

- **Frontend specialist** — React/TypeScript, Vite, mobile-first responsive design, component architecture. Has access to read and write frontend files only.
- **Backend specialist** — FastAPI, SQLAlchemy, PostgreSQL, Pydantic schemas, route design. Has access to read and write backend files only.
- **Bug investigator** — Read-only access to the full codebase. Given a bug description, explores the code to identify root cause and propose a fix without modifying anything.