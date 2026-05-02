# Woodshed

A practice tool for musicians who learn by ear.

Upload recordings, loop and slow down passages, mark segments, track your practice, and manage setlists for upcoming gigs — all in one place.

Built to replace the workflow of juggling YouTube at 0.75x, a notes app, a calendar, and scattered audio files. Woodshed gives structure to the practice process without getting in the way of the music.

<img src="https://github.com/user-attachments/assets/deb47a66-7fc6-4df0-814b-43e6c670fcc3" alt="Woodshed" style="max-width: 100%;" />

## What it does

### Recordings and playback

Upload audio files to any tune. A single tune can bundle multiple recordings — your own take, a studio version, a live cut — and you switch between them in one playback view. Mark segments (head, solo, bridge, outro) with start/end times, loop them at any speed, and create new segments on the fly while listening.

### Speed control with auto-ramp

Slow recordings down to 25% or speed them up to 150%. Auto-ramp gradually increases playback speed by a configurable percentage each loop — start a passage at 50%, let it climb to full tempo automatically.

### Repertoire management

Track tunes by status: learning, polishing, or mastering. Star your priority tunes. Filter and sort your library. Each tune has an inline notes field that auto-saves on blur — a scratchpad for reminders, trouble spots, and where you left off.

### Practice tracking

The app automatically tracks how long you spend on each tune using page visibility detection — no manual time entry needed. A quick-log button on the playback view lets you record what you practiced with a single tap. The practice dashboard shows what you played today, your weekly hours, your streak, and your most practiced tunes (toggleable between session count and time spent). Detailed session logging is available for users who want to record focus areas, tempos, and notes per tune.

### Performances and setlists

Track upcoming gigs with venue, time, and countdown. Add performances to Google Calendar with one tap. Build ordered setlists from your repertoire and link them to performances.

### Mobile-first design

Automatic mobile detection renders a streamlined player optimized for practicing with your instrument in hand. Background playback maintains segment loops and auto-ramp even when the app is backgrounded. Practice time continues to track while audio plays in another app.

## Architecture

- **Backend:** Python / FastAPI / SQLAlchemy / PostgreSQL
- **Frontend:** React (Vite) / vanilla CSS
- **Auth:** JWT + Google OAuth
- **Email:** Resend (password reset)
- **Deployment:** Docker on Railway with Cloudflare DNS

```
backend/
  main.py              # App setup and router registration
  routes/
    deps.py            # Shared auth dependencies
    auth.py            # Register, login, Google OAuth, password reset, account management
    tunes.py           # Tune CRUD, starring, archive
    recordings.py      # Audio upload, streaming, deletion
    segments.py        # Segment CRUD
    practice.py        # Sessions, entries, check-in, streak, playback tracking, dashboard data
    setlists.py        # Setlists, performances
  models.py            # SQLAlchemy models
  schemas.py           # Pydantic request/response schemas
  auth.py              # JWT and reset token utilities
  database.py          # DB connection
  email_service.py     # Resend integration

frontend/src/
  App.jsx              # Root component and routing
  api.js               # Axios instance
  dateUtils.js         # Timezone-aware date helpers
  constants.js         # Shared constants (focus options, etc.)
  useVisibilityTimer.js  # Page presence timer for auto time tracking
  components/
    TuneList.jsx             # Repertoire with status filters, star toggles, sorting
    TuneDetail.jsx           # Desktop tune view with inline notes, recordings, segments
    MobileTuneDetail.jsx     # Mobile playback with quick-log and segment marking
    AudioPlayer.jsx          # Audio player with looping, speed control, auto-ramp
    PracticeLog.jsx          # Dashboard, session history, performances
    PracticeProfile.jsx      # Focus-based musician quotes
    TodayView.jsx            # Today's activity chips
    SessionForm.jsx          # Checklist-style session logger
    SetlistManager.jsx       # Setlist creation, sorting, performance linking
    SetlistChecklist.jsx     # Ordered setlist editor
    ConfirmDialog.jsx        # Reusable modal for destructive actions
    KeyPicker.jsx            # Tonic/quality key selector
    RecordingUpload.jsx      # Audio file upload
    Settings.jsx             # Account, email, password, Google linking
```

## Data model

```
User
 ├── Tune (title, composer, key, status, starred, archived, notes)
 │    ├── Recording (audio file, artist, key, description)
 │    │    └── Segment (label, start_time, end_time, color)
 │    └── TunePlayback (date, play_seconds)
 ├── PracticeSession (date, notes, is_quick_log)
 │    └── PracticeEntry (tune, focus, tempo_practiced, notes, rating)
 ├── CheckIn (date)
 ├── Performance (title, date, time, venue, notes)
 │    └── Setlist (title, notes)
 │         └── SetlistEntry (tune, position, notes)
 └── Settings (email, password, Google link)
```

## Running locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/woodshed
SECRET_KEY=your-secret-key
UPLOAD_DIR=uploads
GOOGLE_CLIENT_ID=your-google-client-id
RESEND_API_KEY=your-resend-api-key
FROM_EMAIL=noreply@woodshed.fm
FRONTEND_URL=http://localhost:5173
```

```bash
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

```bash
npm run dev
```

The frontend proxies API requests to the backend via Vite's dev server config.
