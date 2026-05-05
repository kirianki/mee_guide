from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.core.query_router import route_inference_stream
from fastapi.responses import StreamingResponse

router = APIRouter()


class DOMSnapshot(BaseModel):
    pageTitle: str
    h1: Optional[str] = None
    urlPath: str
    domain: str
    snapshotHash: Optional[str] = None
    formFields: list[dict] = []
    buttons: list[dict] = []
    headings: list[dict] = []
    alerts: list[dict] = []
    navContext: Optional[dict] = None


class InferenceRequest(BaseModel):
    snapshot: DOMSnapshot
    sessionId: str = "anon"
    lang: str = "en"
    conversationHistory: list[dict] = []


class InferenceStep(BaseModel):
    stepIndex: int
    instruction: str
    tooltipText: Optional[str] = None
    elementSelector: Optional[str] = None
    elementId: Optional[str] = None
    completionTrigger: str = "manual"
    completionSelector: Optional[str] = None


class Intent(BaseModel):
    id: str
    title: str
    description: Optional[str] = None


class InferenceResponse(BaseModel):
    reasoning: Optional[str] = None
    guideTitle: str
    narrative: Optional[str] = None
    suggestedIntents: list[Intent] = []
    steps: list[InferenceStep] = []
    errorDetected: Optional[str] = None
    confidence: float
    provider: str   # 'openai' | 'anthropic' | 'rule' | 'cache' | 'none'
    modelTier: str  # 'lightweight' | 'standard' | 'heavy' | 'rule' | 'cache'
    cacheHit: bool = False


@router.post("")
async def run_inference_endpoint(request: InferenceRequest):
    """
    Inference Pipeline streams Pass 1 and yields Pass 2 via route_inference_stream.
    """
    return StreamingResponse(
        route_inference_stream(request.model_dump()), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
