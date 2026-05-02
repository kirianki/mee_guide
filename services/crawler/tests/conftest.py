"""
Shared pytest fixtures for the crawler service.
"""
import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
