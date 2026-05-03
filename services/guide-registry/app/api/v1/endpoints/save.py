"""
Guide Registry — POST /v1/guides/save
Upserts an AI-inferred guide into the Site Intelligence Index (SII).
This is called by the inference service when a high-confidence result is produced,
making the system self-improving — cached SII entries serve subsequent identical pages
without any AI inference cost.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
import json
import logging

from app.core.database import get_db
from app.core.cache import cache_set

router = APIRouter()
logger = logging.getLogger(__name__)

SII_CACHE_TTL = 86400 * 7  # 7 days for SII entries
SII_EXPIRES_DAYS = 30


class WorkflowStep(BaseModel):
    stepIndex: int
    instruction: str
    tooltipText: Optional[str] = None
    elementSelector: Optional[str] = None
    completionTrigger: str = "manual"
    completionSelector: Optional[str] = None


class SaveGuideRequest(BaseModel):
    guideTitle: str
    steps: list[WorkflowStep]
    snapshotHash: str
    domain: str
    urlPath: str
    confidence: float = 0.0


class SaveGuideResponse(BaseModel):
    saved: bool
    snapshotHash: str
    message: str


@router.post("", response_model=SaveGuideResponse)
async def save_guide_to_sii(
    request: SaveGuideRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Upsert a high-confidence AI guide into site_intelligence_index.
    On conflict (same snapshot_hash), update the guidance and reset expiry.
    Also writes to Redis so it's served from cache immediately.
    """
    if request.confidence < 0.75:
        return SaveGuideResponse(
            saved=False,
            snapshotHash=request.snapshotHash,
            message=f"Confidence {request.confidence:.2f} below threshold."
        )

    guidance_json = {
        "guideTitle": request.guideTitle,
        "steps": [s.model_dump() for s in request.steps],
        "domain": request.domain,
        "urlPath": request.urlPath,
    }

    try:
        await db.execute(text("""
            INSERT INTO site_intelligence_index
                (snapshot_hash, guidance_json, confidence_score, grounding_source,
                 session_hit_count, expires_at, created_at)
            VALUES
                (:hash, :guidance::jsonb, :confidence, 'inference_auto',
                 0, now() + interval ':days days', now())
            ON CONFLICT (snapshot_hash) DO UPDATE SET
                guidance_json     = EXCLUDED.guidance_json,
                confidence_score  = EXCLUDED.confidence_score,
                expires_at        = now() + interval ':days days',
                invalidated_at    = NULL
        """), {
            "hash":       request.snapshotHash,
            "guidance":   json.dumps(guidance_json),
            "confidence": request.confidence,
            "days":       SII_EXPIRES_DAYS,
        })
        await db.commit()
    except Exception as e:
        logger.error(f"[save_guide] DB upsert failed: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Database error while saving guide.")

    # Warm the Redis cache immediately so next page load hits L2
    cache_payload = {
        "guides": [{
            "id": f"sii-{request.snapshotHash[:12]}",
            "tier": "ai_index",
            "title": request.guideTitle,
            "steps": [s.model_dump() for s in request.steps],
            "ttlSeconds": 300,
        }],
        "indexEntry": None,
        "cacheHit": False,
        "requiresInference": False,
    }
    await cache_set(f"guide:hash:{request.snapshotHash}", cache_payload, SII_CACHE_TTL)

    logger.info(f"[save_guide] SII upsert + cache warm: {request.domain}{request.urlPath} (conf={request.confidence:.2f})")
    return SaveGuideResponse(
        saved=True,
        snapshotHash=request.snapshotHash,
        message=f"Workflow '{request.guideTitle}' saved to SII and cache.",
    )
