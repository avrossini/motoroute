-- Sub-opção "Ida e volta" do Rolê (day_trip): quando true, o motor também planeja
-- o trecho de volta (destino → origem), recalculado de forma independente.
-- Não é um novo trip_type — é um detalhe de quantos trechos gerar no mesmo Rolê.
ALTER TABLE trips ADD COLUMN round_trip boolean NOT NULL DEFAULT false;
