-- Nizafa.ai public chatbot — idempotent migration.
-- The chat_conversations / chat_messages tables are already in
-- supabase/schema.sql (run at the 2026-11-15 launch). Run this file only if
-- a fresh project needs them, or to confirm the RLS policies exist.
-- Safe to run twice: IF NOT EXISTS + DROP POLICY IF EXISTS everywhere.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID REFERENCES app_users(id),
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own chat_conversations" ON chat_conversations;
CREATE POLICY "own chat_conversations" ON chat_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

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
