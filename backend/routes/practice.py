from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session
from database import get_db
from models import Tune, PracticeSession, PracticeEntry, CheckIn, TunePlayback, FundamentalsEntry
from schemas import (
    PracticeSessionCreate, PracticeSessionResponse, PracticeSessionUpdate,
    PracticeEntryCreate, PracticeEntryResponse, PracticeEntryUpdate,
)
from routes.deps import get_current_user, get_user_tune

router = APIRouter(prefix="/api", tags=["practice"])


# --- Sessions ---

@router.get("/sessions", response_model=list[PracticeSessionResponse])
def get_sessions(
    current_user=Depends(get_current_user),
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
            "fundamentals": [{"id": f.id, "category": f.category, "duration_seconds": f.duration_seconds} for f in session.fundamentals],
        })
    return results


@router.post("/sessions", response_model=PracticeSessionResponse, status_code=201)
def create_session(
    session: PracticeSessionCreate,
    current_user=Depends(get_current_user),
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

    for fund in session.fundamentals:
        db.add(FundamentalsEntry(session_id=db_session.id, category=fund.category))

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
    
    fund_responses = [{"id": f.id, "category": f.category, "duration_seconds": f.duration_seconds} for f in db_session.fundamentals]
    return {**db_session.__dict__, "entries": entry_responses, "fundamentals": fund_responses}


@router.patch("/sessions/{session_id}", response_model=PracticeSessionResponse)
def update_session(
    session_id: int,
    updates: PracticeSessionUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id, PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(session, key, value)

    if updates.fundamentals is not None:
        # Clear existing and replace
        db.query(FundamentalsEntry).filter(FundamentalsEntry.session_id == session.id).delete()
        for fund in updates.fundamentals:
            db.add(FundamentalsEntry(session_id=session.id, category=fund.category))
    
    db.commit()
    db.refresh(session)

    entry_responses = []
    for entry in session.entries:
        entry_responses.append({
            **entry.__dict__,
            "tune_title": entry.tune.title if entry.tune else "",
        })
    fund_responses = [{"id": f.id, "category": f.category, "duration_seconds": f.duration_seconds} for f in session.fundamentals]
    return {**session.__dict__, "entries": entry_responses, "fundamentals": fund_responses}


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(PracticeSession).filter(
        PracticeSession.id == session_id, PracticeSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()


# --- Entries ---

@router.post("/sessions/{session_id}/entries", response_model=PracticeEntryResponse, status_code=201)
def add_entry_to_session(
    session_id: int,
    entry: PracticeEntryCreate,
    current_user=Depends(get_current_user),
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


@router.patch("/sessions/{session_id}/entries/{entry_id}", response_model=PracticeEntryResponse)
def update_entry(
    session_id: int,
    entry_id: int,
    updates: PracticeEntryUpdate,
    current_user=Depends(get_current_user),
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


@router.delete("/sessions/{session_id}/entries/{entry_id}", status_code=204)
def delete_entry(
    session_id: int,
    entry_id: int,
    current_user=Depends(get_current_user),
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


# --- Tracking ---

@router.post("/checkin")
def checkin(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()
    existing = db.query(CheckIn).filter(
        CheckIn.user_id == current_user.id,
        CheckIn.date == today,
    ).first()

    if existing:
        return {"already_checked_in": True}

    db.add(CheckIn(user_id=current_user.id, date=today))
    db.commit()
    return {"already_checked_in": False}


@router.get("/streak")
def get_streak(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()

    dates = (
        db.query(CheckIn.date)
        .filter(CheckIn.user_id == current_user.id)
        .order_by(CheckIn.date.desc())
        .all()
    )
    if not dates:
        return {"streak": 0, "practiced_today": False}

    date_set = {d[0] for d in dates}
    practiced_today = today in date_set

    streak = 0
    expected = today if practiced_today else today - timedelta(days=1)

    while expected in date_set:
        streak += 1
        expected -= timedelta(days=1)

    return {"streak": streak, "practiced_today": practiced_today}


@router.post("/tunes/{tune_id}/playback")
def record_playback(
    tune_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    tune = get_user_tune(tune_id, current_user.id, db)
    today = date.fromisoformat(client_date) if client_date else date.today()
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


@router.post("/tunes/{tune_id}/play-time")
def record_play_time(
    tune_id: int,
    seconds: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()
    tune = get_user_tune(tune_id, current_user.id, db)

    playback = db.query(TunePlayback).filter(
        TunePlayback.user_id == current_user.id,
        TunePlayback.tune_id == tune.id,
        TunePlayback.date == today,
    ).first()

    if not playback:
        return {"play_seconds": 0}

    playback.play_seconds += seconds
    db.commit()
    return {"play_seconds": playback.play_seconds}


@router.post("/quick-log")
def quick_log(
    tune_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()
    tune = get_user_tune(tune_id, current_user.id, db)

    session = (
        db.query(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date == today,
            PracticeSession.is_quick_log == True,
        )
        .first()
    )

    if not session:
        session = PracticeSession(user_id=current_user.id, date=today, is_quick_log=True)
        db.add(session)
        db.flush()

    existing_entry = db.query(PracticeEntry).filter(
        PracticeEntry.session_id == session.id,
        PracticeEntry.tune_id == tune.id,
    ).first()

    if existing_entry:
        return {"already_logged": True, "session_id": session.id}

    db.add(PracticeEntry(session_id=session.id, tune_id=tune.id))
    db.commit()

    existing_checkin = db.query(CheckIn).filter(
        CheckIn.user_id == current_user.id,
        CheckIn.date == today,
    ).first()
    if not existing_checkin:
        db.add(CheckIn(user_id=current_user.id, date=today))
        db.commit()

    return {"already_logged": False, "session_id": session.id}


@router.post("/quick-log-fundamental")
def quick_log_fundamental(
    category: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()

    # Find today's quick-log session
    session = (
        db.query(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date == today,
            PracticeSession.is_quick_log == True,
        )
        .first()
    )

    if not session:
        session = PracticeSession(user_id=current_user.id, date=today, is_quick_log=True)
        db.add(session)
        db.flush()

    # Check if already logged
    existing = db.query(FundamentalsEntry).filter(
        FundamentalsEntry.session_id == session.id,
        FundamentalsEntry.category == category,
    ).first()

    if existing:
        return {"already_logged": True, "session_id": session.id}

    db.add(FundamentalsEntry(session_id=session.id, category=category))
    db.commit()

    # Also create a check-in for the streak
    existing_checkin = db.query(CheckIn).filter(
        CheckIn.user_id == current_user.id,
        CheckIn.date == today,
    ).first()
    if not existing_checkin:
        db.add(CheckIn(user_id=current_user.id, date=today))
        db.commit()

    return {"already_logged": False, "session_id": session.id}


@router.delete("/quick-log-fundamental")
def remove_quick_log_fundamental(
    category: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()

    session = (
        db.query(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date == today,
            PracticeSession.is_quick_log == True,
        )
        .first()
    )

    if not session:
        return {"removed": False}

    entry = db.query(FundamentalsEntry).filter(
        FundamentalsEntry.session_id == session.id,
        FundamentalsEntry.category == category,
    ).first()

    if not entry:
        return {"removed": False}

    db.delete(entry)
    db.commit()
    return {"removed": True}


@router.patch("/quick-log-fundamental")
def update_quick_log_fundamental(
    category: str,
    duration_seconds: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()

    session = (
        db.query(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date == today,
            PracticeSession.is_quick_log == True,
        )
        .first()
    )

    if not session:
        return {"updated": False}

    entry = db.query(FundamentalsEntry).filter(
        FundamentalsEntry.session_id == session.id,
        FundamentalsEntry.category == category,
    ).first()

    if not entry:
        return {"updated": False}

    entry.duration_seconds = duration_seconds
    db.commit()
    return {"updated": True, "duration_seconds": duration_seconds}


@router.get("/most-practiced")
def get_most_practiced(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    mode: str = "sessions",
):
    if mode == "time":
        results = (
            db.query(
                TunePlayback.tune_id,
                sql_func.sum(TunePlayback.play_seconds).label("total_seconds"),
            )
            .filter(TunePlayback.user_id == current_user.id)
            .group_by(TunePlayback.tune_id)
            .having(sql_func.sum(TunePlayback.play_seconds) > 0)
            .order_by(sql_func.sum(TunePlayback.play_seconds).desc())
            .limit(5)
            .all()
        )

        tunes = db.query(Tune).filter(Tune.id.in_([r[0] for r in results])).all()
        tune_map = {t.id: t.title for t in tunes}

        archived_map = {t.id: t.archived for t in tunes}
        return [
            {
                "tune_id": tune_id,
                "title": tune_map.get(tune_id, "Unknown"),
                "seconds": total_seconds,
                "archived": archived_map.get(tune_id, False),
            }
            for tune_id, total_seconds in results
        ]
    else:
        log_counts = dict(
            db.query(PracticeEntry.tune_id, sql_func.count(PracticeEntry.id))
            .join(PracticeSession)
            .filter(PracticeSession.user_id == current_user.id)
            .group_by(PracticeEntry.tune_id)
            .all()
        )

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

        playback_only_counts = {}
        for tune_id, d in playback_days:
            if d not in log_dates_by_tune.get(tune_id, set()):
                playback_only_counts[tune_id] = playback_only_counts.get(tune_id, 0) + 1

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
                    "archived": tune.archived,
                })

        combined.sort(key=lambda x: x["sessions"], reverse=True)
        return combined[:5]


@router.get("/recent-fundamentals")
def get_recent_fundamentals(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cutoff = date.today() - timedelta(days=14)
    results = (
        db.query(FundamentalsEntry.category, sql_func.count(FundamentalsEntry.id))
        .join(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date >= cutoff,
        )
        .group_by(FundamentalsEntry.category)
        .order_by(sql_func.count(FundamentalsEntry.id).desc())
        .limit(4)
        .all()
    )
    return [{"category": cat, "count": count} for cat, count in results]


@router.get("/today")
def get_today(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()

    played_tune_ids = (
        db.query(TunePlayback.tune_id)
        .filter(
            TunePlayback.user_id == current_user.id,
            TunePlayback.date == today,
        )
        .all()
    )
    played_ids = {t[0] for t in played_tune_ids}

    logged_entries = (
        db.query(PracticeEntry.tune_id, PracticeEntry.focus)
        .join(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date == today,
        )
        .all()
    )
    logged_by_tune = {}
    for tune_id, focus in logged_entries:
        if tune_id not in logged_by_tune:
            logged_by_tune[tune_id] = []
        if focus:
            logged_by_tune[tune_id].append(focus)

    # Fundamentals logged today
    fundamentals_today = (
        db.query(FundamentalsEntry.category, FundamentalsEntry.duration_seconds)
        .join(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date == today,
        )
        .all()
    )
    fundamentals_list = [
        {"category": f[0], "duration_seconds": f[1]}
        for f in fundamentals_today
    ]

    all_tune_ids = played_ids | set(logged_by_tune.keys())

    if not all_tune_ids:
        return {"tunes": [], "fundamentals": fundamentals_list, "date": today.isoformat()}

    tunes = db.query(Tune).filter(Tune.id.in_(all_tune_ids), Tune.archived == False).all()
    tune_map = {t.id: t.title for t in tunes}

    result = []
    for tune_id in all_tune_ids:
        if tune_id not in tune_map:
            continue
        result.append({
            "tune_id": tune_id,
            "title": tune_map[tune_id],
            "played": tune_id in played_ids,
            "logged": tune_id in logged_by_tune,
            "focus": logged_by_tune.get(tune_id, []),
        })

    result.sort(key=lambda x: x["title"])

    return {"tunes": result, "fundamentals": fundamentals_list, "date": today.isoformat()}


@router.get("/weekly-hours")
def get_weekly_hours(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
    client_date: str = None,
):
    today = date.fromisoformat(client_date) if client_date else date.today()
    start_of_week = today - timedelta(days=today.weekday() + 1)
    if today.weekday() == 6:
        start_of_week = today

    playback_seconds = (
        db.query(sql_func.coalesce(sql_func.sum(TunePlayback.play_seconds), 0))
        .filter(
            TunePlayback.user_id == current_user.id,
            TunePlayback.date >= start_of_week,
        )
        .scalar()
    )

    # Fundamentals seconds this week
    fundamentals_seconds = (
        db.query(sql_func.coalesce(sql_func.sum(FundamentalsEntry.duration_seconds), 0))
        .join(PracticeSession)
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date >= start_of_week,
        )
        .scalar()
    )

    manual_minutes = (
        db.query(sql_func.coalesce(sql_func.sum(PracticeSession.duration_minutes), 0))
        .filter(
            PracticeSession.user_id == current_user.id,
            PracticeSession.date >= start_of_week,
        )
        .scalar()
    )

    total_minutes = (playback_seconds / 60) + manual_minutes + (fundamentals_seconds / 60)
    return {"minutes": round(total_minutes), "hours": round(total_minutes / 60, 1)}


@router.get("/practice-profile")
def get_practice_profile(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
