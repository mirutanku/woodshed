from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from database import get_db
from models import User, Tune
from auth import decode_access_token

security = HTTPBearer()


def get_current_user(
    credentials=Depends(security),
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
