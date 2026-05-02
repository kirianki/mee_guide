"""
Shared pytest fixtures for guide-registry.
"""
import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def mock_db():
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    return session


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(mock_db):
    from app.main import app
    from app.core.database import get_db

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
