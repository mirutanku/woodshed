import os
import uuid
from datetime import date
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from database import engine, get_db, Base
from models import User, Tune, Recording, Segment, PracticeSession, PracticeEntry
from schemas import (
    UserCreate, UserResponse, TokenResponse,
    TuneCreate, TuneUpdate, TuneResponse,
    RecordingResponse,
    SegmentCreate, SegmentUpdate, SegmentResponse,
    PracticeSessionCreate, PracticeSessionResponse,
    PracticeEntryCreate, PracticeEntryResponse,
)
from auth import hash_password, verify_password, create_access_token, decode_access_token
from fastapi.security import HTTPBearer

load_dotenv()

Base.metadata.create_all(bind=engine)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()
security = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files as static files
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# --- Auth ---

def get_current_user(
    credentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@app.post("/api/register", response_model=UserResponse, status_code=201)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    db_user = User(username=user.username, password_hash=hash_password(user.password))
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/login", response_model=TokenResponse)
def login(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(db_user.id)
    return {"access_token": token, "token_type": "bearer"}


# --- Tunes ---

@app.get("/api/tunes", response_model=list[TuneResponse])
def get_tunes(
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Tune).filter(Tune.user_id == current_user.id)
    if status:
        query = query.filter(Tune.status == status)
    tunes = query.order_by(Tune.title).all()

    results = []
    for tune in tunes:
        tune_dict = {
            "id": tune.id,
            "title": tune.title,
            "composer": tune.composer,
            "key": tune.key,
            "tempo": tune.tempo,
            "form": tune.form,
            "status": tune.status,
            "notes": tune.notes,
            "created_at": tune.created_at,
            "recording_count": len(tune.recordings),
        }
        results.append(tune_dict)
    return results

@app.post("/api/tunes", response_model=TuneResponse, status_code=201)
def create_tune(
    tune: TuneCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_tune = Tune(user_id=current_user.id, **tune.model_dump())
    db.add(db_tune)
    db.commit()
    db.refresh(db_tune)
    return {**db_tune.__dict__, "recording_count": 0}

@app.get("/api/tunes/{tune_id}", response_model=TuneResponse)
def get_tune(
    tune_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = db.query(Tune).filter(Tune.id == tune_id, Tune.user_id == current_user.id).first()
    if not tune:
        raise HTTPException(status_code=404, detail="Tune not found")
    return {**tune.__dict__, "recording_count": len(tune.recordings)}

@app.patch("/api/tunes/{tune_id}", response_model=TuneResponse)
def update_tune(
    tune_id: int,
    updates: TuneUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = db.query(Tune).filter(Tune.id == tune_id, Tune.user_id == current_user.id).first()
    if not tune:
        raise HTTPException(status_code=404, detail="Tune not found")
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(tune, key, value)
    db.commit()
    db.refresh(tune)
    return {**tune.__dict__, "recording_count": len(tune.recordings)}

@app.delete("/api/tunes/{tune_id}", status_code=204)
def delete_tune(
    tune_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = db.query(Tune).filter(Tune.id == tune_id, Tune.user_id == current_user.id).first()
    if not tune:
        raise HTTPException(status_code=404, detail="Tune not found")

    # Prevent deletion if there's practice history
    if tune.practice_entries:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a tune with practice history. Set its status to 'retired' instead.",
        )

    db.delete(tune)
    db.commit()


# --- Recordings (file upload) ---

@app.get("/api/tunes/{tune_id}/recordings", response_model=list[RecordingResponse])
def get_recordings(
    tune_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = db.query(Tune).filter(Tune.id == tune_id, Tune.user_id == current_user.id).first()
    if not tune:
        raise HTTPException(status_code=404, detail="Tune not found")
    return tune.recordings

@app.post("/api/tunes/{tune_id}/recordings", response_model=RecordingResponse, status_code=201)
async def upload_recording(
    tune_id: int,
    file: UploadFile = File(...),
    artist: str = Form(default=None),
    key: str = Form(default=None),
    description: str = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = db.query(Tune).filter(Tune.id == tune_id, Tune.user_id == current_user.id).first()
    if not tune:
        raise HTTPException(status_code=404, detail="Tune not found")

    # Validate file type
    allowed_types = {
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
        "audio/flac", "audio/ogg", "audio/aac", "audio/m4a", "audio/mp4",
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File must be an audio file")

    # Generate a unique filename to avoid collisions
    ext = os.path.splitext(file.filename)[1] or ".mp3"
    stored_filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_filename)

    # Write the file to disk
    contents = await file.read()
    file_size = len(contents)

    # Enforce size limit (50MB)
    if file_size > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    with open(filepath, "wb") as f:
        f.write(contents)

    db_recording = Recording(
        tune_id=tune_id,
        filename=stored_filename,
        original_name=file.filename,
        artist=artist,
        key=key,
        description=description,
        file_size=file_size,
    )
    db.add(db_recording)
    db.commit()
    db.refresh(db_recording)
    return db_recording

@app.delete("/api/recordings/{recording_id}", status_code=204)
def delete_recording(
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recording = (
        db.query(Recording)
        .join(Tune)
        .filter(Recording.id == recording_id, Tune.user_id == current_user.id)
        .first()
    )
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Delete the file from disk
    filepath = os.path.join(UPLOAD_DIR, recording.filename)
    if os.path.exists(filepath):
        os.remove(filepath)

    db.delete(recording)
    db.commit()


# --- Segments ---

@app.get("/api/recordings/{recording_id}/segments", response_model=list[SegmentResponse])
def get_segments(
    recording_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recording = (
        db.query(Recording)
        .join(Tune)
        .filter(Recording.id == recording_id, Tune.user_id == current_user.id)
        .first()
    )
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    return recording.segments

@app.post("/api/recordings/{recording_id}/segments", response_model=SegmentResponse, status_code=201)
def create_segment(
    recording_id: int,
    segment: SegmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recording = (
        db.query(Recording)
        .join(Tune)
        .filter(Recording.id == recording_id, Tune.user_id == current_user.id)
        .first()
    )
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    db_segment = Segment(recording_id=recording_id, **segment.model_dump())
    db.add(db_segment)
    db.commit()
    db.refresh(db_segment)
    return db_segment

@app.patch("/api/segments/{segment_id}", response_model=SegmentResponse)
def update_segment(
    segment_id: int,
    updates: SegmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    segment = (
        db.query(Segment)
        .join(Recording)
        .join(Tune)
        .filter(Segment.id == segment_id, Tune.user_id == current_user.id)
        .first()
    )
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(segment, key, value)
    db.commit()
    db.refresh(segment)
    return segment

@app.delete("/api/segments/{segment_id}", status_code=204)
def delete_segment(
    segment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    segment = (
        db.query(Segment)
        .join(Recording)
        .join(Tune)
        .filter(Segment.id == segment_id, Tune.user_id == current_user.id)
        .first()
    )
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    db.delete(segment)
    db.commit()


# --- Practice Sessions ---

@app.get("/api/sessions", response_model=list[PracticeSessionResponse])
def get_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .order_by(PracticeSession.date.desc())
        .all()
    )
    results = []
    for session in sessions:
        entry_responses = []
        for entry in session.entries:
            entry_responses.append({
                **entry.__dict__,
                "tune_title": entry.tune.title if entry.tune else "",
            })
        results.append({
            **session.__dict__,
            "entries": entry_responses,
        })
    return results

@app.post("/api/sessions", response_model=PracticeSessionResponse, status_code=201)
def create_session(
    session: PracticeSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_session = PracticeSession(
        user_id=current_user.id,
        date=session.date,
        duration_minutes=session.duration_minutes,
        notes=session.notes,
    )
    db.add(db_session)
    db.flush()

    for entry_data in session.entries:
        # Verify the tune belongs to this user
        tune = db.query(Tune).filter(
            Tune.id == entry_data.tune_id, Tune.user_id == current_user.id
        ).first()
        if not tune:
            raise HTTPException(status_code=400, detail=f"Tune {entry_data.tune_id} not found")

        db_entry = PracticeEntry(
            session_id=db_session.id,
            **entry_data.model_dump(),
        )
        db.add(db_entry)

    db.commit()
    db.refresh(db_session)

    entry_responses = []
    for entry in db_session.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    return {**db_session.__dict__, "entries": entry_responses}