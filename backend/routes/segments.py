from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Tune, Recording, Segment
from schemas import SegmentCreate, SegmentUpdate, SegmentResponse
from routes.deps import get_current_user

router = APIRouter(prefix="/api", tags=["segments"])


@router.get("/recordings/{recording_id}/segments", response_model=list[SegmentResponse])
def get_segments(
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
    return recording.segments


@router.post("/recordings/{recording_id}/segments", response_model=SegmentResponse, status_code=201)
def create_segment(
    recording_id: int,
    segment: SegmentCreate,
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

    db_segment = Segment(recording_id=recording_id, **segment.model_dump())
    db.add(db_segment)
    db.commit()
    db.refresh(db_segment)
    return db_segment


@router.patch("/segments/{segment_id}", response_model=SegmentResponse)
def update_segment(
    segment_id: int,
    updates: SegmentUpdate,
    current_user=Depends(get_current_user),
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


@router.delete("/segments/{segment_id}", status_code=204)
def delete_segment(
    segment_id: int,
    current_user=Depends(get_current_user),
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
