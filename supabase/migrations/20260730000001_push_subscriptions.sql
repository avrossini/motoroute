-- ── Web Push: subscriptions + gatilho de despacho ─────────────────────────────
-- Fluxo: INSERT em notifications → trigger → pg_net POST /api/push/dispatch
-- (fire-and-forget; o push JAMAIS pode abortar a criação da notificação).
--
-- Aplicação em prod: cirúrgica via psql no pooler + NOTIFY pgrst, 'reload schema'
-- (history drift — não usar supabase db push). Após aplicar, setar o segredo:
--   ALTER DATABASE postgres SET app.push_webhook_secret = '<mesmo valor do env PUSH_WEBHOOK_SECRET na Vercel>';
-- Sem o GUC setado (ex.: dev local), a função vira no-op e nenhum POST sai —
-- assim o segredo não fica no repositório e o dev local não atinge produção.
--
-- GOTCHA (pool): ALTER DATABASE ... SET só vale para conexões NOVAS. As conexões
-- já abertas do PostgREST/pooler seguem sem o GUC (trigger no-op) até reciclarem —
-- push intermitente logo após aplicar. Reiniciar o serviço `rest` do Supabase
-- (mesmo runbook do GOTCHA das RPCs da Fase 1) ou aguardar a reciclagem.
-- Verificar numa conexão nova: SELECT current_setting('app.push_webhook_secret', true);
--
-- Rotação do segredo: rodar o ALTER DATABASE com o valor novo + atualizar o env
-- PUSH_WEBHOOK_SECRET na Vercel. (O pg_net grava headers em net.http_request_queue /
-- net._http_response — conferir que o schema net não tem grants p/ anon/authenticated.)

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
  v_secret := current_setting('app.push_webhook_secret', true);
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;  -- ambiente sem push (ex.: dev local): no-op
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
