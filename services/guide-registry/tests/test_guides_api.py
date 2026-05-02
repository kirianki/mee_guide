"""
Integration tests for guide-registry HTTP endpoints.
The DB session is overridden with a mock so no Postgres is needed.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


pytestmark = pytest.mark.anyio


async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json().get("status") == "ok"


async def test_get_guides_total_miss_requires_inference(client, mock_db):
    """When no guide or SII entry exists the registry returns requiresInference=true."""
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_db.execute.return_value = mock_result

    with patch("app.core.router.cache_get", AsyncMock(return_value=None)), \
         patch("app.core.router.cache_set", AsyncMock()):
        resp = await client.get(
            "/v1/guides",
            params={"domain": "unknown.com", "path": "/nowhere", "lang": "en"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["requiresInference"] is True
    assert body["guides"] == []
    assert body["cacheHit"] is False


async def test_get_guides_missing_domain_returns_422(client):
    resp = await client.get("/v1/guides", params={"path": "/"})
    assert resp.status_code == 422


async def test_get_guides_cache_hit_skips_db(client, mock_db):
    cached = {
        "guides": [{
            "id": "g1",
            "tier": "verified",
            "title": "Test Guide",
            "language": "en",
            "ttlSeconds": 300,
            "publisher": {"name": "Test Pub", "verified": True}
        }],
        "indexEntry": None,
        "cacheHit": False,
        "requiresInference": False
    }

    with patch("app.core.router.cache_get", AsyncMock(return_value=cached)), \
         patch("app.core.router.cache_set", AsyncMock()):
        resp = await client.get(
            "/v1/guides",
            params={"domain": "example.com", "path": "/", "snapshotHash": "abc"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["cacheHit"] is True
    # DB should never have been called
    mock_db.execute.assert_not_called()
