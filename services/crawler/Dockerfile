FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev

COPY app/ ./app/
COPY tests/ ./tests/

# Celery worker — runs the nightly SII change detection crawl
CMD ["uv", "run", "celery", "-A", "app.celery_app", "worker", "--loglevel=info", "--beat"]
