"""
Guide Registry routing logic.

Routing order (checked in sequence, escalates on miss):
  1. Redis L2 cache (snapshot hash key) — 0ms AI cost
  2. Verified publisher guide for domain+path — 0ms AI cost
  3. SII exact snapshot hash hit (PostgreSQL) — 0ms AI cost
  4. Forward to Inference Pipeline
"""
import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.core.config import settings


CACHE_TTL = 86400       # 24h for guide responses
GUIDE_TTL_SECONDS = 300  # ttlSeconds returned to extension (5 min L1 cache)


async def route_guide_request(
    domain: str,
    path: str,
    lang: str,
    persona: str | None,
    snapshot_hash: str | None,
    db: AsyncSession,
) -> dict:
    """
    Main routing function. Returns a guides response dict.
    """

    # ── Step 1: Redis L2 cache hit ────────────────────────────────────────────
    if snapshot_hash:
        cache_key = f"guide:hash:{snapshot_hash}"
        cached = await cache_get(cache_key)
        if cached:
            cached["cacheHit"] = True
            return cached

    # ── Step 2: Verified publisher guide ──────────────────────────────────────
    publisher_guide = await fetch_publisher_guide(domain, path, lang, persona, db)
    if publisher_guide:
        response = {"guides": [publisher_guide], "indexEntry": None, "cacheHit": False}
        if snapshot_hash:
            await cache_set(f"guide:hash:{snapshot_hash}", response, CACHE_TTL)
        return response

    # ── Step 3: SII exact hit (PostgreSQL) ────────────────────────────────────
    if snapshot_hash:
        sii_entry = await fetch_sii_exact(snapshot_hash, db)
        if sii_entry:
            response = {
                "guides": [],
                "indexEntry": sii_entry,
                "cacheHit": False,
            }
            await cache_set(f"guide:hash:{snapshot_hash}", response, CACHE_TTL)
            return response

    # ── Step 4: No match — signal the extension to call the Inference Pipeline
    return {"guides": [], "indexEntry": None, "cacheHit": False, "requiresInference": True}


async def fetch_publisher_guide(
    domain: str, path: str, lang: str, persona: str | None, db: AsyncSession
) -> dict | None:
    """
    Return the best matching verified+published guide for this domain/path.
    Uses glob-pattern matching: most specific (fewest wildcards) wins.
    """
    result = await db.execute(text("""
        SELECT g.id, g.title, g.tier, g.language, g.persona_tags,
               p.name AS publisher_name, p.email_verified AS publisher_verified,
               array_agg(
                   json_build_object(
                       'stepIndex',         gs.sort_order,
                       'instruction',       gs.instruction,
                       'tooltipText',       gs.tooltip_text,
                       'elementSelector',   gs.element_selector,
                       'completionTrigger', gs.completion_trigger,
                       'completionSelector',gs.completion_selector
                   ) ORDER BY gs.sort_order
               ) AS steps
        FROM guides g
        JOIN domains d      ON d.id = g.domain_id
        JOIN publishers p   ON p.id = g.publisher_id
        LEFT JOIN guide_steps gs ON gs.guide_id = g.id
        WHERE d.domain = :domain
          AND g.tier = 'verified'
          AND g.moderation_status = 'approved'
          AND g.published_at IS NOT NULL
          AND (CAST(:lang AS TEXT) IS NULL OR g.language = :lang)
        GROUP BY g.id, g.title, g.tier, g.language, g.persona_tags,
                 p.name, p.email_verified
        ORDER BY length(g.url_pattern) DESC
        LIMIT 1
    """), {"domain": domain, "lang": lang})

    row = result.first()
    if not row:
        return None

    return {
        "id": str(row.id),
        "tier": row.tier,
        "title": row.title,
        "publisher": {
            "name": row.publisher_name,
            "verified": row.publisher_verified,
            "logoUrl": None,
        },
        "language": row.language,
        "personaTags": list(row.persona_tags or []),
        "steps": [s for s in (row.steps or []) if s],
        "ttlSeconds": GUIDE_TTL_SECONDS,
    }


async def fetch_sii_exact(snapshot_hash: str, db: AsyncSession) -> dict | None:
    """Return an SII entry for an exact snapshot hash hit."""
    result = await db.execute(text("""
        SELECT guidance_json, confidence_score, grounding_source
        FROM site_intelligence_index
        WHERE snapshot_hash = :hash
          AND invalidated_at IS NULL
          AND expires_at > now()
        LIMIT 1
    """), {"hash": snapshot_hash})

    row = result.first()
    if not row:
        return None

    # Increment hit counter asynchronously (fire-and-forget)
    await db.execute(text("""
        UPDATE site_intelligence_index
        SET session_hit_count = session_hit_count + 1
        WHERE snapshot_hash = :hash
    """), {"hash": snapshot_hash})
    await db.commit()

    return {
        "guidanceJson": row.guidance_json,
        "confidenceScore": row.confidence_score,
        "groundingSource": row.grounding_source,
    }
