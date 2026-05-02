from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.get("")
async def list_domains():
    """List all domains for the authenticated publisher."""
    # TODO: require JWT auth, query domains table
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_domain(domain: str):
    """Register a new domain. Generates a DNS TXT verification token."""
    # TODO: generate verification_token, insert into domains table
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/{domain_id}/verify")
async def verify_domain(domain_id: str):
    """
    Trigger domain verification check.
    Checks DNS TXT record for webguide-verify=<token> first,
    then falls back to HTML meta tag.
    """
    # TODO: DNS TXT lookup, set verified=true if found
    raise HTTPException(status_code=501, detail="Not implemented yet")
