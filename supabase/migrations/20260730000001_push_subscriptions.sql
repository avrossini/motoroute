-- ── Web Push: subscriptions + gatilho de despacho ─────────────────────────────
-- Fluxo: INSERT em notifications → trigger → pg_net POST /api/push/dispatch
-- (fire-and-forget; o push JAMAIS pode abortar a criação da notificação).
--
-- Aplicação em prod: cirúrgica via psql no pooler + NOTIFY pgrst, 'reload schema'
-- (history drift — não usar supabase db push). Após aplicar, guardar o segredo no
-- Supabase Vault (uma vez; NÃO commitar o valor):
--   SELECT vault.create_secret('<mesmo valor do env PUSH_WEBHOOK_SECRET na Vercel>', 'push_webhook_secret');
-- A função lê vault.decrypted_secrets (SECURITY DEFINER). Sem Vault ou sem o
-- segredo (ex.: dev local), vira no-op e nenhum POST sai — o segredo não fica no
-- repositório e o dev local não atinge produção.
-- (Nota: GUC via ALTER DATABASE/ROLE não é possível no hosted — postgres não é
-- superuser p/ parâmetros persistentes no PG15+; por isso o Vault.)
--
-- Rotação do segredo: UPDATE via vault.update_secret (achar o id em vault.secrets
-- WHERE name='push_webhook_secret') + atualizar o env PUSH_WEBHOOK_SECRET na Vercel.
-- (O pg_net grava headers em net.http_request_queue / net._http_response —
-- conferir que o schema net não tem grants p/ anon/authenticated.)

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Tabela de subscriptions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_push_subscriptions ON push_subscriptions;
CREATE POLICY users_own_push_subscriptions ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO service_role;

-- ── Trigger de despacho ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_push_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Segredo no Vault (cifrado). Sem Vault (dev local) ou sem o segredo: no-op silencioso.
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;
  END IF;

  -- net.http_post apenas ENFILEIRA (async) — não adiciona latência ao INSERT.
  PERFORM net.http_post(
    url     := 'https://app.motoroute.com.br/api/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    body    := jsonb_build_object(
      'id',           NEW.id,
      'recipient_id', NEW.recipient_id,
      'type',         NEW.type,
      'entity_type',  NEW.entity_type,
      'entity_id',    NEW.entity_id,
      'data',         NEW.data
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Falha do push é engolida (a notificação in-app sempre vence), mas com rastro
  -- nos logs do Postgres — lição do incidente do geocode (erro invisível).
  RAISE WARNING 'push dispatch falhou p/ notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_push ON notifications;
CREATE TRIGGER trg_notifications_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_push_dispatch();
