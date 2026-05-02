"""
Auth endpoints — register, login, refresh, logout.
Passwords: bcrypt (cost 12).
Tokens: JWT access (15 min) + opaque refresh (30 days, stored hashed in publisher_sessions).
"""
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from app.core.database import get_db
from app.core.config import settings

router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _issue_token_pair(publisher_id: str, db: AsyncSession, request: Request) -> TokenResponse:
    """Create access + refresh tokens, store refresh token hash in publisher_sessions."""
    access_token = create_access_token(str(publisher_id))
    refresh_token = create_refresh_token(str(publisher_id))
    refresh_hash = bcrypt.hashpw(refresh_token.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    await db.execute(text("""
        INSERT INTO publisher_sessions
            (publisher_id, refresh_token_hash, expires_at, user_agent, ip_address)
        VALUES
            (:pid, :hash, :exp, :ua, :ip)
    """), {
        "pid": str(publisher_id),
        "hash": refresh_hash,
        "exp": expires_at,
        "ua": request.headers.get("user-agent"),
        "ip": request.client.host if request.client else None,
    })
    await db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new publisher. Issues JWT token pair on success."""
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    pw_hash = hash_password(body.password)

    try:
        result = await db.execute(text("""
            INSERT INTO publishers (name, email, password_hash, api_key_hash)
            VALUES (:name, :email, :pw, '')
            RETURNING id
        """), {"name": body.name, "email": body.email, "pw": pw_hash})
        await db.commit()
        publisher_id = result.scalar_one()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    return await _issue_token_pair(publisher_id, db, request)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate publisher. Returns JWT access + refresh token pair."""
    result = await db.execute(
        text("SELECT id, password_hash FROM publishers WHERE email = :email"),
        {"email": body.email},
    )
    row = result.first()

    if not row or not verify_password(body.password, row.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return await _issue_token_pair(row.id, db, request)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Rotate refresh token.
    Validates the submitted token against stored bcrypt hashes, issues a new pair,
    and immediately revokes the used token (rotation).
    """
    # Find all active (non-revoked, non-expired) sessions
    result = await db.execute(text("""
        SELECT id, publisher_id, refresh_token_hash
        FROM publisher_sessions
        WHERE revoked_at IS NULL
          AND expires_at > now()
    """))
    sessions = result.fetchall()

    matched = None
    for session in sessions:
        try:
            if bcrypt.checkpw(body.refresh_token.encode('utf-8'), session.refresh_token_hash.encode('utf-8')):
                matched = session
                break
        except Exception:
            continue

    if not matched:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Revoke the used token immediately
    await db.execute(text("""
        UPDATE publisher_sessions SET revoked_at = now() WHERE id = :id
    """), {"id": matched.id})
    await db.commit()

    return await _issue_token_pair(matched.publisher_id, db, request)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Revoke a refresh token (immediate logout)."""
    result = await db.execute(text("""
        SELECT id, refresh_token_hash
        FROM publisher_sessions
        WHERE revoked_at IS NULL AND expires_at > now()
    """))
    sessions = result.fetchall()

    for session in sessions:
        try:
            if bcrypt.checkpw(body.refresh_token.encode('utf-8'), session.refresh_token_hash.encode('utf-8')):
                await db.execute(text("""
                    UPDATE publisher_sessions SET revoked_at = now() WHERE id = :id
                """), {"id": session.id})
                await db.commit()
                return
        except Exception:
            continue

    # Token not found — treat as already logged out (idempotent)
