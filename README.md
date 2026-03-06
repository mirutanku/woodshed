# Woodshed

A practice tool for musicians who learn by ear.

Organize your repertoire, loop and slow down recordings, mark passages, track your practice, and manage setlists for upcoming performances.

Built to replace the workflow of juggling YouTube at 0.75x, a notes app, a calendar, and scattered audio files. Woodshed gives structure to the practice process without getting in the way of the music.

Woodshed also offers you much better tools than YouTube, VLC, and other apps for adjusting playback as you hone your technique.

## What it does

**Recordings and segments** — Upload audio files to any tune. Mark segments (solo, bridge, head) with start/end times and loop them at any speed. Create and edit segments on the fly while listening.

**Repertoire management** — Track tunes with metadata (composer, key, tempo, form). A single tune entry can neatly bundle multiple different recordings of said tune, and you can easily switch between a tune's recordings in a single playback window.

**Progress tracking** — Organize and filter tunes with a status progression: learning → transcribing → playable → polished → retired.

**Speed control with auto-ramp** — Slow recordings down to 25% or speed them up to 150%. Auto-ramp gradually increases playback speed by a selected percentage each loop — start a passage at 50%, let it climb to full tempo automatically.

**Practice logging** — Log sessions with per-tune entries tracking focus area, tempo, duration, and self-rating. Dashboard shows weekly stats, streaks, and tempo progress over time.

**Performances and setlists** — Track upcoming gigs with countdowns. Build ordered setlists from your repertoire.

**Mobile-first practice view** — Automatic mobile detection renders a streamlined player optimized for practicing with your instrument in hand. Background playback maintains segment loops and auto-ramp.

## Architecture

- **Backend:** Python / FastAPI / SQLAlchemy / PostgreSQL
- **Frontend:** React (Vite) / vanilla CSS
- **Deployment:** Docker on Railway

```
backend/
  main.py          # API routes
  models.py        # SQLAlchemy models
  schemas.py       # Pydantic request/response schemas
  auth.py          # JWT authentication
  database.py      # DB connection

frontend/src/
  App.jsx          # Root component and routing
  components/
    TuneList.jsx          # Repertoire list with filtering and sorting
    TuneDetail.jsx        # Tune view (desktop) with recordings and segments
    MobileTuneDetail.jsx  # Tune view (mobile) with integrated player
    AudioPlayer.jsx       # Desktop audio player with looping and auto-ramp
    PracticeLog.jsx       # Session logging, stats dashboard, performances
    SetlistManager.jsx    # Setlist creation and ordering
    RecordingUpload.jsx   # File upload with mobile-friendly picker
```

## Data model

Tunes are the core entity. Everything else hangs off them:

```
User
 ├── Tune (title, composer, key, tempo, form, status, notes)
 │    ├── Recording (audio file, artist)
 │    │    └── Segment (label, start_time, end_time, color)
 │    └── PracticeEntry (focus, tempo_practiced, rating, duration)
 ├── PracticeSession (date, duration, notes, entries)
 └── Performance (title, date, time, venue, notes)
      └── Setlist
           └── SetlistEntry (tune, position)
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
```

```bash
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies API requests to the backend via Vite's dev server config.

## Future ideas

- Cloud storage integration (Google Drive Picker) for importing audio
- Sort tunes by last practiced date
- User profiles with instrument field
- S3 storage for multi-device audio access