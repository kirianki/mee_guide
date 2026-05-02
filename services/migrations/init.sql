-- WebGuide — PostgreSQL init script
-- Runs once on first container start via docker-entrypoint-initdb.d

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── publishers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS publishers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    email            TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    plan             TEXT NOT NULL DEFAULT 'free'
                         CHECK (plan IN ('free', 'growth', 'enterprise')),
    api_key_hash     TEXT NOT NULL DEFAULT '',
    install_token    TEXT,
    email_verified   BOOLEAN NOT NULL DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── publisher_sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS publisher_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id       UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at         TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
    last_used_at       TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ,
    user_agent         TEXT,
    ip_address         INET
);

-- ── domains ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domains (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id        UUID NOT NULL REFERENCES publishers(id),
    domain              TEXT NOT NULL UNIQUE,
    verified            BOOLEAN NOT NULL DEFAULT false,
    verified_at         TIMESTAMPTZ,
    verification_token  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    deep_index_enabled  BOOLEAN NOT NULL DEFAULT false,
    crawl_frequency     TEXT CHECK (crawl_frequency IN ('daily', 'weekly', 'on_demand')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── guides ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guides (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id         UUID REFERENCES domains(id),
    publisher_id      UUID REFERENCES publishers(id),
    title             TEXT NOT NULL,
    language          TEXT NOT NULL DEFAULT 'en',
    persona_tags      TEXT[] DEFAULT '{}',
    url_pattern       TEXT NOT NULL,
    tier              TEXT NOT NULL CHECK (tier IN ('verified', 'community', 'ai_index')),
    visibility        TEXT NOT NULL DEFAULT 'public'
                          CHECK (visibility IN ('public', 'private')),
    moderation_status TEXT NOT NULL DEFAULT 'pending'
                          CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
    auto_quality_score FLOAT,
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── guide_steps ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guide_steps (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id              UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
    sort_order            INTEGER NOT NULL,
    url_pattern           TEXT NOT NULL,
    element_selector      TEXT,
    instruction           TEXT NOT NULL,
    tooltip_text          TEXT,
    screenshot_s3_key     TEXT,
    completion_trigger    TEXT CHECK (completion_trigger IN
                              ('click', 'input', 'navigation', 'publisher_signal', 'manual')),
    completion_selector   TEXT,
    completion_timeout_ms INTEGER DEFAULT 60000
);

-- ── site_intelligence_index ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_intelligence_index (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain            TEXT NOT NULL,
    url_pattern       TEXT NOT NULL,
    snapshot_hash     TEXT NOT NULL UNIQUE,
    page_type         TEXT,
    guidance_json     JSONB NOT NULL,
    embedding         vector(768),
    grounding_source  TEXT NOT NULL CHECK (grounding_source IN
                          ('publisher_guide', 'session_writeback', 'publisher_crawl')),
    confidence_score  FLOAT NOT NULL,
    session_hit_count INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    last_validated_at TIMESTAMPTZ,
    invalidated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sii_snapshot_hash ON site_intelligence_index(snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_sii_domain ON site_intelligence_index(domain);
CREATE INDEX IF NOT EXISTS idx_sii_embedding ON site_intelligence_index
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── guide_analytics ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guide_analytics (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id          UUID REFERENCES guides(id),
    session_id        TEXT NOT NULL,
    domain            TEXT NOT NULL,
    url               TEXT NOT NULL,
    tier              TEXT NOT NULL,
    steps_viewed      INTEGER NOT NULL DEFAULT 0,
    completed         BOOLEAN NOT NULL DEFAULT false,
    abandoned_at_step INTEGER,
    duration_seconds  INTEGER,
    timestamp         TIMESTAMPTZ NOT NULL DEFAULT now()
);
