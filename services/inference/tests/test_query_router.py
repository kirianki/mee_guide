"""
Unit tests for the inference query router.
Mocks Redis and AI providers — no live network calls.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


pytestmark = pytest.mark.anyio

SIMPLE_SNAPSHOT = {
    "urlPath": "/dashboard",
    "formFields": [],
    "alerts": [],
    "headings": ["Welcome"],
    "buttons": ["Save"],
}


# ── Redis cache hit ────────────────────────────────────────────────────────────

async def test_redis_cache_hit_returns_cached_response():
    from app.core.query_router import route_inference

    cached = {"guideTitle": "Cached", "steps": [], "cacheHit": False, "provider": "cache"}
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached))

    with patch("app.core.query_router.get_redis", AsyncMock(return_value=mock_redis)):
        result = await route_inference({
            "snapshot": {**SIMPLE_SNAPSHOT, "snapshotHash": "known-hash"},
            "sessionId": "s1",
        })

    assert result["cacheHit"] is True
    assert result["provider"] == "cache"


# ── Rule-based routing ────────────────────────────────────────────────────────

@pytest.mark.parametrize("path,expected_title", [
    ("/login",          "Sign In"),
    ("/signin",         "Sign In"),
    ("/auth",           "Sign In"),
    ("/logout",         "Signing Out"),
    ("/signout",        "Signing Out"),
    ("/cookie-consent", "Cookie Consent"),
    ("/gdpr",           "Cookie Consent"),
    ("/404",            "Page Not Found"),
    ("/not-found",      "Page Not Found"),
])
async def test_rule_based_patterns(path, expected_title):
    from app.core.query_router import route_inference

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with patch("app.core.query_router.get_redis", AsyncMock(return_value=mock_redis)):
        result = await route_inference({
            "snapshot": {"urlPath": path},
            "sessionId": "s1",
        })

    assert result["guideTitle"] == expected_title
    assert result["provider"] == "rule"
    assert result["modelTier"] == "rule"


# ── Complexity → model tier delegation ────────────────────────────────────────

async def test_simple_snapshot_uses_lightweight_tier():
    from app.core.query_router import route_inference

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    mock_result = {"guideTitle": "Help", "steps": [], "confidence": 0.8, "errorDetected": None}

    with patch("app.core.query_router.get_redis", AsyncMock(return_value=mock_redis)), \
         patch("app.core.query_router.run_inference", AsyncMock(return_value=(mock_result, "openai"))):
        result = await route_inference({
            "snapshot": SIMPLE_SNAPSHOT,
            "sessionId": "s1",
        })

    assert result["modelTier"] == "lightweight"
    assert result["provider"] == "openai"


async def test_heavy_snapshot_uses_heavy_tier():
    from app.core.query_router import route_inference

    heavy_snapshot = {
        "urlPath": "/a/b/c/d/e",
        "formFields": [{}] * 12,
        "alerts": ["e1", "e2"],
        "headings": ["h"] * 15,
        "buttons": ["b"] * 10,
    }
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    mock_result = {"guideTitle": "Complex", "steps": [], "confidence": 0.9, "errorDetected": None}

    with patch("app.core.query_router.get_redis", AsyncMock(return_value=mock_redis)), \
         patch("app.core.query_router.run_inference", AsyncMock(return_value=(mock_result, "openai"))):
        result = await route_inference({
            "snapshot": heavy_snapshot,
            "sessionId": "s1",
        })

    assert result["modelTier"] == "heavy"


# ── Provider failure — graceful degradation ────────────────────────────────────

async def test_both_providers_fail_returns_degraded_response():
    from app.core.query_router import route_inference

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    with patch("app.core.query_router.get_redis", AsyncMock(return_value=mock_redis)), \
         patch("app.core.query_router.run_inference", AsyncMock(side_effect=RuntimeError("both failed"))):
        result = await route_inference({
            "snapshot": SIMPLE_SNAPSHOT,
            "sessionId": "s1",
        })

    assert result["provider"] == "none"
    assert result["confidence"] == 0.0
    assert len(result["steps"]) == 1
    assert "unavailable" in result["steps"][0]["instruction"].lower()


# ── Low-confidence result not cached ─────────────────────────────────────────

async def test_low_confidence_result_not_cached():
    from app.core.query_router import route_inference

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    low_conf_result = {"guideTitle": "Uncertain", "steps": [], "confidence": 0.5, "errorDetected": None}

    with patch("app.core.query_router.get_redis", AsyncMock(return_value=mock_redis)), \
         patch("app.core.query_router.run_inference", AsyncMock(return_value=(low_conf_result, "openai"))):
        await route_inference({
            "snapshot": {**SIMPLE_SNAPSHOT, "snapshotHash": "some-hash"},
            "sessionId": "s1",
        })

    # Redis.set must NOT have been called (confidence < 0.75)
    mock_redis.set.assert_not_called()
