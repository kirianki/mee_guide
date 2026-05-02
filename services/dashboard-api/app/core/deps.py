"""FastAPI dependency — extract and validate JWT from Authorization header."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from app.core.auth import decode_access_token

bearer_scheme = HTTPBearer()


async def get_current_publisher(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Returns publisher_id from a valid Bearer JWT. Raises 401 otherwise."""
    try:
        return decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
