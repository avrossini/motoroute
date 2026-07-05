-- Ciclo 2 da Expedição: a que DIA de deslocamento cada parada obrigatória pertence.
-- Preenchido pelo bucketing do dividirEmDias (a rota passa pela parada; ela cai no dia
-- cujo trecho a contém). Usado ao gerar os trechos do dia sob demanda (o Rolê crava só
-- as paradas daquele dia). NULL enquanto o esqueleto não rodou. Ver docs/route-engine.md §6.
ALTER TABLE waypoints ADD COLUMN day_index integer;
