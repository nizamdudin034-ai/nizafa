-- Nizafa — Supabase Row Level Security policies
-- Date: 2026-11-16. Project: nizafa (https://btqueqyatpatxqyfanzo.supabase.co)
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Then verify with the checks at the bottom, and commit this file to the
-- nizafa repo (supabase/rls-policies.sql) so the policy set is versioned.
--
-- WHY THIS IS SAFE TO APPLY:
-- * Nearly every API route uses createSupabaseAdmin() (service role), which
--   bypasses RLS entirely — those reads/writes are unaffected.
-- * Only two user-scoped reads exist: the dashboard (src/app/page.tsx:
--   channels, packages, trending_snapshots, channel_videos) and
--   GET /api/channels (channels). Both run with the signed-in user's
--   session, and every row the app writes carries user_id = auth UID
--   (see ensureAppUser: app_users.id = auth user id; channel/package
--   inserts set user_id: user.id). So the owner keeps seeing exactly
--   his own rows, and nobody else's.
-- * settings has NO policy on purpose: secrets now live in Netlify env
--   vars; the table is service-role only (src/app/api/settings uses admin).
-- * trending_snapshots / assistant_cache / yt_cache hold no user data
--   (public trends, generic cached answers, public YouTube responses),
--   so they are readable by anyone but writable only via service role.
--
-- CAVEAT: packages created while signed out get user_id = NULL
-- (src/app/api/generate: user_id: user?.id ?? null). Those rows stay in
-- the DB and the generate API still returns them, but they will no longer
-- appear in the dashboard's anon-client package list. That is the
-- intended behaviour, not data loss.

-- ── 1. Enable RLS on all 17 tables ─────────────────────────────────────
ALTER TABLE settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_videos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_idea_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE yt_cache           ENABLE ROW LEVEL SECURITY;

-- ── 2. Own-row tables (user_id = auth.uid()) ───────────────────────────
-- app_users: the row's id IS the auth UID.
DROP POLICY IF EXISTS "own app_users" ON app_users;
CREATE POLICY "own app_users" ON app_users
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "own channels" ON channels;
CREATE POLICY "own channels" ON channels
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own packages" ON packages;
CREATE POLICY "own packages" ON packages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own trend_alerts" ON trend_alerts;
CREATE POLICY "own trend_alerts" ON trend_alerts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own team_members" ON team_members;
CREATE POLICY "own team_members" ON team_members
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own api_keys" ON api_keys;
CREATE POLICY "own api_keys" ON api_keys
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own payments" ON payments;
CREATE POLICY "own payments" ON payments
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own chat_conversations" ON chat_conversations;
CREATE POLICY "own chat_conversations" ON chat_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own academy_progress" ON academy_progress;
CREATE POLICY "own academy_progress" ON academy_progress
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 3. Child tables (ownership through the parent channel/conversation) ─
DROP POLICY IF EXISTS "own channel_videos" ON channel_videos;
CREATE POLICY "own channel_videos" ON channel_videos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM channels c
            WHERE c.id = channel_videos.channel_id
              AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM channels c
            WHERE c.id = channel_videos.channel_id
              AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own audits" ON audits;
CREATE POLICY "own audits" ON audits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM channels c
            WHERE c.id = audits.channel_id
              AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM channels c
            WHERE c.id = audits.channel_id
              AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own daily_idea_runs" ON daily_idea_runs;
CREATE POLICY "own daily_idea_runs" ON daily_idea_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM channels c
            WHERE c.id = daily_idea_runs.channel_id
              AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM channels c
            WHERE c.id = daily_idea_runs.channel_id
              AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own chat_messages" ON chat_messages;
CREATE POLICY "own chat_messages" ON chat_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM chat_conversations cc
            WHERE cc.id = chat_messages.conversation_id
              AND cc.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM chat_conversations cc
            WHERE cc.id = chat_messages.conversation_id
              AND cc.user_id = auth.uid())
  );

-- ── 4. Public-cache tables: readable by anyone, writable only via service role ─
DROP POLICY IF EXISTS "public read trending_snapshots" ON trending_snapshots;
CREATE POLICY "public read trending_snapshots" ON trending_snapshots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read assistant_cache" ON assistant_cache;
CREATE POLICY "public read assistant_cache" ON assistant_cache
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read yt_cache" ON yt_cache;
CREATE POLICY "public read yt_cache" ON yt_cache
  FOR SELECT USING (true);

-- ── 5. settings: RLS enabled, NO policy → service role only ────────────
-- (Nothing to create. Any direct anon/authenticated read or write is denied.)

-- ── Verification (run after applying; expect 17 rows, then 16 policies) ──
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT schemaname, tablename, policyname, cmd
--   FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- Then: sign in at https://nizafa.netlify.app as nizamdudin034@gmail.com
-- and confirm the dashboard still lists the owner's channels/packages.
-- An unauthenticated anon-key read of channels must return 0 rows.
