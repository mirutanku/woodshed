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
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return v

class GoogleLogin(BaseModel):
    credential: str

class LinkGoogle(BaseModel):
    credential: str

class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserUpdate(BaseModel):
    username: str | None = None

    @field_validator("username")
    @classmethod
    def username_rules(cls, v):
        if v is None:
            return v
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Username must be 50 characters or fewer")
        return v

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_rules(cls, v):
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return v

class EmailUpdate(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_rules(cls, v):
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v.lower().strip()

class ForgotPassword(BaseModel):
    email: str

class ResetPassword(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_rules(cls, v):
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return v
    
class SetPassword(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_rules(cls, v):
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return v


# --- Tunes ---

class TuneValidators(BaseModel):
    @field_validator("status", check_fields=False)
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        allowed = { "learning", "polishing", "mastering" }
        if v not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(allowed)}")
        return v

class TuneCreate(TuneValidators):
    title: str
    composer: str | None = None
    key: str | None = None
    tempo: int | None = None
    form: str | None = None
    status: str = "learning"
    starred: bool = False
    archived: bool = False
    notes: str | None = None

class TuneUpdate(TuneValidators):
    title: str | None = None
    composer: str | None = None
    key: str | None = None
    tempo: int | None = None
    form: str | None = None
    status: str | None = None
    starred: bool | None = None
    archived: bool | None = None
    notes: str | None = None

class TuneResponse(BaseModel):
    id: int
    title: str
    composer: str | None
    key: str | None
    tempo: int | None
    form: str | None
    status: str
    starred: bool
    archived: bool
    notes: str | None
    created_at: datetime
    recording_count: int = 0
    last_practiced: str | None = None

    class Config:
        from_attributes = True


# --- Recordings ---

class RecordingResponse(BaseModel):
    id: int
    tune_id: int
    filename: str
    original_name: str
    artist: str | None
    key: str | None
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


# --- Fundamentals ---

class FundamentalsEntryCreate(BaseModel):
    category: str

class FundamentalsEntryResponse(BaseModel):
    id: int
    category: str
    duration_seconds: int | None = None

    class Config:
        from_attributes = True


# --- Practice Sessions ---

class PracticeEntryValidators(BaseModel):
    @field_validator("focus", check_fields=False)
    @classmethod
    def validate_focus(cls, v):
        if v is None:
            return v
        allowed = { "technique", "tempo", "tone", "rhythm", "memorization", "transcription", "improvisation", }
        if v is not None and v not in allowed:
            raise ValueError(f"Focus must be one of: {', '.join(allowed)}")
        return v

class PracticeEntryCreate(PracticeEntryValidators):
    tune_id: int    # entries are necessarily associated with a tune, not a recording nor necessarily a segment
    segment_id: int | None = None
    focus: str | None = None
    tempo_practiced: int | None = None
    notes: str | None = None
    rating: int | None = None  # e.g. 1-5 stars
    duration_minutes: int | None = None

class PracticeEntryUpdate(PracticeEntryValidators):
    tune_id: int | None = None
    focus: str | None = None
    tempo_practiced: int | None = None
    duration_minutes: int | None = None
    notes: str | None = None
    rating: int | None = None

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
    entries: list[PracticeEntryCreate] = []
    fundamentals: list[FundamentalsEntryCreate] = []

class PracticeSessionUpdate(BaseModel):
    date: str | None = None
    duration_minutes: int | None = None
    notes: str | None = None
    fundamentals: list[FundamentalsEntryCreate] | None = None

class PracticeSessionResponse(BaseModel):
    id: int
    date: date
    duration_minutes: int | None
    notes: str | None
    is_quick_log: bool | None = None
    entries: list[PracticeEntryResponse] = []
    fundamentals: list[FundamentalsEntryResponse] = []
    created_at: datetime | None = None

    class Config:
        from_attributes = True


# --- Performances ---

class PerformanceCreate(BaseModel):
    title: str
    date: date
    time: str | None = None
    venue: str | None = None
    notes: str | None = None

class PerformanceUpdate(BaseModel):
    title: str | None = None
    date: str | None = None
    time: str | None = None
    venue: str | None = None
    notes: str | None = None

class PerformanceResponse(BaseModel):
    id: int
    title: str
    date: date
    time: str | None
    venue: str | None
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# -- Setlists ---

class SetlistEntryCreate(BaseModel):
    tune_id: int
    position: int

class SetlistEntryResponse(BaseModel):
    id: int
    tune_id: int
    position: int
    tune_title: str = ""

    class Config:
        from_attributes = True

class SetlistCreate(BaseModel):
    title: str
    performance_id: int | None = None
    notes: str | None = None
    entries: list[SetlistEntryCreate] = [] # a setlist is comprised of setlist entries

class SetlistUpdate(BaseModel):
    title: str | None = None
    performance_id: int | None = None
    notes: str | None = None

class SetlistResponse(BaseModel):
    id: int
    title: str
    performance_id: int | None
    notes: str | None
    created_at: datetime
    entries: list[SetlistEntryResponse] = []

    class Config:
        from_attributes = True


# --- Account deletion ---

class DeleteAccount(BaseModel):
    password: str | None = None