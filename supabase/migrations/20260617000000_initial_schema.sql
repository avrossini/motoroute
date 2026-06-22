-- ============================================================
-- MotoRoute MVP — Schema inicial
-- ============================================================

-- ── Extensões ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Função utilitária: updated_at automático ─────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════
-- TABELA: user_preferences
-- ════════════════════════════════════════════════════════════
CREATE TABLE user_preferences (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  default_departure_time  time DEFAULT '07:00',
  default_min_stop_km     integer DEFAULT 100,
  default_max_stop_km     integer DEFAULT 200,
  default_autonomy_km     integer DEFAULT 300,
  fuel_alert_km           integer DEFAULT 80,
  prefer_scenic_routes    boolean DEFAULT false,
  avoid_tolls             boolean DEFAULT false,
  prefer_dirt_roads       boolean DEFAULT false,
  rain_alert_threshold    integer DEFAULT 40,
  wind_alert_kmh          integer DEFAULT 50,
  stop_type_defaults      text[] DEFAULT ARRAY['fuel','food'],
  dark_mode               boolean DEFAULT false,
  language                text DEFAULT 'pt-BR',
  notifications_enabled   boolean DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- TABELA: motorcycles
-- ════════════════════════════════════════════════════════════
CREATE TABLE motorcycles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  make                text NOT NULL,
  model               text NOT NULL,
  year                integer NOT NULL,
  color               text,
  has_abs             boolean DEFAULT false,
  odometer_km         integer DEFAULT 0,
  fuel_economy_km_l   numeric(4,1) NOT NULL,
  tank_liters         numeric(4,1) NOT NULL,
  displacement_cc     integer,
  power_hp            integer,
  weight_kg           integer,
  equipment           text[],
  next_revision_km    integer,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE motorcycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_motorcycles" ON motorcycles
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_motorcycles_user_active ON motorcycles(user_id, is_active);

CREATE TRIGGER trg_motorcycles_updated_at
  BEFORE UPDATE ON motorcycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- TABELA: trips
-- ════════════════════════════════════════════════════════════
CREATE TABLE trips (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  origin              text NOT NULL,
  destination         text NOT NULL,
  departure_date      date NOT NULL,
  departure_time      time NOT NULL,
  status              text DEFAULT 'planned'
                        CHECK (status IN ('planned','saved','active','completed')),
  trip_type           text DEFAULT 'day_trip'
                        CHECK (trip_type IN ('day_trip','multi_day')),
  num_days            integer DEFAULT 1,
  min_stop_km         integer DEFAULT 100,
  max_stop_km         integer DEFAULT 200,
  started_at          timestamptz,
  completed_at        timestamptz,
  has_weather_alert   boolean DEFAULT false,
  -- campos cache / compartilhamento
  total_distance_km   numeric(7,1),
  total_duration_min  integer,
  stop_count          integer DEFAULT 0,
  rating              integer CHECK (rating BETWEEN 1 AND 5),
  rating_note         text,
  source_trip_id      uuid REFERENCES trips(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_trips" ON trips
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_trips_user_status ON trips(user_id, status);

CREATE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- TABELA: waypoints
-- ════════════════════════════════════════════════════════════
CREATE TABLE waypoints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid REFERENCES trips(id) ON DELETE CASCADE,
  name         text NOT NULL,
  latitude     numeric(10,7) NOT NULL,
  longitude    numeric(10,7) NOT NULL,
  order_index  integer NOT NULL,
  is_mandatory boolean DEFAULT true
);

ALTER TABLE waypoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_waypoints" ON waypoints
  FOR ALL USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = waypoints.trip_id AND t.user_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════
-- TABELA: segments
-- ════════════════════════════════════════════════════════════
CREATE TABLE segments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id             uuid REFERENCES trips(id) ON DELETE CASCADE,
  order_index         integer NOT NULL,
  day_index           integer DEFAULT 1,
  is_last_of_day      boolean DEFAULT false,
  origin_name         text NOT NULL,
  destination_name    text NOT NULL,
  origin_lat          numeric(10,7) NOT NULL,
  origin_lng          numeric(10,7) NOT NULL,
  dest_lat            numeric(10,7) NOT NULL,
  dest_lng            numeric(10,7) NOT NULL,
  distance_km         numeric(6,1) NOT NULL,
  duration_minutes    integer NOT NULL,
  route_summary       text,
  estimated_arrival   timestamptz,
  weather_temp_max    numeric(4,1),
  weather_rain_pct    integer,
  weather_condition   text,
  weather_wind_kmh    integer,
  has_alert           boolean DEFAULT false,
  alert_types         text[],
  weather_updated_at  timestamptz
);

ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_segments" ON segments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = segments.trip_id AND t.user_id = auth.uid())
  );

CREATE INDEX idx_segments_trip_day ON segments(trip_id, day_index, order_index);

-- ════════════════════════════════════════════════════════════
-- TABELA: stop_suggestions
-- ════════════════════════════════════════════════════════════
CREATE TABLE stop_suggestions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id    uuid REFERENCES segments(id) ON DELETE CASCADE,
  place_id      text NOT NULL,
  name          text NOT NULL,
  rating        numeric(2,1),
  total_ratings integer,
  is_24h        boolean,
  latitude      numeric(10,7) NOT NULL,
  longitude     numeric(10,7) NOT NULL,
  is_selected   boolean DEFAULT false
);

ALTER TABLE stop_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_stop_suggestions" ON stop_suggestions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM segments s
      JOIN trips t ON t.id = s.trip_id
      WHERE s.id = stop_suggestions.segment_id AND t.user_id = auth.uid()
    )
  );

CREATE INDEX idx_stops_segment_selected ON stop_suggestions(segment_id, is_selected);

-- ════════════════════════════════════════════════════════════
-- TABELA: lodging_suggestions
-- ════════════════════════════════════════════════════════════
CREATE TABLE lodging_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid REFERENCES trips(id) ON DELETE CASCADE,
  day_index       integer NOT NULL,
  place_id        text NOT NULL,
  name            text NOT NULL,
  rating          numeric(2,1),
  total_ratings   integer,
  price_level     integer,
  latitude        numeric(10,7) NOT NULL,
  longitude       numeric(10,7) NOT NULL,
  city            text NOT NULL,
  checkin_date    date NOT NULL,
  checkout_date   date NOT NULL,
  is_selected     boolean DEFAULT false,
  is_reserved     boolean DEFAULT false,
  reference_lat   numeric(10,7),
  reference_lng   numeric(10,7),
  reference_label text,
  distance_m      integer
);

ALTER TABLE lodging_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_lodging" ON lodging_suggestions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = lodging_suggestions.trip_id AND t.user_id = auth.uid())
  );

CREATE INDEX idx_lodging_trip_day ON lodging_suggestions(trip_id, day_index);

-- ════════════════════════════════════════════════════════════
-- TABELA: checkins
-- ════════════════════════════════════════════════════════════
CREATE TABLE checkins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid REFERENCES trips(id) ON DELETE CASCADE,
  segment_id       uuid REFERENCES segments(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id),
  checked_in_at    timestamptz DEFAULT now(),
  skipped          boolean DEFAULT false,
  actual_duration  integer,
  notes            text,
  UNIQUE(trip_id, segment_id, user_id)
);

ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_checkins" ON checkins
  FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════
-- TABELA: favorites
-- ════════════════════════════════════════════════════════════
CREATE TABLE favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id    text NOT NULL,
  name        text NOT NULL,
  place_type  text NOT NULL
                CHECK (place_type IN ('fuel','food','cafe','lodging','attraction','other')),
  address     text,
  latitude    numeric(10,7) NOT NULL,
  longitude   numeric(10,7) NOT NULL,
  rating      numeric(2,1),
  custom_tags text[],
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, place_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_favorites" ON favorites
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_favorites_user ON favorites(user_id, place_type);

-- ════════════════════════════════════════════════════════════
-- TABELA: stop_ratings
-- ════════════════════════════════════════════════════════════
CREATE TABLE stop_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid REFERENCES trips(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id    text NOT NULL,
  place_name  text NOT NULL,
  stop_type   text NOT NULL
                CHECK (stop_type IN ('fuel','food','lodging','attraction','other')),
  stars       integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(trip_id, user_id, place_id)
);

ALTER TABLE stop_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_stop_ratings" ON stop_ratings
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_ratings_trip_place ON stop_ratings(trip_id, place_id);

CREATE TRIGGER trg_stop_ratings_updated_at
  BEFORE UPDATE ON stop_ratings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- TABELA: stop_comments
-- ════════════════════════════════════════════════════════════
CREATE TABLE stop_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid REFERENCES trips(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id    text NOT NULL,
  place_name  text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE stop_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_stop_comments" ON stop_comments
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER trg_stop_comments_updated_at
  BEFORE UPDATE ON stop_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ════════════════════════════════════════════════════════════
-- TRIGGER: criar user_preferences automaticamente no signup
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_new_user_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_preferences();

-- ════════════════════════════════════════════════════════════
-- GRANTS: roles Supabase (necessário para PostgREST)
-- ════════════════════════════════════════════════════════════
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- anon: apenas leitura
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- authenticated: leitura e escrita (RLS controla quais linhas)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
