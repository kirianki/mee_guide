from fastapi import APIRouter
from app.api.v1.endpoints import infer, save_workflow

router = APIRouter()
router.include_router(infer.router, prefix="/inference", tags=["inference"])
router.include_router(save_workflow.router, prefix="/inference/save-workflow", tags=["inference"])
