"""
Unit tests for the guide-registry routing logic.
Mocks Redis cache and DB session — no live I/O.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


pytestmark = pytest.mark.anyio


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_db(row=None):
    """Return a mock AsyncSession whose execute().first() returns `row`."""
    db = AsyncMock()
    result = MagicMock()
    result.first.return_value = row
    db.execute.return_value = result
    return db


# ── route_guide_request unit tests ────────────────────────────────────────────

async def test_route_returns_cache_hit_when_redis_has_data():
    from app.core.router import route_guide_request

    cached_payload = {
        "guides": [{"id": "g1"}],
        "indexEntry": None,
        "cacheHit": False,
    }
    with patch("app.core.router.cache_get", AsyncMock(return_value=cached_payload)), \
         patch("app.core.router.cache_set", AsyncMock()):
        result = await route_guide_request(
            domain="example.com",
            path="/",
            lang="en",
            persona=None,
            snapshot_hash="abc123",
            db=_make_db(),
        )
    assert result["cacheHit"] is True
    assert result["guides"][0]["id"] == "g1"


async def test_route_skips_cache_when_no_snapshot_hash():
    from app.core.router import route_guide_request

    mock_cache_get = AsyncMock(return_value=None)
    with patch("app.core.router.cache_get", mock_cache_get), \
         patch("app.core.router.fetch_publisher_guide", AsyncMock(return_value=None)), \
         patch("app.core.router.cache_set", AsyncMock()):
        await route_guide_request(
            domain="example.com",
            path="/",
            lang="en",
            persona=None,
            snapshot_hash=None,  # no hash
            db=_make_db(),
        )
    mock_cache_get.assert_not_called()


async def test_route_returns_publisher_guide_on_db_hit():
    from app.core.router import route_guide_request

    guide = {"id": "g42", "title": "Demo Guide", "steps": []}
    with patch("app.core.router.cache_get", AsyncMock(return_value=None)), \
         patch("app.core.router.fetch_publisher_guide", AsyncMock(return_value=guide)), \
         patch("app.core.router.cache_set", AsyncMock()):
        result = await route_guide_request(
            domain="example.com",
            path="/dashboard",
            lang="en",
            persona=None,
            snapshot_hash="xyz",
            db=_make_db(),
        )
    assert result["guides"] == [guide]
    assert result["cacheHit"] is False
    assert result.get("requiresInference") is None


async def test_route_requires_inference_on_total_miss():
    from app.core.router import route_guide_request

    with patch("app.core.router.cache_get", AsyncMock(return_value=None)), \
         patch("app.core.router.fetch_publisher_guide", AsyncMock(return_value=None)), \
         patch("app.core.router.fetch_sii_exact", AsyncMock(return_value=None)), \
         patch("app.core.router.cache_set", AsyncMock()):
        result = await route_guide_request(
            domain="unknown.com",
            path="/nowhere",
            lang="en",
            persona=None,
            snapshot_hash="miss",
            db=_make_db(),
        )
    assert result["requiresInference"] is True
    assert result["guides"] == []


async def test_route_sii_hit_returned():
    from app.core.router import route_guide_request

    sii = {"guidanceJson": {"steps": []}, "confidenceScore": 0.9, "groundingSource": "sii"}
    with patch("app.core.router.cache_get", AsyncMock(return_value=None)), \
         patch("app.core.router.fetch_publisher_guide", AsyncMock(return_value=None)), \
         patch("app.core.router.fetch_sii_exact", AsyncMock(return_value=sii)), \
         patch("app.core.router.cache_set", AsyncMock()):
        result = await route_guide_request(
            domain="known.com",
            path="/checkout",
            lang="en",
            persona=None,
            snapshot_hash="sii-hash",
            db=_make_db(),
        )
    assert result["indexEntry"] == sii
    assert result["guides"] == []


# ── fetch_publisher_guide ─────────────────────────────────────────────────────

async def test_fetch_publisher_guide_no_row_returns_none():
    from app.core.router import fetch_publisher_guide

    result = await fetch_publisher_guide(
        domain="unknown.com", path="/", lang="en", persona=None, db=_make_db(row=None)
    )
    assert result is None
