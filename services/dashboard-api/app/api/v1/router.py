from fastapi import APIRouter
from app.api.v1.endpoints import auth, domains, guides

router = APIRouter()
router.include_router(auth.router,    prefix="/auth",    tags=["auth"])
router.include_router(domains.router, prefix="/domains", tags=["domains"])
router.include_router(guides.router,  prefix="/guides",  tags=["guides"])
