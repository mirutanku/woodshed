from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Tune, Performance, Setlist, SetlistEntry
from schemas import (
    PerformanceCreate, PerformanceUpdate, PerformanceResponse,
    SetlistCreate, SetlistResponse, SetlistUpdate,
    SetlistEntryCreate, SetlistEntryResponse,
)
from routes.deps import get_current_user

router = APIRouter(prefix="/api", tags=["setlists"])


# --- Performances ---

@router.get("/performances", response_model=list[PerformanceResponse])
def get_performances(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Performance)
        .filter(Performance.user_id == current_user.id)
        .order_by(Performance.date)
        .all()
    )


@router.post("/performances", response_model=PerformanceResponse, status_code=201)
def create_performance(
    performance: PerformanceCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_performance = Performance(user_id=current_user.id, **performance.model_dump())
    db.add(db_performance)
    db.commit()
    db.refresh(db_performance)
    return db_performance


@router.patch("/performances/{performance_id}", response_model=PerformanceResponse)
def update_performance(
    performance_id: int,
    updates: PerformanceCreate,
    current_user=Depends(get_current_user),
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


@router.delete("/performances/{performance_id}", status_code=204)
def delete_performance(
    performance_id: int,
    current_user=Depends(get_current_user),
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

@router.get("/setlists", response_model=list[SetlistResponse])
def get_setlists(
    current_user=Depends(get_current_user),
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


@router.post("/setlists", response_model=SetlistResponse, status_code=201)
def create_setlist(
    setlist: SetlistCreate,
    current_user=Depends(get_current_user),
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


@router.post("/setlists/{setlist_id}", response_model=SetlistResponse)
def get_setlist(
    setlist_id: int,
    current_user=Depends(get_current_user),
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


@router.patch("/setlists/{setlist_id}", response_model=SetlistResponse)
def update_setlist(
    setlist_id: int,
    updates: SetlistUpdate,
    current_user=Depends(get_current_user),
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


@router.delete("/setlists/{setlist_id}", status_code=204)
def delete_setlist(
    setlist_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setlist = db.query(Setlist).filter(
        Setlist.id == setlist_id, Setlist.user_id == current_user.id
    ).first()
    if not setlist:
        raise HTTPException(status_code=404, detail="Setlist not found")
    db.delete(setlist)
    db.commit()


@router.put("/setlists/{setlist_id}/entries", response_model=SetlistResponse)
def update_setlist_entries(
    setlist_id: int,
    entries: list[SetlistEntryCreate],
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setlist = db.query(Setlist).filter(
        Setlist.id == setlist_id, Setlist.user_id == current_user.id
    ).first()
    if not setlist:
        raise HTTPException(status_code=404, detail="Setlist not found")

    db.query(SetlistEntry).filter(SetlistEntry.setlist_id == setlist_id).delete()

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
