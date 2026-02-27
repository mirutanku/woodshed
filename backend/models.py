from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, ForeignKey, Date
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
   
    tunes = relationship("Tune", back_populates="user")
    sessions = relationship("PracticeSession", back_populates="user")
    performances = relationship("Performance", back_populates="user")


class Tune(Base):
    __tablename__ = "tunes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)      # max length can be adjusted as needed
    composer = Column(String, nullable=True)        # max length can be adjusted as needed
    key = Column(String, nullable=True)
    tempo = Column(Integer, nullable=True)
    form = Column(String, nullable=True)
    status = Column(String, default="learning")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="tunes")
    recordings = relationship("Recording", back_populates="tune", cascade="all, delete-orphan") # deleting a tune also deletes its associated recordings
    practice_entries = relationship("PracticeEntry", back_populates="tune")

class Recording(Base):
    __tablename__ = "recordings"

    id = Column(Integer, primary_key=True, index=True)
    tune_id = Column(Integer, ForeignKey("tunes.id"), nullable=False)   # a tune can exist without recordings, but a recording must be associated with a tune
    filename = Column(String, nullable=False)     # stored filename on disk
    original_name = Column(String, nullable=False)   # what the user uploaded
    artist = Column(String, nullable=True)
    key = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    duration = Column(Float, nullable=True)  # in seconds
    file_size = Column(Integer, nullable=True)  # in bytes
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tune = relationship("Tune", back_populates="recordings")
    segments = relationship("Segment", back_populates="recording", cascade="all, delete-orphan") # deleting a recording also deletes its segments

class Segment(Base):
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False)
    label = Column(String, nullable=False)       # e.g. "Chorus", "Solo", etc.
    start_time = Column(Float, nullable=False)  # in seconds
    end_time = Column(Float, nullable=False)    # in seconds
    color = Column(String, nullable=True)       # for UI display, e.g. "#FF0000"
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recording = relationship("Recording", back_populates="segments")
    practice_entries = relationship("PracticeEntry", back_populates="segment")

class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    duration_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="sessions")
    entries = relationship("PracticeEntry", back_populates="session", cascade="all, delete-orphan")    #deleting a session also deletes its associated entries

class PracticeEntry(Base):
    __tablename__ = "practice_entries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("practice_sessions.id"), nullable=False)
    tune_id = Column(Integer, ForeignKey("tunes.id"), nullable=False)
    segment_id = Column(Integer, ForeignKey("segments.id", ondelete="SET NULL"), nullable=True)
    focus = Column(String, nullable=True)  # transcription, technique, memorization, tempo
    tempo_practiced = Column(Integer, nullable=True)  # in BPM
    notes = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)  # e.g. 1-5 stars
    duration_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("PracticeSession", back_populates="entries")
    tune = relationship("Tune", back_populates="practice_entries")
    segment = relationship("Segment", back_populates="practice_entries")

class Performance(Base):
    __tablename__ = "performances"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)  # e.g. "Jazz Night at Blue Note"
    date = Column(Date, nullable=False)
    time = Column(String, nullable=True)  # e.g. "7:30 PM"
    venue = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="performances")