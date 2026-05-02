"""
Integration tests for the inference service HTTP endpoints.
The route_inference function is mocked so no AI providers are called.
"""
import pytest
from unittest.mock import AsyncMock, patch


pytestmark = pytest.mark.anyio

LOGIN_SNAPSHOT = {
    "pageTitle": "Login Page",
    "urlPath": "/login",
    "domain": "example.com",
    "formFields": [],
    "alerts": [],
    "headings": [],
    "buttons": []
}
SIMPLE_SNAPSHOT = {
    "pageTitle": "Dashboard",
    "urlPath": "/dashboard",
    "domain": "example.com",
    "formFields": [],
    "alerts": [],
    "headings": [],
    "buttons": []
}

RULE_RESPONSE = {
    "guideTitle": "Sign In",
    "steps": [{"stepIndex": 0, "instruction": "Enter your email.", "tooltipText": None, "elementSelector": None, "completionTrigger": "input", "completionSelector": None}],
    "errorDetected": None,
    "confidence": 0.95,
    "modelTier": "rule",
    "provider": "rule",
    "cacheHit": False,
}


async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json().get("status") == "ok"


async def test_infer_login_page_returns_rule_response(client):
    with patch("app.core.query_router.route_inference", AsyncMock(return_value=RULE_RESPONSE)):
        resp = await client.post(
            "/v1/inference",
            json={"snapshot": LOGIN_SNAPSHOT, "sessionId": "sess-001"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["guideTitle"] == "Sign In"
    assert body["modelTier"] == "rule"


async def test_infer_missing_snapshot_returns_422(client):
    resp = await client.post("/v1/inference", json={"sessionId": "sess-001"})
    assert resp.status_code == 422


async def test_infer_returns_degraded_response_on_failure(client):
    degraded = {
        "guideTitle": "Guidance Unavailable",
        "steps": [{"stepIndex": 0, "instruction": "AI guidance is temporarily unavailable.", "tooltipText": None, "elementSelector": None, "completionTrigger": "manual", "completionSelector": None}],
        "errorDetected": None,
        "confidence": 0.0,
        "modelTier": "lightweight",
        "provider": "none",
        "cacheHit": False,
    }
    with patch("app.core.query_router.route_inference", AsyncMock(return_value=degraded)):
        resp = await client.post(
            "/v1/inference",
            json={"snapshot": SIMPLE_SNAPSHOT, "sessionId": "sess-002"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "none"
    assert body["confidence"] == 0.0
