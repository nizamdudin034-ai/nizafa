-- Nizafa — Supabase (Postgres) schema
-- Date: 2026-11-15. Status: DRAFT for the re-platformed public app.
-- Source of truth for fields: verified live reads of the Nizafa artifact's
-- own actions (getBootstrap, listChannels, getChannelDetail, listPackages,
-- getPlansBilling) on 15 Nov 2026, plus the read-only inspection
-- (14 tables in the artifact's SQLite app.db).
-- The artifact's own Drizzle migrations are SQLITE dialect and are NOT
-- portable as-is; this file is a Postgres translation. During the port,
-- verify every column against server/src/schema.ts before running.
-- NEVER paste secrets into this file. Secrets go in Netlify env vars only.
-- Tables marked [NEW] do not exist in the artifact (single-workspace app)
-- and are required for public multi-user hosting.

-- ── Settings (single row per key; 8 rows in the artifact) ───────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Known keys (verified): youtube_api_key, google_client_id,
-- google_client_secret, google_email, language, easypaisa_number,
-- jazzcash_number, payment_note, referral_code.
-- NOTE: on public hosting, secrets (youtube_api_key, google_client_secret)
-- must live in Netlify env vars, NOT in this table.

-- ── Users [NEW — public multi-user] ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  name       TEXT,
  plan       TEXT NOT NULL DEFAULT 'free',  -- free | pro | team
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Channels ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          UUID REFERENCES app_users(id),  -- [NEW] per-user scoping
  channel_id       TEXT NOT NULL UNIQUE,           -- YouTube channel ID
  title            TEXT NOT NULL,
  description      TEXT,
  avatar_url       TEXT,
  url              TEXT NOT NULL,
  role             TEXT NOT NULL,                  -- 'own' | 'competitor'
  stats_source     TEXT,                           -- 'google' | 'youtube-api'
  subscriber_count BIGINT,
  video_count      BIGINT,
  view_count       BIGINT,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Channel videos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_videos (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id   BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  video_id     TEXT NOT NULL,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  view_count   BIGINT,
  like_count   BIGINT,
  comment_count BIGINT,
  UNIQUE (channel_id, video_id)
);

-- ── Channel audits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audits (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  report     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Packages (titles, tags, ideas, daily-ideas, full packages, etc.) ───
CREATE TABLE IF NOT EXISTS packages (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID REFERENCES app_users(id),  -- [NEW] per-user scoping
  kind         TEXT NOT NULL,  -- package | titles | tags | ideas |
                              -- daily-ideas | seo-check | keyword-research |
                              -- thumbnail-image | ...
  topic        TEXT NOT NULL,
  payload_json JSONB NOT NULL, -- full generated content (titles, script
                              -- outline, tags, hashtags, niche, etc.)
  image_url    TEXT,           -- stored thumbnail image (Supabase Storage)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS packages_kind_idx ON packages (kind, created_at DESC);

-- ── Trending snapshots (daily Google Trends US + PK) ────────────────────
CREATE TABLE IF NOT EXISTS trending_snapshots (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  items      JSONB NOT NULL  -- [{geo, title, traffic, newsSource,
                             --   newsTitle, newsUrl, publishedAt}]
);

-- ── Trend alerts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trend_alerts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID REFERENCES app_users(id),  -- [NEW] per-user scoping
  keyword    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Team members ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID REFERENCES app_users(id),  -- [NEW] workspace owner
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL,  -- e.g. 'editor'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── API keys (Nizafa public API) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID REFERENCES app_users(id),  -- [NEW] per-user scoping
  prefix      TEXT NOT NULL,  -- public prefix shown in UI
  key_hash    TEXT NOT NULL,  -- hash only; full key shown once at creation
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

-- ── Payments (manual Easypaisa / JazzCash / Stripe proofs) ─────────────
CREATE TABLE IF NOT EXISTS payments (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID REFERENCES app_users(id),  -- [NEW] per-user scoping
  plan           TEXT NOT NULL,  -- pro | team
  method         TEXT NOT NULL,  -- easypaisa | jazzcash | stripe
  transaction_id TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

-- ── Assistant chat ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_conversations (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID REFERENCES app_users(id),  -- [NEW] per-user scoping
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,  -- user | assistant
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Academy progress ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academy_progress (
  user_id    UUID REFERENCES app_users(id),  -- [NEW] per-user scoping
  lesson_id  TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

-- ── Assistant cache (fast multilingual answers) ───────────────────────
-- Normalized question → cached answer, per language. The Assistant answers
-- from the user's own channel data + a curated growth playbook; common
-- questions are served from this cache so answers are instant.
CREATE TABLE IF NOT EXISTS assistant_cache (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_norm TEXT NOT NULL,
  lang         TEXT NOT NULL,
  answer       TEXT NOT NULL,
  hits         BIGINT NOT NULL DEFAULT 1,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_norm, lang)
);

-- ── Daily ideas (generated once per day per channel, cached) ───────────
-- Stored as packages with kind='daily-ideas'; this table tracks the run.
CREATE TABLE IF NOT EXISTS daily_idea_runs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id  BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  run_date    DATE NOT NULL,
  idea_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, run_date)
);

-- ── YouTube API cache (quota guard: 100 search.list/day for the app) ───
-- Keyed cache for search results and other expensive reads. Nothing here
-- is user data — only public YouTube responses, safe to share across users.
CREATE TABLE IF NOT EXISTS yt_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row Level Security ──────────────────────────────────────────────────
-- Enable RLS on all user-scoped tables during the port and write policies
-- (owner-only access per user_id). Do NOT ship with RLS off.
-- ALTER TABLE channels ENABLE ROW LEVEL SECURITY;  -- etc.
