-- Ciclo 2 da Expedição: estrutura editável de DIAS, desacoplada dos segments.
-- Guarda, por dia de calendário: a cidade de pernoite escolhida (editável), se o
-- dia é "parado" (rest day, sem deslocamento) e se os trechos daquele dia já foram
-- gerados sob demanda. Os segments continuam sendo os trechos; trip_days é a decisão
-- do dia. Ver docs/route-engine.md §6.
CREATE TABLE trip_days (
  trip_id            uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_index          integer NOT NULL,               -- 1..N (dia de calendário)
  is_rest_day        boolean NOT NULL DEFAULT false,  -- dia parado (herda a cidade do dia anterior)
  city_name          text,                           -- cidade de pernoite (null no último dia)
  city_lat           double precision,               -- casa com trips.origin_lat/dest_lat
  city_lng           double precision,
  city_place_id      text,
  km_dia             numeric(6,1),                   -- cache do esqueleto (km do dia)
  duration_min       integer,                        -- cache do esqueleto (min do dia)
  alert_types        text[],                         -- dia_puxado | dia_extremo | sem_cidade
  segments_generated boolean NOT NULL DEFAULT false, -- true após o Rolê gerar os trechos do dia
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, day_index)
);

ALTER TABLE trip_days ENABLE ROW LEVEL SECURITY;

-- Usuário só acessa os dias das próprias viagens (mesmo padrão de segments/waypoints).
CREATE POLICY "users_own_trip_days" ON trip_days
  FOR ALL USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = trip_days.trip_id AND t.user_id = auth.uid())
  );

CREATE INDEX idx_trip_days_trip ON trip_days(trip_id, day_index);

CREATE TRIGGER trg_trip_days_updated_at
  BEFORE UPDATE ON trip_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
