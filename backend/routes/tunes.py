import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session
from database import get_db
from models import Tune, PracticeSession, PracticeEntry, SetlistEntry
from schemas import TuneCreate, TuneUpdate, TuneResponse
from routes.deps import get_current_user, get_user_tune


UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

router = APIRouter(prefix="/api", tags=["tunes"])

@router.get("/tunes", response_model=list[TuneResponse])
def get_tunes(
    status: str | None = None,
    starred: bool | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Tune).filter(Tune.user_id == current_user.id)
    query = query.filter(Tune.archived == False)
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


@router.post("/tunes", response_model=TuneResponse, status_code=201)
def create_tune(
    tune: TuneCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_tune = Tune(user_id=current_user.id, **tune.model_dump())
    db.add(db_tune)
    db.commit()
    db.refresh(db_tune)
    return {**db_tune.__dict__, "recording_count": 0}


@router.get("/tunes/{tune_id}", response_model=TuneResponse)
def get_tune(
    tune_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)

    if tune.archived:
        raise HTTPException(status_code=404, detail="Tune not found")
    
    last_practiced = (
        db.query(sql_func.max(PracticeSession.date))
        .join(PracticeEntry, PracticeEntry.session_id == PracticeSession.id)
        .filter(PracticeEntry.tune_id == tune.id)
        .scalar()
    )
    return {
        **tune.__dict__,
        "recording_count": len(tune.recordings),
        "last_practiced": last_practiced.isoformat() if last_practiced else None,
    }


@router.patch("/tunes/{tune_id}", response_model=TuneResponse)
def update_tune(
    tune_id: int,
    updates: TuneUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(tune, key, value)
    db.commit()
    db.refresh(tune)
    return {**tune.__dict__, "recording_count": len(tune.recordings)}


@router.post("/tunes/{tune_id}/star", status_code=200)
def toggle_star(
    tune_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)
    tune.starred = not tune.starred
    db.commit()
    return {"starred": tune.starred}


@router.delete("/tunes/{tune_id}", status_code=204)
def delete_tune(
    tune_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tune = get_user_tune(tune_id, current_user.id, db)

    if tune.practice_entries:
        for rec in tune.recordings:
            filepath = os.path.join(UPLOAD_DIR, rec.filename)
            if os.path.exists(filepath):
                os.remove(filepath)
        tune.recordings.clear()
        tune.archived = True
        db.commit()
        return
    db.query(SetlistEntry).filter(SetlistEntry.tune_id == tune_id).delete()
    db.delete(tune)
    db.commit()
