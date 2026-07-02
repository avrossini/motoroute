-- ============================================================
-- MotoRoute Admin — Tabelas administrativas
-- ============================================================

-- ── admin_users: controle de acesso ao painel ───────────────
CREATE TABLE admin_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role       text NOT NULL DEFAULT 'operacao'
               CHECK (role IN ('super_admin','operacao','suporte','financeiro','produto')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- Somente service_role acessa; nenhuma policy para anon/authenticated
CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── invite_codes: convites alfa/beta ────────────────────────
CREATE TABLE invite_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  email          text,
  cohort         text NOT NULL DEFAULT 'alfa'
                   CHECK (cohort IN ('alfa','beta','parceiro','interno')),
  status         text NOT NULL DEFAULT 'criado'
                   CHECK (status IN ('criado','enviado','aberto','usado','expirado','cancelado')),
  expires_at     timestamptz,
  used_at        timestamptz,
  used_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invite_codes_code ON invite_codes(code);
CREATE INDEX idx_invite_codes_status ON invite_codes(status);
CREATE TRIGGER trg_invite_codes_updated_at
  BEFORE UPDATE ON invite_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── api_usage_logs: log de chamadas às APIs externas ────────
CREATE TABLE api_usage_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trip_id               uuid REFERENCES trips(id) ON DELETE SET NULL,
  provider              text NOT NULL CHECK (provider IN ('google','weatherapi','other')),
  api_type              text NOT NULL,
  internal_endpoint     text,
  request_status        text NOT NULL DEFAULT 'success'
                          CHECK (request_status IN ('success','error','timeout','cache_hit')),
  http_status           integer,
  error_code            text,
  duration_ms           integer,
  estimated_cost_cents  numeric(8,4) DEFAULT 0,
  metadata_json         jsonb,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_api_usage_created ON api_usage_logs(created_at DESC);
CREATE INDEX idx_api_usage_user ON api_usage_logs(user_id, created_at DESC);
CREATE INDEX idx_api_usage_provider ON api_usage_logs(provider, api_type);

-- ── user_feedback: feedbacks estruturados ───────────────────
CREATE TABLE user_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trip_id        uuid REFERENCES trips(id) ON DELETE SET NULL,
  feedback_type  text NOT NULL DEFAULT 'sugestao'
                   CHECK (feedback_type IN ('bug','sugestao','duvida','elogio','dor_planejamento')),
  severity       text DEFAULT 'media'
                   CHECK (severity IN ('critica','alta','media','baixa')),
  status         text NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo','triado','em_analise','planejado','resolvido','descartado')),
  title          text,
  body           text NOT NULL,
  tags           text[],
  internal_notes text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_feedback_status ON user_feedback(status, created_at DESC);
CREATE TRIGGER trg_user_feedback_updated_at
  BEFORE UPDATE ON user_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── admin_notes: notas internas por entidade ────────────────
CREATE TABLE admin_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text NOT NULL CHECK (entity_type IN ('lead','user','trip','feedback')),
  entity_id        text NOT NULL,
  author_admin_id  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  body             text NOT NULL,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_admin_notes_entity ON admin_notes(entity_type, entity_id);

-- ── error_logs: erros técnicos capturados nas API routes ────
CREATE TABLE error_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint      text NOT NULL,
  error_code    text,
  stack_summary text,
  context_json  jsonb,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_endpoint ON error_logs(endpoint, created_at DESC);

-- ── GRANTS para service_role ─────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON invite_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON api_usage_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_feedback TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON error_logs TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
