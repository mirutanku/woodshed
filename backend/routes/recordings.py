import os
import uuid
import mimetypes
import tempfile
import subprocess
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Tune, Recording
from schemas import RecordingResponse
from auth import decode_access_token
from routes.deps import get_current_user, get_user_tune

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".mp4", ".wma", ".aiff", ".opus"}
ALLOWED_MIME_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/flac", "audio/ogg", "audio/aac", "audio/m4a",
    "audio/mp4", "video/mp4", "audio/x-m4a",
}

router = APIRouter(prefix="/api", tags=["recordings"])


@router.get("/tunes/{tune_id}/recordings", response_model=list[RecordingResponse])
def get_recordings(
    tune_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)
    return tune.recordings


@router.post("/tunes/{tune_id}/recordings", response_model=RecordingResponse, status_code=201)
async def upload_recording(
    tune_id: int,
    file: UploadFile = File(...),
    artist: str = Form(default=None),
    key: str = Form(default=None),
    description: str = Form(default=None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)

    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    mime_ok = not file.content_type or file.content_type in ALLOWED_MIME_TYPES
    ext_ok = ext in ALLOWED_EXTENSIONS

    if not (mime_ok or ext_ok):
        raise HTTPException(status_code=400, detail="File must be an audio file")

    stored_filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_filename)

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


@router.post("/tunes/{tune_id}/import-url", response_model=RecordingResponse, status_code=201)
def import_from_url(
    tune_id: int,
    url: str,
    title: str = None,
    artist: str = None,
    key: str = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)

    stored_filename = f"{uuid.uuid4().hex}.m4a"
    filepath = os.path.join(UPLOAD_DIR, stored_filename)

    try:
        dl_result = subprocess.run(
            [
                "yt-dlp",
                "-x",
                "--audio-format", "m4a",
                "--audio-quality", "0",
                "-o", filepath,
                "--no-playlist",
                url,
            ],
            capture_output=True, text=True, timeout=120,
        )
        if dl_result.returncode != 0:
            raise HTTPException(status_code=400, detail="Download failed. The URL may be unavailable or restricted.")
    except subprocess.TimeoutExpired:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=400, detail="Download timed out. Try a shorter video.")

    # yt-dlp may append extension to filename
    actual_path = filepath
    if not os.path.exists(actual_path):
        import glob
        candidates = glob.glob(filepath + ".*")
        if candidates:
            os.rename(candidates[0], actual_path)
        elif os.path.exists(filepath + ".m4a"):
            os.rename(filepath + ".m4a", actual_path)
        else:
            raise HTTPException(status_code=500, detail="Download completed but file not found.")

    file_size = os.path.getsize(actual_path)

    db_recording = Recording(
        tune_id=tune_id,
        filename=stored_filename,
        original_name=title or "Imported recording",
        artist=artist,
        key=key,
        description=None,
        file_size=file_size,
    )
    db.add(db_recording)
    db.commit()
    db.refresh(db_recording)
    return db_recording


@router.get("/import-preview")
def import_preview(
    url: str,
    current_user=Depends(get_current_user),
):
    try:
        result = subprocess.run(
            ["yt-dlp", "--no-download", "--print-json", url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail="Could not access URL. Check that the link is valid and publicly available.")
        meta = json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=400, detail="Request timed out.")
    except (json.JSONDecodeError, Exception):
        raise HTTPException(status_code=400, detail="Could not process URL.")

    duration = meta.get("duration", 0)
    if duration > 1800:
        raise HTTPException(status_code=400, detail="Recording too long (max 30 minutes).")

    return {
        "title": meta.get("title", ""),
        "artist": meta.get("uploader", ""),
        "duration": duration,
    }


@router.get("/recordings/{recording_id}/stream")
def stream_recording(
    recording_id: int,
    token: str = None,
    db: Session = Depends(get_db),
):
    from models import User

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


@router.patch("/recordings/{recording_id}", response_model=RecordingResponse)
def update_recording(
    recording_id: int,
    original_name: str = None,
    artist: str = None,
    key: str = None,
    description: str = None,
    current_user=Depends(get_current_user),
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

    if original_name is not None:
        recording.original_name = original_name
    if artist is not None:
        recording.artist = artist
    if key is not None:
        recording.key = key or None
    if description is not None:
        recording.description = description or None

    db.commit()
    db.refresh(recording)
    return recording


@router.delete("/recordings/{recording_id}", status_code=204)
def delete_recording(
    recording_id: int,
    current_user=Depends(get_current_user),
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

    filepath = os.path.join(UPLOAD_DIR, recording.filename)
    if os.path.exists(filepath):
        os.remove(filepath)

    db.delete(recording)
    db.commit()
