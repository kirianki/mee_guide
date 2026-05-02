from fastapi import APIRouter
from app.api.v1.endpoints import guides

router = APIRouter()
router.include_router(guides.router, prefix="/guides", tags=["guides"])
