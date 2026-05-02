import bcrypt
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from app.core.config import settings


def hash_password(plain: str) -> str:
    # bcrypt handles encoding and salt generation internally
    # Note: bcrypt has a 72-byte limit; native library handles this or errors gracefully
    pwd_bytes = plain.encode('utf-8')
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_access_token(publisher_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {"sub": publisher_id, "exp": expire, "type": "access"},
        settings.JWT_SECRET,
        algorithm="HS256",
    )


def create_refresh_token(publisher_id: str) -> str:
    """Creates an opaque refresh token (UUID-based). The caller must hash and store it."""
    import secrets
    return secrets.token_urlsafe(48)


def decode_access_token(token: str) -> str:
    """Returns publisher_id from a valid access token, raises JWTError otherwise."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    if payload.get("type") != "access":
        raise JWTError("Not an access token")
    return payload["sub"]
