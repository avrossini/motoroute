-- Inserção manual de parada no Rolê (day_trip): distingue parada MANUAL da AUTOMÁTICA do motor.
--   NULL   = parada automática do motor (fetchStops busca/atualiza o posto — comportamento atual).
--   'fuel' = posto EXATO escolhido pelo usuário (place_id pinado em stop_suggestions;
--            fetchStops NÃO re-busca esse segmento, para não trocar o posto fixado).
--   'poi'  = ponto de interesse (mirante/bar/monumento); o destino do segmento é o próprio POI
--            e o fetchStops anexa o posto mais próximo (mesma regra de avaliação) como sugestão.
-- fetchStops/attachRolePostos pulam segmentos com stop_kind = 'fuel'. Ver docs/business-logic.md.
-- Aditiva e retrocompatível: coluna nasce NULL em todo dado legado (= comportamento atual).
ALTER TABLE segments
  ADD COLUMN stop_kind text CHECK (stop_kind IN ('fuel', 'poi'));
