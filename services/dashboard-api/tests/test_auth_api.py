"""
Integration tests for dashboard-api auth HTTP endpoints.
Uses ASGI test client with a mocked DB session — no live Postgres required.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.exc import IntegrityError


pytestmark = pytest.mark.anyio


# ── Health ────────────────────────────────────────────────────────────────────

async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ── Register ──────────────────────────────────────────────────────────────────

async def test_register_returns_201_with_tokens(client, mock_db):
    # Simulate DB returning a publisher UUID
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = "pub-uuid-001"
    mock_db.execute.return_value = mock_result

    resp = await client.post(
        "/v1/dashboard/auth/register",
        json={"name": "Alice", "email": "alice@example.com", "password": "strongpass123"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_register_short_password_returns_400(client):
    resp = await client.post(
        "/v1/dashboard/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "short"},
    )
    assert resp.status_code == 400
    assert "8 characters" in resp.json()["detail"]


async def test_register_duplicate_email_returns_409(client, mock_db):
    mock_db.execute.side_effect = IntegrityError(None, None, Exception("duplicate"))

    resp = await client.post(
        "/v1/dashboard/auth/register",
        json={"name": "Carol", "email": "carol@example.com", "password": "validpass456"},
    )
    assert resp.status_code == 409
    assert "already registered" in resp.json()["detail"]


async def test_register_invalid_email_returns_422(client):
    resp = await client.post(
        "/v1/dashboard/auth/register",
        json={"name": "Dan", "email": "not-an-email", "password": "validpass456"},
    )
    assert resp.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

async def test_login_success_returns_tokens(client, mock_db):
    from app.core.auth import hash_password

    pw_hash = hash_password("correctpassword")
    row = MagicMock()
    row.id = "pub-uuid-002"
    row.password_hash = pw_hash

    # First call: SELECT id,password_hash — returns publisher row
    # Second call: INSERT publisher_sessions — returns dummy result
    mock_result_login = MagicMock()
    mock_result_login.first.return_value = row
    mock_result_session = MagicMock()
    mock_db.execute.side_effect = [mock_result_login, mock_result_session]

    resp = await client.post(
        "/v1/dashboard/auth/login",
        json={"email": "alice@example.com", "password": "correctpassword"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body


async def test_login_wrong_password_returns_401(client, mock_db):
    from app.core.auth import hash_password

    pw_hash = hash_password("realpassword")
    row = MagicMock()
    row.id = "pub-uuid-003"
    row.password_hash = pw_hash

    mock_result = MagicMock()
    mock_result.first.return_value = row
    mock_db.execute.return_value = mock_result

    resp = await client.post(
        "/v1/dashboard/auth/login",
        json={"email": "alice@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


async def test_login_unknown_email_returns_401(client, mock_db):
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_db.execute.return_value = mock_result

    resp = await client.post(
        "/v1/dashboard/auth/login",
        json={"email": "ghost@example.com", "password": "doesntmatter"},
    )
    assert resp.status_code == 401
