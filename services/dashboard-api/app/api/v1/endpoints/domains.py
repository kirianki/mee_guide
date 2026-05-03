from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import secrets
import logging
import dns.resolver

from app.core.database import get_db
from app.core.deps import get_current_publisher

router = APIRouter()
logger = logging.getLogger(__name__)

class DomainCreate(BaseModel):
    domain: str


@router.get("")
async def list_domains(
    db: AsyncSession = Depends(get_db),
    publisher_id: str = Depends(get_current_publisher)
):
    """List all domains for the authenticated publisher."""
    result = await db.execute(text("""
        SELECT id, domain, verified, verification_token, created_at
        FROM domains
        WHERE publisher_id = :pub_id
        ORDER BY created_at DESC
    """), {"pub_id": publisher_id})
    
    return [{"id": str(r.id), "domain": r.domain, "verified": r.verified, "token": r.verification_token, "created_at": r.created_at} for r in result.fetchall()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_domain(
    body: DomainCreate,
    db: AsyncSession = Depends(get_db),
    publisher_id: str = Depends(get_current_publisher)
):
    """Register a new domain. Generates a DNS TXT verification token."""
    # Check if domain already registered
    check = await db.execute(text("SELECT id FROM domains WHERE domain = :domain"), {"domain": body.domain})
    if check.first():
        raise HTTPException(status_code=409, detail="Domain already registered")
        
    token = secrets.token_hex(16)
    try:
        res = await db.execute(text("""
            INSERT INTO domains (publisher_id, domain, verified, verification_token, created_at)
            VALUES (:pid, :dom, false, :tok, now())
            RETURNING id
        """), {"pid": publisher_id, "dom": body.domain, "tok": token})
        await db.commit()
        return {"id": str(res.scalar_one()), "domain": body.domain, "token": token, "verified": False}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{domain_id}/verify")
async def verify_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    publisher_id: str = Depends(get_current_publisher)
):
    """
    Trigger domain verification check.
    Checks DNS TXT record for webguide-verify=<token>.
    """
    res = await db.execute(text("SELECT domain, verification_token FROM domains WHERE id = :did AND publisher_id = :pid"), {"did": domain_id, "pid": publisher_id})
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Domain not found")
        
    domain_name = row.domain
    expected_token = row.verification_token
    token_str = f"webguide-verify={expected_token}"
    
    verified = False
    try:
        # Check DNS TXT records
        answers = dns.resolver.resolve(domain_name, 'TXT')
        for rdata in answers:
            for txt_string in rdata.strings:
                if token_str in txt_string.decode('utf-8'):
                    verified = True
                    break
            if verified:
                break
    except Exception as e:
        logger.warning(f"DNS check failed for {domain_name}: {e}")
        
    if verified:
        await db.execute(text("UPDATE domains SET verified = true WHERE id = :did"), {"did": domain_id})
        await db.commit()
        return {"verified": True, "message": "Domain successfully verified via DNS."}
        
    raise HTTPException(status_code=400, detail="Verification failed. Ensure the TXT record matches the token.")
