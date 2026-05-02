from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.get("")
async def list_guides():
    """List all guides for the authenticated publisher."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_guide():
    """Create a new guide. Status starts as 'pending' for moderation."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.put("/{guide_id}")
async def update_guide(guide_id: str):
    """Update a guide. Sets updated_at and re-triggers moderation if content changed."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/{guide_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_guide(guide_id: str):
    """Delete a guide and all its steps."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/{guide_id}/publish")
async def publish_guide(guide_id: str):
    """Publish a guide (sets published_at). Only approved guides can be published."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
