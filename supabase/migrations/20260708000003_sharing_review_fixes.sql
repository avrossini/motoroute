-- ============================================================================
-- Compartilhamento — correções da revisão adversarial (Fase 1)
--   S1: avatars_update_own sem WITH CHECK → move objeto p/ pasta de outro via UPDATE
--   B4: bucket avatars sem limite de tamanho/mime → upload gigante/não-imagem
--   C1: re-compartilhar após aceite gera 2ª cópia (índice único só cobre 'pending')
--   M1: re-enviar convite pendente floda N notificações p/ 1 convite
-- Reaplicável. Após aplicar em prod: NOTIFY pgrst, 'reload schema' (share_trip mudou).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- S1: policy de UPDATE do storage precisa validar o NOVO name (WITH CHECK),
--     não só a linha de origem (USING). Sem isto, um UPDATE pode renomear o
--     objeto para dentro da pasta de outro uid.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- B4: limitar o bucket a imagens até 5 MB (abuso de cota / arquivo não-imagem).
-- ----------------------------------------------------------------------------
UPDATE storage.buckets
  SET file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
  WHERE id = 'avatars';

-- ----------------------------------------------------------------------------
-- share_trip: fecha C1 (não recria convite se já há um ACEITO p/ o par) e
-- M1 (só notifica quando um convite NOVO é criado). ON CONFLICT DO NOTHING
-- → v_share_id NULL quando já existe pending ⇒ sem notificação repetida.
-- Assinatura inalterada (não precisa regenerar tipos). Mantém o não-vazamento.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION share_trip(p_trip_id uuid, p_recipient_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_trip trips%ROWTYPE;
  v_share_id uuid;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;
  IF NOT FOUND OR v_trip.user_id <> v_sender THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  SELECT id INTO v_recipient FROM auth.users
    WHERE lower(email) = lower(trim(p_recipient_email)) LIMIT 1;

  IF v_recipient IS NULL THEN
    RETURN jsonb_build_object('status', 'sent');   -- não vaza existência
  END IF;
  IF v_recipient = v_sender THEN RAISE EXCEPTION 'self_share'; END IF;

  -- C1: já aceito por este destinatário → não recria (evita 2ª cópia)
  IF EXISTS (
    SELECT 1 FROM trip_shares
    WHERE trip_id = p_trip_id AND recipient_id = v_recipient AND status = 'accepted'
  ) THEN
    RETURN jsonb_build_object('status', 'sent');
  END IF;

  -- Cria convite pending só se não houver um pendente (DO NOTHING → v_share_id NULL se já existia)
  INSERT INTO trip_shares (trip_id, sender_id, recipient_id, recipient_email, status)
  VALUES (p_trip_id, v_sender, v_recipient, lower(trim(p_recipient_email)), 'pending')
  ON CONFLICT (trip_id, recipient_id) WHERE status = 'pending' DO NOTHING
  RETURNING id INTO v_share_id;

  -- M1: só notifica quando o convite é NOVO (reenvio de pendente não floda)
  IF v_share_id IS NOT NULL THEN
    INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, data)
    VALUES (v_recipient, v_sender, 'trip_shared', 'trip_share', v_share_id,
      jsonb_build_object(
        'trip_title', v_trip.title,
        'trip_route', v_trip.origin || ' → ' || v_trip.destination,
        'actor_name', (SELECT display_name FROM profiles WHERE id = v_sender)
      ));
  END IF;

  RETURN jsonb_build_object('status', 'sent');
END;
$$;
REVOKE ALL ON FUNCTION share_trip(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION share_trip(uuid, text) TO authenticated;
