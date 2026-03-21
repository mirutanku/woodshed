import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from database import get_db
from models import (
    User, Tune, Recording, Segment, PracticeSession, PracticeEntry,
    Performance, Setlist, SetlistEntry, CheckIn, TunePlayback,
)
from schemas import (
    UserCreate, GoogleLogin, UserResponse, TokenResponse, UserUpdate,
    PasswordChange, SetPassword, EmailUpdate, LinkGoogle, DeleteAccount,
    ForgotPassword, ResetPassword,
)
from auth import (
    hash_password, verify_password, create_access_token,
    create_reset_token, decode_reset_token,
)
from email_service import send_password_reset_email
from routes.deps import get_current_user

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/users/me")
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


@router.post("/register", response_model=UserResponse, status_code=201)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    db_user = User(username=user.username, password_hash=hash_password(user.password))
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=TokenResponse)
def login(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not db_user.password_hash or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(db_user.id)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/auth/google", response_model=TokenResponse)
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


@router.patch("/users/me", response_model=UserResponse)
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


@router.post("/users/me/password", status_code=204)
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


@router.post("/users/me/set-password", status_code=204)
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


@router.patch("/users/me/email", status_code=200)
def update_email(
    data: EmailUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(
        User.email == data.email, User.id != current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use by another account")
    current_user.email = data.email
    db.commit()
    return {"email": current_user.email}


@router.post("/users/me/link-google", status_code=200)
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

    existing = db.query(User).filter(
        User.google_id == google_id, User.id != current_user.id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="This Google account is already linked to a different Woodshed account"
        )

    current_user.google_id = google_id
    if not current_user.email and email:
        current_user.email = email

    db.commit()
    return {
        "message": "Google account linked",
        "email": current_user.email,
        "has_google": True,
    }


@router.post("/users/me/unlink-google", status_code=200)
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


@router.delete("/users/me", status_code=204)
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


@router.post("/auth/forgot-password", status_code=200)
def forgot_password(
    data: ForgotPassword,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        token = create_reset_token(user.id)
        frontend_url = os.getenv("FRONTEND_URL", "https://woodshed.fm")
        reset_link = f"{frontend_url}/reset-password?token={token}"
        try:
            send_password_reset_email(user.email, reset_link)
        except Exception as e:
            print(f"Failed to send reset email: {e}")

    return {"message": "If an account with that email exists, a reset link has been sent."}


@router.get("/auth/reset-token-info", status_code=200)
def reset_token_info(token: str):
    user_id = decode_reset_token(token)
    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    db = next(get_db())
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    return {"username": user.username}


@router.post("/auth/reset-password", status_code=200)
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
