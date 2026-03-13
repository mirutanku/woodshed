import os
import jwt
from datetime import datetime, timedelta, timezone
from passlib.hash import bcrypt
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret_key")

def hash_password(password: str) -> str:
    return bcrypt.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.verify(password, password_hash)

def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return int(payload.get("sub"))
    except (jwt.PyJWTError, ValueError, TypeError):
        return None

def create_reset_token(user_id: int) -> str:
    """Create a short-lived token for password reset (1 hour expiry)."""
    payload = {
        "sub": str(user_id),
        "purpose": "password_reset",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def decode_reset_token(token: str) -> int | None:
    """Decode a password reset token. Returns user_id or None if invalid/expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        if payload.get("purpose") != "password_reset":
            return None
        return int(payload.get("sub"))
    except (jwt.PyJWTError, ValueError, TypeError):
        return None
