from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.core.query_router import route_inference

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
    completionTrigger: str = "manual"
    completionSelector: Optional[str] = None


class Intent(BaseModel):
    id: str
    title: str
    description: Optional[str] = None


class InferenceResponse(BaseModel):
    guideTitle: str
    suggestedIntents: list[Intent] = []
    steps: list[InferenceStep]
    errorDetected: Optional[str] = None
    confidence: float
    provider: str   # 'openai' | 'anthropic' | 'rule' | 'cache' | 'none'
    modelTier: str  # 'lightweight' | 'standard' | 'heavy' | 'rule' | 'cache'
    cacheHit: bool = False


@router.post("", response_model=InferenceResponse)
async def run_inference_endpoint(request: InferenceRequest):
    """
    Inference Pipeline — 5-step routing:
    1. Redis exact hash cache
    2. Rule-based pattern match (login/404/cookie/logout)
    3. SII vector RAG (pgvector — TODO)
    4/5. Full generative: OpenAI primary → Anthropic fallback
    """
    result = await route_inference(request.model_dump())
    return InferenceResponse(**result)
