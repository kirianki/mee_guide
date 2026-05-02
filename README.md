# WebGuide

AI-powered navigation assistance for any website — Chrome, Firefox, and Edge extension with a two-sided publisher platform.

## Project Structure

```
webguide/
├── services/
│   ├── guide-registry/   # FastAPI — Guide Registry API (port 8000)
│   ├── inference/        # FastAPI — Inference Pipeline (port 8001)
│   ├── dashboard-api/    # FastAPI — Publisher Dashboard API (port 8002)
│   └── crawler/          # Celery worker — nightly SII change detection
├── dashboard/            # Next.js — Publisher Dashboard frontend
├── extension/            # Browser extension (Chrome / Firefox / Edge)
├── nginx/                # Reverse proxy config
└── docker-compose.yml
```

## Quick Start (local dev)

```bash
cp .env.example .env
# Fill in your OPENAI_API_KEY and ANTHROPIC_API_KEY in .env

docker compose up -d
```

Services will be available at:
- Publisher Dashboard: http://localhost
- Guide Registry API: http://localhost/v1/guides
- Inference API:      http://localhost/v1/inference
- Dashboard API:      http://localhost/v1/dashboard
- MinIO Console:      http://localhost:9001

## Extension Development

```bash
cd extension
npm install
npm run build:chrome   # → dist/chrome/
npm run build:firefox  # → dist/firefox/
npm run build:edge     # → dist/edge/
npm run watch          # HMR in Chrome
```

Load `dist/chrome/` as an unpacked extension in Chrome for development.

## Backend Services

Each service uses Python + FastAPI. Run individually:

```bash
cd services/guide-registry
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Tech Stack

| Layer | Technology |
|---|---|
| Extension sidebar | Preact + Manifest V3 |
| Backend | Python + FastAPI |
| Publisher Dashboard | Next.js (React + TypeScript) |
| Database | PostgreSQL 15 + pgvector |
| Cache | Redis 7 |
| Object storage | MinIO (dev) / AWS S3 (prod) |
| AI Primary | OpenAI (gpt-4o-mini / gpt-4o) |
| AI Fallback | Anthropic (Claude) |
