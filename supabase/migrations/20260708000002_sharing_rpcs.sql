-- ============================================================================
-- Compartilhamento de viagem — Fase 1: RPCs (SECURITY DEFINER)
--   fork_trip        — clona uma viagem inteira p/ outro dono (remapeia FKs)
--   share_trip       — cria convite pending + notificação (sem vazar existência)
--   respond_to_share — aceita (=fork) ou recusa; atômico e à prova de duplo-clique
-- Cliente chama share_trip / respond_to_share via supabase.rpc(). fork_trip é interna.
-- Todas: SET search_path fixo; validam auth.uid(); REVOKE public + GRANT authenticated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fork_trip: cópia FIEL. Clona na ordem trips → trip_days → waypoints → segments
-- (com mapa old→new) → stop_suggestions (remapeia segment_id) → lodging_suggestions.
-- NÃO clona checkins/stop_ratings/stop_comments. Zera estado/clima/cache; status='planned'.
-- Usa jsonb_populate_record p/ copiar TODAS as colunas (robusto a novas colunas),
-- sobrescrevendo só as que precisam. created_by = autor ORIGINAL (preserva autoria).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fork_trip(uuid, uuid, uuid);
CREATE FUNCTION fork_trip(
  p_source_trip_id uuid,
  p_new_owner      uuid,
  p_shared_by      uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  new_trip_id uuid := gen_random_uuid();
BEGIN
  -- 1) trips (header): sobrescreve dono/proveniência; zera estado/cache/clima-alert
  INSERT INTO trips
  SELECT (jsonb_populate_record(NULL::trips,
    to_jsonb(t) || jsonb_build_object(
      'id', new_trip_id,
      'user_id', p_new_owner,
      'created_by', COALESCE(t.created_by, t.user_id),
      'shared_by', p_shared_by,
      'shared_at', now(),
      'source_trip_id', t.id,
      'status', 'planned',
      'visibility', 'private',
      'started_at', NULL, 'completed_at', NULL,
      'rating', NULL, 'rating_note', NULL,
      'has_weather_alert', false,
      'total_distance_km', NULL, 'total_duration_min', NULL, 'stop_count', 0,
      'created_at', now(), 'updated_at', now()
    ))).*
  FROM trips t WHERE t.id = p_source_trip_id;

  -- 2) trip_days (PK composta trip_id+day_index; sem id próprio)
  INSERT INTO trip_days
  SELECT (jsonb_populate_record(NULL::trip_days,
    to_jsonb(td) || jsonb_build_object('trip_id', new_trip_id))).*
  FROM trip_days td WHERE td.trip_id = p_source_trip_id;

  -- 3) waypoints
  INSERT INTO waypoints
  SELECT (jsonb_populate_record(NULL::waypoints,
    to_jsonb(w) || jsonb_build_object('id', gen_random_uuid(), 'trip_id', new_trip_id))).*
  FROM waypoints w WHERE w.trip_id = p_source_trip_id;

  -- 4) segments COM MAPA old→new. new_id gerado no CTE (não no RETURNING — ordem não é
  --    garantida). MATERIALIZED força avaliação única → new_id estável entre os 2 usos.
  --    Preserva stop_kind; zera clima/alertas/chegada.
  CREATE TEMP TABLE _seg_map (old_id uuid, new_id uuid) ON COMMIT DROP;
  WITH src AS MATERIALIZED (
    SELECT s.id AS old_id, gen_random_uuid() AS new_id, to_jsonb(s) AS j
    FROM segments s WHERE s.trip_id = p_source_trip_id
  ),
  ins AS (
    INSERT INTO segments
    SELECT (jsonb_populate_record(NULL::segments,
      src.j || jsonb_build_object(
        'id', src.new_id, 'trip_id', new_trip_id,
        'estimated_arrival', NULL, 'has_alert', false, 'alert_types', NULL,
        'weather_temp_max', NULL, 'weather_rain_pct', NULL, 'weather_condition', NULL,
        'weather_wind_kmh', NULL, 'weather_updated_at', NULL
      ))).*
    FROM src
    RETURNING 1
  )
  INSERT INTO _seg_map (old_id, new_id) SELECT old_id, new_id FROM src;

  -- 5) stop_suggestions: remapeia segment_id via _seg_map (preserva is_selected)
  INSERT INTO stop_suggestions (id, segment_id, place_id, name, rating, total_ratings,
                                is_24h, latitude, longitude, is_selected)
  SELECT gen_random_uuid(), m.new_id, ss.place_id, ss.name, ss.rating, ss.total_ratings,
         ss.is_24h, ss.latitude, ss.longitude, ss.is_selected
  FROM stop_suggestions ss
  JOIN _seg_map m ON m.old_id = ss.segment_id;

  -- 6) lodging_suggestions (is_reserved=false na cópia)
  INSERT INTO lodging_suggestions
  SELECT (jsonb_populate_record(NULL::lodging_suggestions,
    to_jsonb(l) || jsonb_build_object(
      'id', gen_random_uuid(), 'trip_id', new_trip_id, 'is_reserved', false))).*
  FROM lodging_suggestions l WHERE l.trip_id = p_source_trip_id;

  DROP TABLE IF EXISTS _seg_map;
  RETURN new_trip_id;
END;
$$;
REVOKE ALL ON FUNCTION fork_trip(uuid, uuid, uuid) FROM public;  -- interna: só respond_to_share chama

-- ----------------------------------------------------------------------------
-- share_trip: valida dono; resolve email→user; cria convite + notificação.
-- NÃO VAZA: retorna {status:'sent'} mesmo se o email não for de um usuário.
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
    RETURN jsonb_build_object('status', 'sent');   -- resposta idêntica: não vaza existência
  END IF;
  IF v_recipient = v_sender THEN RAISE EXCEPTION 'self_share'; END IF;

  INSERT INTO trip_shares (trip_id, sender_id, recipient_id, recipient_email, status)
  VALUES (p_trip_id, v_sender, v_recipient, lower(trim(p_recipient_email)), 'pending')
  ON CONFLICT (trip_id, recipient_id) WHERE status = 'pending'
    DO UPDATE SET created_at = now()
  RETURNING id INTO v_share_id;

  INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, data)
  VALUES (v_recipient, v_sender, 'trip_shared', 'trip_share', v_share_id,
    jsonb_build_object(
      'trip_title', v_trip.title,
      'trip_route', v_trip.origin || ' → ' || v_trip.destination,
      'actor_name', (SELECT display_name FROM profiles WHERE id = v_sender)
    ));

  RETURN jsonb_build_object('status', 'sent');
END;
$$;
REVOKE ALL ON FUNCTION share_trip(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION share_trip(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- respond_to_share: aceita (fork) ou recusa. FOR UPDATE + status='pending' evita
-- fork duplo (duplo-clique/2 dispositivos). Se a viagem-origem sumiu → declina.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION respond_to_share(p_share_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_me uuid := auth.uid();
  v_share trip_shares%ROWTYPE;
  v_new_trip uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_share FROM trip_shares WHERE id = p_share_id FOR UPDATE;
  IF NOT FOUND OR v_share.recipient_id <> v_me THEN RAISE EXCEPTION 'not_recipient'; END IF;
  IF v_share.status <> 'pending' THEN RAISE EXCEPTION 'already_responded'; END IF;

  IF p_accept THEN
    IF NOT EXISTS (SELECT 1 FROM trips WHERE id = v_share.trip_id) THEN
      UPDATE trip_shares SET status = 'declined', responded_at = now() WHERE id = p_share_id;
      RAISE EXCEPTION 'source_deleted';
    END IF;

    v_new_trip := fork_trip(v_share.trip_id, v_me, v_share.sender_id);
    UPDATE trip_shares SET status = 'accepted', copied_trip_id = v_new_trip, responded_at = now()
      WHERE id = p_share_id;

    INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, data)
    VALUES (v_share.sender_id, v_me, 'share_accepted', 'trip', v_new_trip,
      jsonb_build_object('actor_name', (SELECT display_name FROM profiles WHERE id = v_me)));
  ELSE
    UPDATE trip_shares SET status = 'declined', responded_at = now() WHERE id = p_share_id;
  END IF;

  UPDATE notifications SET read_at = now()
    WHERE entity_type = 'trip_share' AND entity_id = p_share_id AND recipient_id = v_me;

  RETURN jsonb_build_object('status', CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
                            'trip_id', v_new_trip);
END;
$$;
REVOKE ALL ON FUNCTION respond_to_share(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION respond_to_share(uuid, boolean) TO authenticated;
