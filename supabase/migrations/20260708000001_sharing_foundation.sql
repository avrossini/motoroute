-- ============================================================================
-- Compartilhamento de viagem — Fase 1: FUNDAÇÃO DE DADOS
-- profiles (identidade social) + notifications (genérica) + trip_shares (convite)
-- + colunas de proveniência em trips + trigger/backfill de profile + bucket de avatares.
-- Aditiva/retrocompatível. Idempotente (DROP POLICY IF EXISTS antes de CREATE POLICY;
-- IF NOT EXISTS em tabelas/colunas/índices) para reaplicar em prod com segurança.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) trips: colunas de proveniência do compartilhamento
--    created_by = autor ORIGINAL (persiste através do fork; user_id = dono atual)
--    shared_by/shared_at = quem enviou esta cópia e quando (só na cópia)
--    visibility = base p/ Fase 2 (link/feed); nasce 'private'
-- ----------------------------------------------------------------------------
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_at  timestamptz,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public'));

-- ----------------------------------------------------------------------------
-- 2) profiles — identidade pública (nome, @handle, avatar). E-MAIL NÃO FICA AQUI.
--    RLS quebra o padrão own-only DE PROPÓSITO: legível por qualquer autenticado
--    (necessário p/ mostrar autor/quem-compartilhou; base da camada social).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  handle       text UNIQUE,
  avatar_url   text,
  bio          text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_handle_lower
  ON profiles (lower(handle)) WHERE handle IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT chk_handle_format
    CHECK (handle IS NULL OR handle ~ '^[a-z0-9_]{3,20}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_read_all ON profiles;
CREATE POLICY profiles_read_all ON profiles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS profiles_write_own ON profiles;
CREATE POLICY profiles_write_own ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

REVOKE ALL ON profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- 3) notifications — genérica (actor/type/entity). `data` guarda SNAPSHOT
--    (título/rota/nome) p/ o card não quebrar se a viagem for editada/excluída.
--    Só a RPC (SECURITY DEFINER) insere; o recipient lê e marca lida.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type         text NOT NULL,          -- 'trip_shared' | 'share_accepted' | 'share_declined'
  entity_type  text,                   -- 'trip_share' | 'trip'
  entity_id    uuid,
  data         jsonb NOT NULL DEFAULT '{}',
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_read_own ON notifications;
CREATE POLICY notifications_read_own ON notifications
  FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE TO authenticated USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

REVOKE ALL ON notifications FROM anon;
GRANT SELECT, UPDATE ON notifications TO authenticated;   -- sem INSERT/DELETE: só a RPC insere

-- ----------------------------------------------------------------------------
-- 4) trip_shares — o convite (pending → accepted/declined). recipient_id nullable
--    p/ compartilhamento por LINK no futuro. Só a RPC escreve.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'declined')),
  copied_trip_id  uuid REFERENCES trips(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_trip_shares_recipient ON trip_shares (recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_trip_shares_trip ON trip_shares (trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_shares_unique_pending
  ON trip_shares (trip_id, recipient_id) WHERE status = 'pending';

ALTER TABLE trip_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trip_shares_parties ON trip_shares;
CREATE POLICY trip_shares_parties ON trip_shares
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

REVOKE ALL ON trip_shares FROM anon;
GRANT SELECT ON trip_shares TO authenticated;   -- escrita só via RPC

-- ----------------------------------------------------------------------------
-- 5) Trigger de profile no signup (espelha create_user_preferences) + BACKFILL
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',
             NEW.raw_user_meta_data->>'name',
             split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_user_profile ON auth.users;
CREATE TRIGGER trg_new_user_profile
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_user_profile();

-- backfill: cria profile p/ usuários existentes
INSERT INTO public.profiles (id, display_name)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name',
                split_part(u.email, '@', 1))
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- backfill: created_by = user_id nas viagens existentes (autor = dono atual)
UPDATE trips SET created_by = user_id WHERE created_by IS NULL;

-- ----------------------------------------------------------------------------
-- 6) Storage: bucket `avatars` (public read) + policies por pasta do usuário
--    path: avatars/<uid>/avatar.jpg  →  (storage.foldername(name))[1] = uid
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
