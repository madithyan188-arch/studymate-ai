-- =============================================================================
-- Migration: 20261014220000_create_studymate_core_schema.sql
-- Project: StudyMate AI
-- Target: Supabase PostgreSQL (Public Schema)
-- Description: Core relational schema, strict Row Level Security (RLS) policies,
--              automated updated_at triggers, user registration trigger with
--              existing-user backfill, and composite integrity constraints.
--
-- Deployment Notes & Re-run Scope:
--   - Intended for a FRESH deployment of the StudyMate AI core schema in the public schema.
--   - Uses CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, and ON CONFLICT DO NOTHING.
--   - IMPORTANT: This migration is NOT universally idempotent for arbitrary pre-existing schemas.
--     CREATE TABLE IF NOT EXISTS does not reconcile or alter existing tables with divergent columns,
--     types, or constraints. Run on an empty or newly initialized public schema.
--   - Does NOT drop tables or overwrite existing user data.
--   - Safe to apply via Supabase Dashboard SQL Editor or Supabase CLI.
-- =============================================================================

-- Ensure required crypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. HELPER FUNCTIONS & SHARED TRIGGERS
-- =============================================================================

-- Maintain updated_at timestamps in UTC before every row update
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Restrict direct client execution of timestamp trigger function (least-privilege)
-- Triggers will execute internally under database engine context
REVOKE EXECUTE ON FUNCTION public.set_current_timestamp_updated_at() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. APPLICATION TABLES & RELATIONAL CONSTRAINTS
-- =============================================================================

-- 2.1 PROFILES (1-to-1 extension of Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 USER SETTINGS & PREFERENCES (1-to-1 extension of Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language VARCHAR(10) NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'ml', 'hi', 'ta')),
  theme VARCHAR(20) NOT NULL DEFAULT 'Light'
    CHECK (theme IN ('Light', 'Dark (Preview)', 'System')),
  quiz_length VARCHAR(30) NOT NULL DEFAULT '10 questions'
    CHECK (quiz_length IN ('5 questions', '10 questions', '15 questions', '20 questions')),
  explanation_style VARCHAR(30) NOT NULL DEFAULT 'Simple'
    CHECK (explanation_style IN ('Simple', 'Detailed', 'Exam-focused')),
  read_speed VARCHAR(10) NOT NULL DEFAULT '1.0x'
    CHECK (read_speed IN ('0.75x', '1.0x', '1.25x', '1.5x')),
  daily_reminder BOOLEAN NOT NULL DEFAULT true,
  spaced_repetition BOOLEAN NOT NULL DEFAULT true,
  weekly_email BOOLEAN NOT NULL DEFAULT false,
  source_references BOOLEAN NOT NULL DEFAULT true,
  preserve_quiz BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.3 STUDY MATERIALS (Uploaded course documents, PDFs, TXT notes)
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('PDF', 'TXT', 'DOC', 'DOCX')),
  size_bytes BIGINT NOT NULL DEFAULT 0
    CHECK (size_bytes >= 0),
  size_display VARCHAR(30),
  storage_path TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Ready'
    CHECK (status IN ('Ready', 'Processing', 'Failed')),
  progress INTEGER NOT NULL DEFAULT 100
    CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite unique key enabling child tables to enforce strict material ownership
  CONSTRAINT uq_materials_id_user_id UNIQUE (id, user_id)
);

-- 2.4 AI STUDY NOTES (Summaries, key concepts, mind maps per material)
CREATE TABLE IF NOT EXISTS public.study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_bookmarked BOOLEAN NOT NULL DEFAULT false,
  language VARCHAR(10) NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'ml', 'hi', 'ta')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite foreign key guarantees notes can only be attached to the user's own material
  CONSTRAINT fk_study_notes_material_user
    FOREIGN KEY (material_id, user_id)
    REFERENCES public.materials(id, user_id)
    ON DELETE CASCADE
);

-- 2.5 INTERACTIVE QUIZ ATTEMPTS & PROGRESS (Append-only historical audit log)
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID,
  topic TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0
    CHECK (score >= 0),
  total_questions INTEGER NOT NULL DEFAULT 0
    CHECK (total_questions >= 0),
  percentage INTEGER NOT NULL DEFAULT 0
    CHECK (percentage >= 0 AND percentage <= 100),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_quiz_score_lte_total CHECK (score <= total_questions),
  -- Composite foreign key guarantees quiz attempts can only be associated with user's own material
  -- Preserves user progress history if material is deleted by setting only material_id to NULL
  CONSTRAINT fk_quiz_attempts_material_user
    FOREIGN KEY (material_id, user_id)
    REFERENCES public.materials(id, user_id)
    ON DELETE SET NULL (material_id)
);

-- 2.6 AI TUTOR CONVERSATIONS (Parent chat threads)
CREATE TABLE IF NOT EXISTS public.tutor_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID,
  title TEXT NOT NULL DEFAULT 'Study Session',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite unique key enabling child tutor_messages to verify conversation ownership
  CONSTRAINT uq_tutor_conversations_id_user_id UNIQUE (id, user_id),
  -- Composite foreign key guarantees conversation can only link to user's own material
  -- Preserves chat conversation history if material is deleted by setting only material_id to NULL
  CONSTRAINT fk_tutor_conversations_material_user
    FOREIGN KEY (material_id, user_id)
    REFERENCES public.materials(id, user_id)
    ON DELETE SET NULL (material_id)
);

-- 2.7 AI TUTOR MESSAGES (Child messages strictly bound to parent conversation & user)
CREATE TABLE IF NOT EXISTS public.tutor_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(10) NOT NULL
    CHECK (role IN ('user', 'ai')),
  text TEXT NOT NULL
    CHECK (length(trim(text)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite foreign key guarantees conversation_id and user_id are strictly coherent
  CONSTRAINT fk_tutor_messages_parent_conversation
    FOREIGN KEY (conversation_id, user_id)
    REFERENCES public.tutor_conversations(id, user_id)
    ON DELETE CASCADE
);

-- 2.8 SCAN & FIND ANSWERS QUERIES (OCR & Question search history)
CREATE TABLE IF NOT EXISTS public.scan_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL
    CHECK (length(trim(question_text)) > 0),
  image_path TEXT,
  mode VARCHAR(20) NOT NULL DEFAULT 'notes'
    CHECK (mode IN ('notes', 'general')),
  answer_text TEXT,
  source_citation TEXT,
  confidence VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. AUTOMATED UPDATED_AT TRIGGERS (Mutable tables only)
-- =============================================================================

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER set_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_materials_updated_at ON public.materials;
CREATE TRIGGER set_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_study_notes_updated_at ON public.study_notes;
CREATE TRIGGER set_study_notes_updated_at
  BEFORE UPDATE ON public.study_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_tutor_conversations_updated_at ON public.tutor_conversations;
CREATE TRIGGER set_tutor_conversations_updated_at
  BEFORE UPDATE ON public.tutor_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- =============================================================================
-- 4. PERFORMANCE & FOREIGN KEY INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_materials_user_id ON public.materials(user_id);
CREATE INDEX IF NOT EXISTS idx_study_notes_user_id ON public.study_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_study_notes_material_id ON public.study_notes(material_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_material_id ON public.quiz_attempts(material_id);
CREATE INDEX IF NOT EXISTS idx_tutor_conversations_user_id ON public.tutor_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_conversations_material_id ON public.tutor_conversations(material_id);
CREATE INDEX IF NOT EXISTS idx_tutor_messages_conversation_id ON public.tutor_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tutor_messages_user_id ON public.tutor_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_queries_user_id ON public.scan_queries(user_id);

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable and Force RLS on all eight tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials FORCE ROW LEVEL SECURITY;

ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tutor_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_conversations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tutor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_messages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.scan_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_queries FORCE ROW LEVEL SECURITY;

-- 5.1 PROFILES POLICIES
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_delete_own"
  ON public.profiles FOR DELETE
  USING ((select auth.uid()) = id);

-- 5.2 USER SETTINGS POLICIES
DROP POLICY IF EXISTS "user_settings_select_own" ON public.user_settings;
CREATE POLICY "user_settings_select_own"
  ON public.user_settings FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_settings_insert_own" ON public.user_settings;
CREATE POLICY "user_settings_insert_own"
  ON public.user_settings FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_settings_update_own" ON public.user_settings;
CREATE POLICY "user_settings_update_own"
  ON public.user_settings FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_settings_delete_own" ON public.user_settings;
CREATE POLICY "user_settings_delete_own"
  ON public.user_settings FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 5.3 STUDY MATERIALS POLICIES
DROP POLICY IF EXISTS "materials_select_own" ON public.materials;
CREATE POLICY "materials_select_own"
  ON public.materials FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "materials_insert_own" ON public.materials;
CREATE POLICY "materials_insert_own"
  ON public.materials FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "materials_update_own" ON public.materials;
CREATE POLICY "materials_update_own"
  ON public.materials FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "materials_delete_own" ON public.materials;
CREATE POLICY "materials_delete_own"
  ON public.materials FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 5.4 STUDY NOTES POLICIES
DROP POLICY IF EXISTS "study_notes_select_own" ON public.study_notes;
CREATE POLICY "study_notes_select_own"
  ON public.study_notes FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "study_notes_insert_own" ON public.study_notes;
CREATE POLICY "study_notes_insert_own"
  ON public.study_notes FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "study_notes_update_own" ON public.study_notes;
CREATE POLICY "study_notes_update_own"
  ON public.study_notes FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "study_notes_delete_own" ON public.study_notes;
CREATE POLICY "study_notes_delete_own"
  ON public.study_notes FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 5.5 QUIZ ATTEMPTS POLICIES (Immutable to UPDATE; user-controlled DELETE permitted for privacy and history resets)
-- Note: This table is immutable to UPDATE (preventing score/percentage falsification). It is not strictly
-- append-only, as authenticated users retain DELETE privileges over their own rows to prune or reset their
-- quiz history in accordance with student data privacy principles.
DROP POLICY IF EXISTS "quiz_attempts_select_own" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_select_own"
  ON public.quiz_attempts FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "quiz_attempts_insert_own" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_insert_own"
  ON public.quiz_attempts FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "quiz_attempts_update_own" ON public.quiz_attempts;
-- Note: Explicitly NO UPDATE policy is created. Historical test results are immutable once recorded.

DROP POLICY IF EXISTS "quiz_attempts_delete_own" ON public.quiz_attempts;
CREATE POLICY "quiz_attempts_delete_own"
  ON public.quiz_attempts FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 5.6 TUTOR CONVERSATIONS POLICIES
DROP POLICY IF EXISTS "tutor_conversations_select_own" ON public.tutor_conversations;
CREATE POLICY "tutor_conversations_select_own"
  ON public.tutor_conversations FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "tutor_conversations_insert_own" ON public.tutor_conversations;
CREATE POLICY "tutor_conversations_insert_own"
  ON public.tutor_conversations FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "tutor_conversations_update_own" ON public.tutor_conversations;
CREATE POLICY "tutor_conversations_update_own"
  ON public.tutor_conversations FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "tutor_conversations_delete_own" ON public.tutor_conversations;
CREATE POLICY "tutor_conversations_delete_own"
  ON public.tutor_conversations FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 5.7 TUTOR MESSAGES POLICIES
-- Multi-layered security: Message ownership is strictly validated against parent conversation
DROP POLICY IF EXISTS "tutor_messages_select_own" ON public.tutor_messages;
CREATE POLICY "tutor_messages_select_own"
  ON public.tutor_messages FOR SELECT
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.tutor_conversations c
      WHERE c.id = tutor_messages.conversation_id
      AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "tutor_messages_insert_own" ON public.tutor_messages;
CREATE POLICY "tutor_messages_insert_own"
  ON public.tutor_messages FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.tutor_conversations c
      WHERE c.id = tutor_messages.conversation_id
      AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "tutor_messages_update_own" ON public.tutor_messages;
CREATE POLICY "tutor_messages_update_own"
  ON public.tutor_messages FOR UPDATE
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.tutor_conversations c
      WHERE c.id = tutor_messages.conversation_id
      AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.tutor_conversations c
      WHERE c.id = tutor_messages.conversation_id
      AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "tutor_messages_delete_own" ON public.tutor_messages;
CREATE POLICY "tutor_messages_delete_own"
  ON public.tutor_messages FOR DELETE
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.tutor_conversations c
      WHERE c.id = tutor_messages.conversation_id
      AND c.user_id = (select auth.uid())
    )
  );

-- 5.8 SCAN QUERIES POLICIES
DROP POLICY IF EXISTS "scan_queries_select_own" ON public.scan_queries;
CREATE POLICY "scan_queries_select_own"
  ON public.scan_queries FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "scan_queries_insert_own" ON public.scan_queries;
CREATE POLICY "scan_queries_insert_own"
  ON public.scan_queries FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "scan_queries_update_own" ON public.scan_queries;
CREATE POLICY "scan_queries_update_own"
  ON public.scan_queries FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "scan_queries_delete_own" ON public.scan_queries;
CREATE POLICY "scan_queries_delete_own"
  ON public.scan_queries FOR DELETE
  USING ((select auth.uid()) = user_id);

-- =============================================================================
-- 6. SCHEMA & TABLE PRIVILEGES (Defense in Depth)
-- =============================================================================

-- Ensure authenticated role has usage on public schema; table access remains strictly mediated by RLS
GRANT USAGE ON SCHEMA public TO authenticated;

-- Revoke all table access from anonymous public role
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_settings FROM anon;
REVOKE ALL ON public.materials FROM anon;
REVOKE ALL ON public.study_notes FROM anon;
REVOKE ALL ON public.quiz_attempts FROM anon;
REVOKE ALL ON public.tutor_conversations FROM anon;
REVOKE ALL ON public.tutor_messages FROM anon;
REVOKE ALL ON public.scan_queries FROM anon;

-- Grant standard CRUD access to authenticated users (mediated strictly by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_notes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.quiz_attempts TO authenticated; -- Notice: UPDATE omitted for quiz_attempts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_queries TO authenticated;

-- =============================================================================
-- 7. AUTOMATED USER REGISTRATION TRIGGER & EXISTING USERS BACKFILL
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Safely extract user display name
  v_full_name := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    CASE
      WHEN NEW.email IS NOT NULL AND POSITION('@' IN NEW.email) > 1
      THEN split_part(NEW.email, '@', 1)
      ELSE 'Student'
    END
  )), '');

  -- Safely extract avatar URL
  v_avatar_url := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  )), '');

  -- Idempotently create user profile (never overwrites existing data)
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, v_full_name, v_avatar_url)
  ON CONFLICT (id) DO NOTHING;

  -- Idempotently create initial user settings (never overwrites existing data)
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Restrict direct execution of security-definer trigger function (least-privilege)
-- Triggers on auth.users will continue to execute internally under database engine context
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 8. IDEMPOTENT BACKFILL FOR EXISTING TEST / OAUTH USERS
-- =============================================================================

-- Populate profiles for any users created prior to trigger deployment
INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT
  u.id,
  NULLIF(TRIM(COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    CASE
      WHEN u.email IS NOT NULL AND POSITION('@' IN u.email) > 1
      THEN split_part(u.email, '@', 1)
      ELSE 'Student'
    END
  )), ''),
  NULLIF(TRIM(COALESCE(
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'picture'
  )), '')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Populate settings for any users created prior to trigger deployment
INSERT INTO public.user_settings (user_id)
SELECT u.id
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;
