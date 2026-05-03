"""
Inference Service — POST /v1/inference/save-workflow
Saves a high-confidence AI-generated workflow to the Guide Registry's SII.
This is the self-improvement loop: good inferences become cached guides.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
import logging

from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


class WorkflowStep(BaseModel):
    stepIndex: int
    instruction: str
    tooltipText: Optional[str] = None
    elementSelector: Optional[str] = None
    completionTrigger: str = "manual"
    completionSelector: Optional[str] = None


class SaveWorkflowRequest(BaseModel):
    guideTitle: str
    steps: list[WorkflowStep]
    snapshotHash: str
    domain: str
    urlPath: str
    confidence: float = 0.0


class SaveWorkflowResponse(BaseModel):
    saved: bool
    message: str


@router.post("", response_model=SaveWorkflowResponse)
async def save_workflow_endpoint(request: SaveWorkflowRequest):
    """
    Save a confirmed workflow to the Guide Registry SII so it can be
    served from cache on the next identical page load (self-improving loop).

    Only persists if confidence >= 0.75.
    """
    if request.confidence < 0.75:
        return SaveWorkflowResponse(
            saved=False,
            message=f"Confidence {request.confidence:.2f} below 0.75 threshold — not saved."
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(
                f"{settings.GUIDE_REGISTRY_URL}/v1/guides/save",
                json=request.model_dump(),
            )
            res.raise_for_status()

        logger.info(f"[save_workflow] Saved '{request.guideTitle}' for {request.domain}{request.urlPath}")
        return SaveWorkflowResponse(saved=True, message="Workflow saved to registry.")

    except httpx.HTTPStatusError as e:
        logger.warning(f"[save_workflow] Registry rejected: {e.response.status_code}")
        raise HTTPException(status_code=502, detail=f"Guide registry error: {e.response.status_code}")
    except Exception as e:
        logger.error(f"[save_workflow] Failed to reach guide registry: {e}")
        raise HTTPException(status_code=503, detail="Guide Registry unreachable.")
