from pydantic import BaseModel, field_validator
from datetime import datetime, date


# --- Auth ---

class UserCreate(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_rules(cls, v):
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Username must be 50 characters or fewer")
        return v

    @field_validator("password")
    @classmethod
    def password_max_length(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return v
    
class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Tunes ---

class TuneCreate(BaseModel):
    title: str
    composer: str | None = None
    key: str | None = None
    tempo: int | None = None
    form: str | None = None
    status: str = "learning"
    notes: str | None = None

class TuneUpdate(BaseModel):
    title: str | None = None
    composer: str | None = None
    key: str | None = None
    tempo: int | None = None
    form: str | None = None
    status: str | None = None
    notes: str | None = None

class TuneResponse(BaseModel):
    id: int
    title: str
    composer: str | None
    key: str | None
    tempo: int | None
    form: str | None
    status: str
    notes: str | None
    recording_count: int = 0

    class Config:
        from_attributes = True


# --- Recordings ---

class RecordingResponse(BaseModel):
    id: int
    tune_id: int
    filename: str
    original_name: str
    artist: str | None
    description: str | None
    duration: float | None
    file_size: int | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Segments ---

class SegmentCreate(BaseModel):
    label: str
    start_time: float
    end_time: float
    color: str | None = None
    notes: str | None = None

class SegmentUpdate(BaseModel):
    label: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    color: str | None = None
    notes: str | None = None

class SegmentResponse(BaseModel):
    id: int
    recording_id: int
    label: str
    start_time: float
    end_time: float
    color: str | None
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Practice Sessions ---

class PracticeEntryCreate(BaseModel):
    tune_id: int    # entries are necessarily associated with a tune, not a recording nor necessarily a segment
    segment_id: int | None = None
    focus: str | None = None
    tempo_practiced: int | None = None
    notes: str | None = None
    rating: int | None = None  # e.g. 1-5 stars
    duration_minutes: int | None = None

class PracticeEntryResponse(BaseModel):
    id: int
    tune_id: int
    segment_id: int | None
    focus: str | None
    tempo_practiced: int | None
    notes: str | None
    rating: int | None
    duration_minutes: int | None
    tune_title: str = ""

    class Config:
        from_attributes = True

class PracticeSessionCreate(BaseModel):
    date: date
    duration_minutes: int | None = None
    notes: str | None = None
    entries: list[PracticeEntryCreate] = [] # a practice session is comprised of practice entries

class PracticeSessionResponse(BaseModel):
    id: int
    date: date
    duration_minutes: int | None
    notes: str | None
    created_at: datetime
    entries: list[PracticeEntryResponse] = []
    
    class Config:
        from_attributes = True