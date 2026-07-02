-- ============================================================
-- MotoRoute Admin — Expandir waitlist para gestão de leads
-- ============================================================

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo','qualificado','convidado','aguardando_cadastro','cadastrado','testando','feedback_recebido','descartado','bloqueado')),
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS source         text DEFAULT 'hotsite'
    CHECK (source IN ('hotsite','evento','indicacao','campanha','manual','outro')),
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_source ON waitlist(source);

-- GRANT para service_role ler/escrever waitlist
GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist TO service_role;
