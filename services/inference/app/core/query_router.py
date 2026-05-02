"""
Inference Pipeline — query router.
Implements the 5-step routing decision tree from the design doc.
"""
import json
import logging
import re
import redis.asyncio as aioredis

from app.core.complexity import score_complexity, get_model_tier
from app.core.providers import run_inference
from app.core.config import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None

# Known page type patterns for rule-based matching (Step 3)
RULE_PATTERNS = [
    (re.compile(r"/(login|signin|sign-in|auth)", re.I),     "login_page"),
    (re.compile(r"/404|not-found",               re.I),     "not_found"),
    (re.compile(r"/cookie|gdpr|consent",         re.I),     "cookie_banner"),
    (re.compile(r"/logout|signout|sign-out",     re.I),     "logout_page"),
]

RULE_RESPONSES = {
    "login_page":    {"guideTitle": "Sign In", "steps": [{"stepIndex": 0, "instruction": "Enter your email address in the email field.", "tooltipText": "Use the email you registered with.", "elementSelector": "input[type=email], input[name*=email]", "completionTrigger": "input", "completionSelector": None}, {"stepIndex": 1, "instruction": "Enter your password and click Sign In.", "tooltipText": None, "elementSelector": "input[type=password]", "completionTrigger": "click", "completionSelector": None}], "errorDetected": None, "confidence": 0.95},
    "not_found":     {"guideTitle": "Page Not Found", "steps": [{"stepIndex": 0, "instruction": "This page does not exist. Go back or navigate home.", "tooltipText": "Use your browser back button.", "elementSelector": None, "completionTrigger": "manual", "completionSelector": None}], "errorDetected": "Page not found (404).", "confidence": 0.99},
    "cookie_banner": {"guideTitle": "Cookie Consent", "steps": [{"stepIndex": 0, "instruction": "Accept or decline cookies to continue.", "tooltipText": "Your choice is saved automatically.", "elementSelector": "button[id*=accept], button[class*=accept]", "completionTrigger": "click", "completionSelector": None}], "errorDetected": None, "confidence": 0.98},
    "logout_page":   {"guideTitle": "Signing Out", "steps": [{"stepIndex": 0, "instruction": "You have been signed out successfully.", "tooltipText": None, "elementSelector": None, "completionTrigger": "manual", "completionSelector": None}], "errorDetected": None, "confidence": 0.99},
}


async def get_redis():
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def route_inference(request: dict) -> dict:
    """
    5-step routing decision tree.
    Returns a normalised inference response dict.
    """
    snapshot = request["snapshot"]
    session_id = request.get("sessionId", "anon")
    history = request.get("conversationHistory", [])
    snapshot_hash = snapshot.get("snapshotHash") or snapshot.get("hash")

    # ── Step 1: Redis exact hash cache ───────────────────────────────────────
    if snapshot_hash:
        r = await get_redis()
        cached = await r.get(f"inference:hash:{snapshot_hash}")
        if cached:
            data = json.loads(cached)
            data["cacheHit"] = True
            data["provider"] = "cache"
            return data

    # ── Step 2: Verified publisher guide handled upstream in Guide Registry ───
    # (not re-checked here; registry already returns guide steps)

    # ── Step 3: Rule-based pattern matching ──────────────────────────────────
    url_path = snapshot.get("urlPath", "")
    for pattern, page_type in RULE_PATTERNS:
        if pattern.search(url_path):
            response = {**RULE_RESPONSES[page_type], "modelTier": "rule", "provider": "rule", "cacheHit": False}
            return response

    # ── Step 4 & 5: Complexity scoring → model tier → AI inference ───────────
    score = score_complexity(snapshot, len(history) // 2)
    tier = get_model_tier(score)
    logger.info(f"Complexity score={score}, tier={tier}, hash={snapshot_hash}")

    grounding = None  # TODO: pgvector SII semantic search (Section 7.2.2)

    try:
        result, provider = await run_inference(snapshot, history, grounding, tier)
    except RuntimeError:
        # Both providers failed — return a graceful degraded response
        result = {
            "guideTitle": "Guidance Unavailable",
            "steps": [{"stepIndex": 0, "instruction": "AI guidance is temporarily unavailable. Please try again shortly.", "tooltipText": None, "elementSelector": None, "completionTrigger": "manual", "completionSelector": None}],
            "errorDetected": None,
            "confidence": 0.0,
        }
        provider = "none"

    response = {**result, "modelTier": tier, "provider": provider, "cacheHit": False}

    # Write to Redis cache if confidence is high enough
    if snapshot_hash and result.get("confidence", 0) >= 0.75:
        r = await get_redis()
        await r.set(f"inference:hash:{snapshot_hash}", json.dumps(response), ex=86400)

    return response
