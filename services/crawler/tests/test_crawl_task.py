"""
Unit tests for the crawler Celery task.
Uses Celery's ALWAYS_EAGER mode so the task runs synchronously without a broker.
"""
import pytest


def test_run_nightly_crawl_executes_without_error(settings):
    """Calling the task in eager mode must not raise."""
    from app.tasks.crawl import run_nightly_crawl
    result = run_nightly_crawl.apply()
    assert result is not None
    assert result.successful()


def test_task_is_registered():
    """The task name must be present in the app's registered task registry."""
    from app.celery_app import app as celery_app
    assert "app.tasks.crawl.run_nightly_crawl" in celery_app.tasks


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    """Force ALWAYS_EAGER so tasks run synchronously."""
    monkeypatch.setenv("CELERY_TASK_ALWAYS_EAGER", "true")
    from app.celery_app import app as celery_app
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    return celery_app
