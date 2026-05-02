from fastapi import APIRouter
from app.api.v1.endpoints import infer

router = APIRouter()
router.include_router(infer.router, prefix="/inference", tags=["inference"])
