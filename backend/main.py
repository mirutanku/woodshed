import os
import uuid
import pathlib
from datetime import date, timedelta
import mimetypes
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session
from database import engine, get_db, Base
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from models import User, Tune, Recording, Segment, PracticeSession, PracticeEntry, Performance, SetlistEntry, Setlist, CheckIn, TunePlayback
from schemas import (
    UserCreate, GoogleLogin, UserResponse, TokenResponse, UserUpdate, PasswordChange,
    TuneCreate, TuneUpdate, TuneResponse,
    RecordingResponse,
    SegmentCreate, SegmentUpdate, SegmentResponse,
    PracticeSessionCreate, PracticeSessionResponse,
    PracticeEntryCreate, PracticeEntryResponse, PracticeSessionUpdate, PracticeEntryUpdate, PerformanceCreate, PerformanceUpdate, PerformanceResponse, SetlistCreate, SetlistResponse, SetlistUpdate, SetlistEntryCreate, SetlistEntryResponse,
    EmailUpdate, ForgotPassword, ResetPassword, SetPassword, LinkGoogle, DeleteAccount
)
from auth import hash_password, verify_password, create_access_token, decode_access_token, create_reset_token, decode_reset_token
from email_service import send_password_reset_email
from fastapi.security import HTTPBearer

load_dotenv()

Base.metadata.create_all(bind=engine)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".mp4", ".wma", ".aiff", ".opus"}
ALLOWED_MIME_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/flac", "audio/ogg", "audio/aac", "audio/m4a",
    "audio/mp4", "video/mp4", "audio/x-m4a",
}

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

app = FastAPI()
security = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",      # Vite dev server
        "http://woodshed.fm",       # Production URL
        os.getenv("FRONTEND_URL", ""),  # Custom domain if needed
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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

def get_user_tune(tune_id: int, user_id: int, db: Session) -> Tune:
    tune = db.query(Tune).filter(Tune.id == tune_id, Tune.user_id == user_id).first()
    if not tune:
        raise HTTPException(status_code=404, detail="Tune not found")
    return tune

@app.get("/api/users/me")
def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "has_password": current_user.password_hash is not None,
        "has_google": current_user.google_id is not None,
        "created_at": current_user.created_at,
    }

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
    if not db_user or not db_user.password_hash or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(db_user.id)
    return {"access_token": token, "token_type": "bearer"}

@app.post("/api/auth/google", response_model=TokenResponse)
def google_login(
    data: GoogleLogin,
    db: Session = Depends(get_db),
):
    try:
        idinfo = id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    
    google_id = idinfo["sub"]
    email = idinfo.get("email")
    name = idinfo.get("name", "")

    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        # Check if email is already taken
        if email:
            existing_email = db.query(User).filter(User.email == email).first()
            if existing_email:
                raise HTTPException(
                    status_code=400,
                    detail="An account with this email already exists. Log in with your username and password, then link Google in Settings."
                )

        base_username = name.lower().replace(" ", "") or "user"
        username = base_username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}{counter}"
            counter += 1

        user = User(
            username=username,
            email=email,
            google_id=google_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer"}


@app.patch("/api/users/me", response_model=UserResponse)
def update_user(
    updates: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if updates.username:
        existing = db.query(User).filter(
            User.username == updates.username, User.id != current_user.id
        ).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = updates.username
    db.commit()
    db.refresh(current_user)
    return current_user

@app.post("/api/users/me/password", status_code=204)
def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="No password set. Use Google login or set a password first.")
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return

@app.post("/api/users/me/set-password", status_code=204)
def set_password(
    data: SetPassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.password_hash:
        raise HTTPException(status_code=400, detail="Password already set. Use the change password flow.")
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return


# --- Email update ---

@app.patch("/api/users/me/email", status_code=200)
def update_email(
    data: EmailUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Check if email is already taken by another user
    existing = db.query(User).filter(
        User.email == data.email, User.id != current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use by another account")

    current_user.email = data.email
    db.commit()
    return {"email": current_user.email}


# --- Link Google account ---

@app.post("/api/users/me/link-google", status_code=200)
def link_google(
    data: LinkGoogle,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        idinfo = id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_id = idinfo["sub"]
    email = idinfo.get("email")

    # Check if this Google account is already linked to a different user
    existing = db.query(User).filter(
        User.google_id == google_id, User.id != current_user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="This Google account is already linked to a different Woodshed account"
        )

    current_user.google_id = google_id
    # Also set email if user doesn't have one yet
    if not current_user.email and email:
        current_user.email = email

    db.commit()
    return {
        "message": "Google account linked",
        "email": current_user.email,
        "has_google": True,
    }


# --- Unlink Google account ---

@app.post("/api/users/me/unlink-google", status_code=200)
def unlink_google(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Cannot unlink Google — you have no password set. Set a password first."
        )
    current_user.google_id = None
    db.commit()
    return {"message": "Google account unlinked", "has_google": False}


# --- Delete account ---

@app.delete("/api/users/me", status_code=204)
def delete_account(
    data: DeleteAccount,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.password_hash:
        if not data.password:
            raise HTTPException(status_code=400, detail="Password required to delete account")
        if not verify_password(data.password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Incorrect password")
        
    # Delete all user data in order (respecting foreign keys)
    db.query(CheckIn).filter(CheckIn.user_id == current_user.id).delete()
    db.query(TunePlayback).filter(TunePlayback.user_id == current_user.id).delete()
    db.query(SetlistEntry).filter(
        SetlistEntry.setlist_id.in_(
            db.query(Setlist.id).filter(Setlist.user_id == current_user.id)
        )
    ).delete(synchronize_session=False)
    db.query(Setlist).filter(Setlist.user_id == current_user.id).delete()
    db.query(Performance).filter(Performance.user_id == current_user.id).delete()
    db.query(PracticeEntry).filter(
        PracticeEntry.session_id.in_(
            db.query(PracticeSession.id).filter(PracticeSession.user_id == current_user.id)
        )
    ).delete(synchronize_session=False)
    db.query(PracticeSession).filter(PracticeSession.user_id == current_user.id).delete()
    db.query(Segment).filter(
        Segment.recording_id.in_(
            db.query(Recording.id).join(Tune).filter(Tune.user_id == current_user.id)
        )
    ).delete(synchronize_session=False)
    db.query(Recording).filter(
        Recording.tune_id.in_(
            db.query(Tune.id).filter(Tune.user_id == current_user.id)
        )
    ).delete(synchronize_session=False)
    db.query(Tune).filter(Tune.user_id == current_user.id).delete()
    db.delete(current_user)
    db.commit()


# --- Password reset ---

@app.post("/api/auth/forgot-password", status_code=200)
def forgot_password(
    data: ForgotPassword,
    db: Session = Depends(get_db),
):
    # Always return success to prevent email enumeration
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        token = create_reset_token(user.id)
        frontend_url = os.getenv("FRONTEND_URL", "https://woodshed.fm")
        reset_link = f"{frontend_url}/reset-password?token={token}"
        try:
            send_password_reset_email(user.email, reset_link)
        except Exception as e:
            # Log the error but don't expose it to the user
            print(f"Failed to send reset email: {e}")

    return {"message": "If an account with that email exists, a reset link has been sent."}

@app.get("/api/auth/reset-token-info", status_code=200)
def reset_token_info(token: str):
    user_id = decode_reset_token(token)
    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    db = next(get_db())
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    return {"username": user.username}

@app.post("/api/auth/reset-password", status_code=200)
def reset_password(
    data: ResetPassword,
    db: Session = Depends(get_db),
):
    user_id = decode_reset_token(data.token)
    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Password has been reset. You can now log in."}


# --- Health check ---

@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# --- Tunes ---

@app.get("/api/tunes", response_model=list[TuneResponse])
def get_tunes(
    status: str | None = None,
    starred: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Tune).filter(Tune.user_id == current_user.id)
    query = query.filter(Tune.archived == False)    # Show only active tunes
    if status:
        query = query.filter(Tune.status == status)
    if starred is not None:
        query = query.filter(Tune.starred == starred)
    tunes = query.order_by(Tune.title).all()

    results = []
    for tune in tunes:
        last_practiced = (
            db.query(sql_func.max(PracticeSession.date))
            .join(PracticeEntry, PracticeEntry.session_id == PracticeSession.id)
            .filter(PracticeEntry.tune_id == tune.id)
            .scalar()
        )
        results.append({
            "id": tune.id,
            "title": tune.title,
            "composer": tune.composer,
            "key": tune.key,
            "tempo": tune.tempo,
            "form": tune.form,
            "status": tune.status,
            "starred": tune.starred,
            "archived": tune.archived,
            "notes": tune.notes,
            "created_at": tune.created_at,
            "recording_count": len(tune.recordings),
            "last_practiced": last_practiced.isoformat() if last_practiced else None,
        })
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
    tune = get_user_tune(tune_id, current_user.id, db)
    return {**tune.__dict__, "recording_count": len(tune.recordings)}

@app.patch("/api/tunes/{tune_id}", response_model=TuneResponse)
def update_tune(
    tune_id: int,
    updates: TuneUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(tune, key, value)
    db.commit()
    db.refresh(tune)
    return {**tune.__dict__, "recording_count": len(tune.recordings)}

@app.post("/api/tunes/{tune_id}/star", status_code=200)
def toggle_star(
    tune_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)
    tune.starred = not tune.starred
    db.commit()
    return {"starred": tune.starred}

@app.delete("/api/tunes/{tune_id}", status_code=204)
def delete_tune(
    tune_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)

    if tune.practice_entries:
        tune.archived = True # Soft delete if there are associated practice entries
        db.commit()
        return
    db.query(SetlistEntry).filter(SetlistEntry.tune_id == tune_id).delete()
    db.delete(tune)
    db.commit()


# --- Recordings (file upload) ---

@app.get("/api/tunes/{tune_id}/recordings", response_model=list[RecordingResponse])
def get_recordings(
    tune_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)
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
    tune = get_user_tune(tune_id, current_user.id, db)

    # Validate file type, extension, and size before writing to disk
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    mime_ok = not file.content_type or file.content_type in ALLOWED_MIME_TYPES
    ext_ok = ext in ALLOWED_EXTENSIONS

    if not (mime_ok or ext_ok):
        raise HTTPException(status_code=400, detail="File must be an audio file")
    
    stored_filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_filename)

    # Write the file to disk
    with open(filepath, "wb") as f:
        file_size = 0
        while chunk := await file.read(8192):
            file_size += len(chunk)
            if file_size > 50 * 1024 * 1024:
                f.close()
                os.remove(filepath)
                raise HTTPException(status_code=400, detail="File too large (max 50MB)")
            f.write(chunk)

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

@app.get("/api/recordings/{recording_id}/stream")
def stream_recording(
    recording_id: int,
    token: str = None,
    db: Session = Depends(get_db),
):
    # Auth from query param since <audio> can't set headers
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    recording = (
        db.query(Recording)
        .join(Tune)
        .filter(Recording.id == recording_id, Tune.user_id == user.id)
        .first()
    )
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    filepath = os.path.join(UPLOAD_DIR, recording.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    content_type = mimetypes.guess_type(filepath)[0] or "application/octet-stream"

    return FileResponse(
        filepath,
        media_type=content_type,
        filename=recording.original_name,
    )

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

    # Also record a check-in for the streak
    session_date = session.date
    existing_checkin = db.query(CheckIn).filter(
        CheckIn.user_id == current_user.id,
        CheckIn.date == session_date,
    ).first()
    if not existing_checkin:
        db.add(CheckIn(user_id=current_user.id, date=session_date))

    db.commit()
    db.refresh(db_session)

    entry_responses = []
    for entry in db_session.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    return {**db_session.__dict__, "entries": entry_responses}

@app.patch("/api/sessions/{session_id}", response_model=PracticeSessionResponse)
def update_session(
    session_id: int,
    updates: PracticeSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id, PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(session, key, value)
    db.commit()
    db.refresh(session)

    entry_responses = []
    for entry in session.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    return {**session.__dict__, "entries": entry_responses}

@app.delete("/api/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id, PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()

@app.post("/api/sessions/{session_id}/entries", response_model=PracticeEntryResponse, status_code=201)
def add_entry_to_session(
    session_id: int,
    entry: PracticeEntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id, PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    tune = db.query(Tune).filter(
        Tune.id == entry.tune_id, Tune.user_id == current_user.id
    ).first()
    if not tune:
        raise HTTPException(status_code=400, detail="Tune not found")

    db_entry = PracticeEntry(session_id=session_id, **entry.model_dump())
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return {**db_entry.__dict__, "tune_title": tune.title}

@app.patch("/api/sessions/{session_id}/entries/{entry_id}", response_model=PracticeEntryResponse)
def update_entry(
    session_id: int,
    entry_id: int,
    updates: PracticeEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = (
        db.query(PracticeEntry)
        .join(PracticeSession)
        .filter(
            PracticeEntry.id == entry_id,
            PracticeSession.id == session_id,
            PracticeSession.user_id == current_user.id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    db.commit()
    db.refresh(entry)
    return {**entry.__dict__, "tune_title": entry.tune.title if entry.tune else ""}

@app.delete("/api/sessions/{session_id}/entries/{entry_id}", status_code=204)
def delete_entry(
    session_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = (
        db.query(PracticeEntry)
        .join(PracticeSession)
        .filter(
            PracticeEntry.id == entry_id,
            PracticeSession.id == session_id,
            PracticeSession.user_id == current_user.id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()


# --- Performances ---

@app.get("/api/performances", response_model=list[PerformanceResponse])
def get_performances(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Performance)
        .filter(Performance.user_id == current_user.id)
        .order_by(Performance.date)
        .all()
    )

@app.post("/api/performances", response_model=PerformanceResponse, status_code=201)
def create_performance(
    performance: PerformanceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_performance = Performance(user_id=current_user.id, **performance.model_dump())
    db.add(db_performance)
    db.commit()
    db.refresh(db_performance)
    return db_performance

@app.patch("/api/performances/{performance_id}", response_model=PerformanceResponse)
def update_performance(
    performance_id: int,
    updates: PerformanceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    performance = db.query(Performance).filter(
        Performance.id == performance_id, Performance.user_id == current_user.id
    ).first()
    if not performance:
        raise HTTPException(status_code=404, detail="Performance not found")
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(performance, key, value)
    db.commit()
    db.refresh(performance)
    return performance

@app.delete("/api/performances/{performance_id}", status_code=204)
def delete_performance(
    performance_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    performance = db.query(Performance).filter(
        Performance.id == performance_id, Performance.user_id == current_user.id
    ).first()
    if not performance:
        raise HTTPException(status_code=404, detail="Performance not found")
    db.delete(performance)
    db.commit()


# --- Setlists ---

@app.get("/api/setlists", response_model=list[SetlistResponse])
def get_setlists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setlists = db.query(Setlist).filter(Setlist.user_id == current_user.id).all()
    results = []
    for setlist in setlists:
        entry_responses = []
        for entry in setlist.entries:
            entry_responses.append({
                **entry.__dict__,
                "tune_title": entry.tune.title if entry.tune else "",
            })
        results.append({
            **setlist.__dict__,
            "entries": entry_responses,
        })
    return results

@app.post("/api/setlists", response_model=SetlistResponse, status_code=201)
def create_setlist(
    setlist: SetlistCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_setlist = Setlist(
        user_id=current_user.id,
        title=setlist.title,
        performance_id=setlist.performance_id,
        notes=setlist.notes,
    )
    db.add(db_setlist)
    db.flush()

    for entry_data in setlist.entries:
        tune = db.query(Tune).filter(
            Tune.id == entry_data.tune_id, Tune.user_id == current_user.id
        ).first()
        if not tune:
            raise HTTPException(status_code=400, detail=f"Tune {entry_data.tune_id} not found")

        db_entry = SetlistEntry(
            setlist_id=db_setlist.id,
            **entry_data.model_dump(),
        )
        db.add(db_entry)

    db.commit()
    db.refresh(db_setlist)

    entry_responses = []
    for entry in db_setlist.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    return {**db_setlist.__dict__, "entries": entry_responses}

@app.post("/api/setlists/{setlist_id}", response_model=SetlistResponse)
def get_setlist(
    setlist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setlist = db.query(Setlist).filter(
        Setlist.id == setlist_id, Setlist.user_id == current_user.id
    ).first()
    if not setlist:
        raise HTTPException(status_code=404, detail="Setlist not found")

    entry_responses = []
    for entry in setlist.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    return {**setlist.__dict__, "entries": entry_responses}

@app.patch("/api/setlists/{setlist_id}", response_model=SetlistResponse)
def update_setlist(
    setlist_id: int,
    updates: SetlistUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setlist = db.query(Setlist).filter(
        Setlist.id == setlist_id, Setlist.user_id == current_user.id
    ).first()
    if not setlist:
        raise HTTPException(status_code=404, detail="Setlist not found")
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(setlist, key, value)
    db.commit()
    db.refresh(setlist)

    entry_responses = []
    for entry in setlist.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    return {**setlist.__dict__, "entries": entry_responses}

@app.delete("/api/setlists/{setlist_id}", status_code=204)
def delete_setlist(
    setlist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setlist = db.query(Setlist).filter(
        Setlist.id == setlist_id, Setlist.user_id == current_user.id
    ).first()
    if not setlist:
        raise HTTPException(status_code=404, detail="Setlist not found")
    db.delete(setlist)
    db.commit()

@app.put("/api/setlists/{setlist_id}/entries", response_model=SetlistResponse)
def update_setlist_entries(
    setlist_id: int,
    entries: list[SetlistEntryCreate],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setlist = db.query(Setlist).filter(
        Setlist.id == setlist_id, Setlist.user_id == current_user.id
    ).first()
    if not setlist:
        raise HTTPException(status_code=404, detail="Setlist not found")

    # Clear existing entries
    db.query(SetlistEntry).filter(SetlistEntry.setlist_id == setlist_id).delete()

    # Add new entries
    for entry_data in entries:
        tune = db.query(Tune).filter(
            Tune.id == entry_data.tune_id, Tune.user_id == current_user.id
        ).first()
        if not tune:
            raise HTTPException(status_code=400, detail=f"Tune {entry_data.tune_id} not found")

        db_entry = SetlistEntry(
            setlist_id=setlist_id,
            **entry_data.model_dump(),
        )
        db.add(db_entry)

    db.commit()
    db.refresh(setlist)

    entry_responses = []
    for entry in setlist.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    return {**setlist.__dict__, "entries": entry_responses}


# --- Practice tracking ---

@app.post("/api/checkin")
def checkin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    existing = db.query(CheckIn).filter(
        CheckIn.user_id == current_user.id,
        CheckIn.date == today,
    ).first()

    if existing:
        return {"already_checked_in": True}

    db.add(CheckIn(user_id=current_user.id, date=today))
    db.commit()
    return {"already_checked_in": False}

@app.get("/api/streak")
def get_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dates = (
        db.query(CheckIn.date)
        .filter(CheckIn.user_id == current_user.id)
        .order_by(CheckIn.date.desc())
        .all()
    )
    if not dates:
        return {"streak": 0}

    streak = 0
    expected = date.today()
    for (d,) in dates:
        if d == expected:
            streak += 1
            expected -= timedelta(days=1)
        elif d < expected:
            break

    return {"streak": streak}

@app.post("/api/tunes/{tune_id}/playback")
def record_playback(
    tune_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)
    today = date.today()
    existing = db.query(TunePlayback).filter(
        TunePlayback.user_id == current_user.id,
        TunePlayback.tune_id == tune.id,
        TunePlayback.date == today,
    ).first()

    if existing:
        return {"already_recorded": True}

    db.add(TunePlayback(user_id=current_user.id, tune_id=tune.id, date=today))
    db.commit()
    return {"already_recorded": False}

@app.get("/api/most-practiced")
def get_most_practiced(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Count practice log entries per tune
    log_counts = dict(
        db.query(PracticeEntry.tune_id, sql_func.count(PracticeEntry.id))
        .join(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .group_by(PracticeEntry.tune_id)
        .all()
    )

    # Count playback days per tune (only days not already covered by a log entry)
    playback_days = (
        db.query(TunePlayback.tune_id, TunePlayback.date)
        .filter(TunePlayback.user_id == current_user.id)
        .all()
    )

    log_dates_by_tune = {}
    log_entries = (
        db.query(PracticeEntry.tune_id, PracticeSession.date)
        .join(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .all()
    )
    for tune_id, d in log_entries:
        if tune_id not in log_dates_by_tune:
            log_dates_by_tune[tune_id] = set()
        log_dates_by_tune[tune_id].add(d)

    # Add playback-only days
    playback_only_counts = {}
    for tune_id, d in playback_days:
        if d not in log_dates_by_tune.get(tune_id, set()):
            playback_only_counts[tune_id] = playback_only_counts.get(tune_id, 0) + 1

    # Combine
    all_tune_ids = set(log_counts.keys()) | set(playback_only_counts.keys())
    combined = []
    for tune_id in all_tune_ids:
        total = log_counts.get(tune_id, 0) + playback_only_counts.get(tune_id, 0)
        tune = db.query(Tune).filter(Tune.id == tune_id).first()
        if tune:
            combined.append({
                "tune_id": tune_id,
                "title": tune.title,
                "sessions": total,
            })

    combined.sort(key=lambda x: x["sessions"], reverse=True)
    return combined[:5]


@app.get("/api/practice-profile")
def get_practice_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Get focus counts from the last 14 days
    cutoff = date.today() - timedelta(days=14)
    focus_counts = (
        db.query(PracticeEntry.focus, sql_func.count(PracticeEntry.id))
        .join(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date >= cutoff,
            PracticeEntry.focus.isnot(None),
        )
        .group_by(PracticeEntry.focus)
        .all()
    )

    if not focus_counts:
        return {"dominant_focus": None, "counts": {}}

    counts = {focus: count for focus, count in focus_counts}
    dominant = max(counts, key=counts.get)

    return {"dominant_focus": dominant, "counts": counts}


# --- Server built frontend ---

STATIC_DIR = pathlib.Path(__file__).parent / "static"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="frontend-assets")

    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        file_path = STATIC_DIR / path
        if file_path.is_file():
            return FileResponse(file_path)
        else:
            return FileResponse(STATIC_DIR / "index.html")
