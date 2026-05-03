from fastapi import APIRouter
from app.api.v1.endpoints import guides, save

router = APIRouter()
router.include_router(guides.router, prefix="/guides", tags=["guides"])
router.include_router(save.router, prefix="/guides/save", tags=["guides"])
