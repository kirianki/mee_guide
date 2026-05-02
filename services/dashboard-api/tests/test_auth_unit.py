"""
Unit tests for app/core/auth.py — pure Python, zero I/O.
"""
import pytest
from app.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from jose import JWTError


# ── Password hashing ─────────────────────────────────────────────────────────

def test_hash_password_returns_bcrypt_string():
    h = hash_password("mysecret")
    assert h.startswith("$2b$")


def test_hash_and_verify_password_roundtrip():
    plain = "correct-horse-battery-staple"
    assert verify_password(plain, hash_password(plain)) is True


def test_verify_wrong_password_returns_false():
    h = hash_password("rightpassword")
    assert verify_password("wrongpassword", h) is False


def test_verify_empty_password_against_hash_returns_false():
    h = hash_password("somepassword")
    assert verify_password("", h) is False


def test_verify_password_with_garbage_hash_returns_false():
    assert verify_password("anything", "not-a-hash") is False


# ── JWT access tokens ────────────────────────────────────────────────────────

def test_create_access_token_is_a_jwt():
    token = create_access_token("user-abc-123")
    parts = token.split(".")
    assert len(parts) == 3


def test_decode_access_token_roundtrip():
    pub_id = "publisher-uuid-456"
    token = create_access_token(pub_id)
    assert decode_access_token(token) == pub_id


def test_decode_access_token_wrong_type_raises():
    """A refresh token must NOT be accepted by decode_access_token."""
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from app.core.config import settings

    # Manually craft a token with type=refresh
    bad_token = jwt.encode(
        {
            "sub": "some-id",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            "type": "refresh",
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(JWTError):
        decode_access_token(bad_token)


# ── Refresh tokens ────────────────────────────────────────────────────────────

def test_create_refresh_token_is_opaque():
    """Refresh token must NOT be a dotted JWT."""
    token = create_refresh_token("any-id")
    assert "." not in token or token.count(".") > 2  # URL-safe base64, not JWT


def test_create_refresh_token_minimum_length():
    token = create_refresh_token("any-id")
    assert len(token) >= 48


def test_two_refresh_tokens_are_unique():
    t1 = create_refresh_token("id")
    t2 = create_refresh_token("id")
    assert t1 != t2
