from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.core.router import route_guide_request

router = APIRouter()


class GuideStep(BaseModel):
    stepIndex: int
    instruction: str
    tooltipText: Optional[str] = None
    elementSelector: Optional[str] = None
    completionTrigger: Optional[str] = None
    completionSelector: Optional[str] = None


class GuideResponse(BaseModel):
    id: str
    tier: str
    title: str
    publisher: Optional[dict] = None
    language: str
    personaTags: list[str] = []
    steps: list[GuideStep] = []
    ttlSeconds: int


class GuidesListResponse(BaseModel):
    guides: list[GuideResponse]
    indexEntry: Optional[dict] = None
    cacheHit: bool
    requiresInference: bool = False


@router.get("", response_model=GuidesListResponse)
async def get_guides(
    domain: str = Query(..., description="eTLD+1 of current page"),
    path: str = Query(..., description="URL path"),
    lang: Optional[str] = Query("en", description="BCP47 language tag"),
    persona: Optional[str] = Query(None, description="Persona hint"),
    snapshot_hash: Optional[str] = Query(None, alias="snapshotHash", description="SHA-256 of DOM snapshot"),
    db: AsyncSession = Depends(get_db),
):
    """
    Guide Registry API — checked on every page load.
    Routing: Redis L2 → publisher guide → SII exact → requiresInference flag.
    Target: < 150ms p95.
    """
    result = await route_guide_request(domain, path, lang, persona, snapshot_hash, db)
    return GuidesListResponse(**result)
