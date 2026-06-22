---
paths:
  - "supabase/migrations/**"
  - "src/types/**"
  - "src/services/supabase*"
---

# Banco de Dados — MotoRoute (Supabase/PostgreSQL)

## Tabelas principais do MVP

### `trips` — viagens criadas pelo usuário
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE
title           text NOT NULL                        -- nome da viagem; gerado automaticamente como "{origin} → {destination}" se o usuário não preencher
origin          text NOT NULL                        -- cidade de origem
destination     text NOT NULL                        -- cidade de destino
departure_date  date NOT NULL
departure_time  time NOT NULL
status          text DEFAULT 'planned'               -- planned | saved | active | completed
                                                     -- 'planned' = roteiro criado, usuário ainda não iniciou
                                                     -- 'saved'   = roteiro salvo como template (sem data definida)
                                                     -- 'active'  = usuário clicou em "Iniciar viagem" (started_at preenchido)
                                                     -- 'completed' = usuário clicou em "Concluir viagem" (completed_at preenchido)
min_stop_km     integer DEFAULT 100              -- distância mínima entre paradas desta viagem (copiado de user_preferences.default_min_stop_km na criação)
max_stop_km     integer DEFAULT 200              -- distância máxima entre paradas desta viagem (copiado de user_preferences.default_max_stop_km na criação)
started_at      timestamptz                          -- quando o usuário clicou em "Iniciar viagem"; sobrescrito ao reiniciar após cancelamento
completed_at    timestamptz                          -- quando o usuário clicou em "Concluir viagem"
has_weather_alert boolean DEFAULT false              -- true se algum segmento superar user_preferences.rain_alert_threshold do próprio usuário; recalculado ao atualizar o clima de qualquer segmento
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

> Cada viagem tem um único usuário (o owner). Não existe conceito de membros, papéis ou conflito entre preferências de pessoas diferentes — `min_stop_km`/`max_stop_km` são apenas os valores copiados das preferências do próprio usuário na criação da viagem, e podem ser editados livremente por ele depois.

### `waypoints` — pontos obrigatórios definidos pelo usuário
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id     uuid REFERENCES trips(id) ON DELETE CASCADE
name        text NOT NULL                            -- ex: "Posto O Fazendeiro"
latitude    numeric(10,7) NOT NULL
longitude   numeric(10,7) NOT NULL
order_index integer NOT NULL
is_mandatory boolean DEFAULT true
```

### `segments` — trechos calculados do roteiro
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id             uuid REFERENCES trips(id) ON DELETE CASCADE
order_index         integer NOT NULL
origin_name         text NOT NULL
destination_name    text NOT NULL
origin_lat          numeric(10,7) NOT NULL
origin_lng          numeric(10,7) NOT NULL
dest_lat            numeric(10,7) NOT NULL
dest_lng            numeric(10,7) NOT NULL
distance_km         numeric(6,1) NOT NULL            -- da Directions API
duration_minutes    integer NOT NULL                 -- da Directions API
route_summary       text                             -- nome principal da via (campo 'summary' da Directions API, ex: 'Rodovia Presidente Dutra')
estimated_arrival   timestamptz
weather_temp_max    numeric(4,1)                     -- da WeatherAPI
weather_rain_pct    integer                          -- 0–100
weather_condition   text
weather_wind_kmh    integer                          -- velocidade do vento em km/h (da WeatherAPI)
has_alert           boolean DEFAULT false
alert_types         text[]                           -- ['rain','night','mountain']
weather_updated_at  timestamptz                          -- quando o clima foi consultado pela última vez
```

### `stop_suggestions` — postos/restaurantes sugeridos por trecho
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
segment_id      uuid REFERENCES segments(id) ON DELETE CASCADE
place_id        text NOT NULL                        -- Google Places ID
name            text NOT NULL
rating          numeric(2,1)
total_ratings   integer
is_24h          boolean
latitude        numeric(10,7) NOT NULL
longitude       numeric(10,7) NOT NULL
is_selected     boolean DEFAULT false                -- qual foi escolhido
```

### `checkins` — registro de chegada (ou pulo) em cada parada durante a viagem
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id         uuid REFERENCES trips(id) ON DELETE CASCADE
segment_id      uuid REFERENCES segments(id) ON DELETE CASCADE
user_id         uuid REFERENCES auth.users(id)      -- usuário que realizou o check-in
checked_in_at   timestamptz DEFAULT now()
skipped         boolean DEFAULT false               -- true = usuário pulou esta parada (não altera o roteiro)
actual_duration integer                              -- minutos reais na parada (null quando skipped=true)
notes           text
UNIQUE(trip_id, segment_id, user_id)                -- um check-in (ou skip) por (viagem × trecho)
```

Notas:
- `skipped = false` → check-in normal; `skipped = true` → usuário optou por pular a parada sem alterar o roteiro.
- A constraint UNIQUE garante no banco que cada viagem tem só um registro por trecho. Um segundo check-in faz upsert com `INSERT ON CONFLICT DO UPDATE` (ex: usuário que fez check-in deseja marcar como pulado).

## Convenções do banco
- Sempre usar `uuid` como PK — nunca `serial`
- Timestamps sempre com timezone (`timestamptz`) — nunca `timestamp`
- Row Level Security (RLS) habilitado em todas as tabelas
- Política padrão: usuário só acessa os próprios dados
- Migrations versionadas em `supabase/migrations/` — nunca editar direto no dashboard
- Toda migration deve ser validada localmente (`supabase db reset`) antes de ir para produção (`supabase db push`)
- Após qualquer alteração de schema, regenerar tipos: `npx supabase gen types typescript --local > src/types/database.ts`

## Ambiente local de banco (Docker Compose)

O projeto usa `docker-compose.yml` para subir toda a stack localmente: Postgres, Kong (API gateway), Auth (GoTrue), PostgREST, Realtime, Storage, Studio e o próprio app Expo. Tudo na mesma rede Docker interna (`motoroute-net`).

```bash
# Subir toda a stack
docker compose up

# Recriar o banco do zero (apaga todos os dados locais — útil para testar migrations)
docker compose down -v && docker compose up

# Enviar migrations validadas para produção
supabase db push --db-url "postgresql://postgres:postgres@localhost:5432/postgres"
```

Portas expostas no host (definidas em `docker-compose.yml`):

| Serviço | Porta | Uso |
|---------|-------|-----|
| Kong (API Supabase) | 54321 | `EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321` |
| Postgres | 5432 | Conexão direta via psql ou GUI (DBeaver, TablePlus) |
| Studio | 54323 | Painel visual — abrir no browser: `http://localhost:54323` |
| Inbucket | 54324 | Captura e-mails de auth (cadastro/reset) em dev: `http://localhost:54324` |
| App Expo (web) | 8081 | `http://localhost:8081` |

Comunicação **dentro** da rede Docker usa nomes de serviço em vez de `localhost`:
- Expo → Supabase: `http://kong:8000` (variável injetada pelo compose)
- Auth → Banco: `postgres://supabase_auth_admin:...@db:5432/postgres`

A anon key e o JWT_SECRET locais são os valores padrão do Supabase para desenvolvimento — estão no `.env.example` e são públicos. Não têm acesso a dados de produção.

## RLS padrão (aplicar em todas as tabelas)
```sql
-- Habilitar RLS
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Política: usuário vê apenas os próprios registros
CREATE POLICY "users_own_data" ON trips
  FOR ALL USING (auth.uid() = user_id);
```

### Alterações para suporte a múltiplos dias

**Novos campos na tabela `trips`:**
```sql
trip_type       text DEFAULT 'day_trip'   -- day_trip | multi_day
num_days        integer DEFAULT 1         -- número de dias da viagem (1 = day trip)
```

**Novo campo na tabela `segments`:**
```sql
day_index       integer DEFAULT 1         -- qual dia da viagem este trecho pertence (1, 2, 3...)
is_last_of_day  boolean DEFAULT false     -- true = último trecho do dia → destino é a hospedagem
```

### `lodging_suggestions` — hospedagem sugerida por dia overnight
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id         uuid REFERENCES trips(id) ON DELETE CASCADE
day_index       integer NOT NULL                     -- qual dia da viagem
place_id        text NOT NULL                        -- Google Places ID
name            text NOT NULL
rating          numeric(2,1)
total_ratings   integer
price_level     integer                              -- 1 a 4 ($ a $$$$)
latitude        numeric(10,7) NOT NULL
longitude       numeric(10,7) NOT NULL
city            text NOT NULL                        -- usada no deep link do Booking.com
checkin_date    date NOT NULL
checkout_date   date NOT NULL
is_selected     boolean DEFAULT false                -- hospedagem escolhida pelo usuário
is_reserved     boolean DEFAULT false                -- usuário marcou manualmente como "reservado"
reference_lat   numeric(10,7)                        -- lat do ponto de referência usado na busca
reference_lng   numeric(10,7)                        -- lng do ponto de referência usado na busca
reference_label text                                 -- ex: "centro de Pindamonhangaba" ou endereço específico
distance_m      integer                              -- distância em metros do ponto de referência
```

Notas sobre `reference_lat/lng`:
- Se o usuário informar apenas o município, o sistema usa as coordenadas do centro da cidade (via Google Geocoding API) como ponto de referência.
- Se o usuário informar um endereço específico, usa as coordenadas desse endereço.
- A busca é feita com Google Places API `type=lodging` em raio de 10 km do ponto de referência.
- Resultados são ordenados por `distance_m` por padrão, com opções de ordenar por rating ou preço.

RLS padrão aplicado (usuário acessa apenas próprios dados).

### `favorites` — paradas favoritas do usuário
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE
place_id    text NOT NULL                        -- Google Places ID
name        text NOT NULL
place_type  text NOT NULL                        -- fuel | food | cafe | lodging | attraction | other
address     text
latitude    numeric(10,7) NOT NULL
longitude   numeric(10,7) NOT NULL
rating      numeric(2,1)                         -- snapshot da avaliação no momento do salvamento
custom_tags text[]                               -- ex: ['Café especial', 'Vista serrana', 'Estacionamento moto']
created_at  timestamptz DEFAULT now()
UNIQUE(user_id, place_id)                        -- cada lugar salvo uma vez por usuário
```

Notas:
- `place_id` é o Google Places ID — permite buscar dados atualizados (avaliação, horário) a qualquer momento via Places API.
- `rating` é um snapshot salvo no momento em que o usuário favoritou — exibido offline sem precisar de nova chamada.
- `custom_tags` são rótulos criados livremente pelo usuário para organizar os favoritos.
- O botão "Adicionar a roteiro" na tela de favoritas usa `latitude`/`longitude` para inserir o lugar como waypoint em uma viagem existente.
- RLS padrão: usuário acessa apenas os próprios favoritos.


### `user_preferences` — configurações padrão do usuário
```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id                 uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE
default_departure_time  time DEFAULT '07:00'             -- horário de saída padrão para novos roteiros
default_min_stop_km     integer DEFAULT 100              -- trecho mínimo padrão entre paradas (aplicado em novas viagens)
default_max_stop_km     integer DEFAULT 200              -- trecho máximo padrão entre paradas (aplicado em novas viagens)
default_autonomy_km     integer DEFAULT 300              -- autonomia padrão quando nenhuma moto estiver cadastrada
fuel_alert_km           integer DEFAULT 80               -- alertar quando posto mais próximo estiver a menos de X km
prefer_scenic_routes    boolean DEFAULT false            -- preferir estradas cênicas / evitar rodovias
avoid_tolls             boolean DEFAULT false            -- evitar pedágios
prefer_dirt_roads       boolean DEFAULT false            -- preferir estradas de terra
rain_alert_threshold    integer DEFAULT 40               -- alertar quando chance de chuva > X%
wind_alert_kmh          integer DEFAULT 50               -- alertar quando vento > X km/h
stop_type_defaults      text[] DEFAULT ARRAY['fuel','food']  -- tipos de parada incluídos por padrão
dark_mode               boolean DEFAULT false
language                text DEFAULT 'pt-BR'
notifications_enabled   boolean DEFAULT true
created_at              timestamptz DEFAULT now()
updated_at              timestamptz DEFAULT now()
```

Notas:
- Relação 1-para-1 com o usuário — UNIQUE em user_id.
- Criado automaticamente com valores padrão na primeira autenticação do usuário.
- `stop_type_defaults` aceita: 'fuel', 'food', 'cafe', 'parking', 'lodging'.
- Os campos `default_departure_time`, `default_min_stop_km`, `default_max_stop_km` e `stop_type_defaults` são aplicados como valores iniciais na criação de uma nova viagem — o usuário pode sobrescrever por viagem.
- Não existe um conceito de "distância máxima por dia" no sistema: a extensão de cada dia é determinada pela origem/destino que o usuário informa, e o app só se preocupa em respeitar `min_stop_km`/`max_stop_km` ao distribuir as paradas dentro do trajeto resultante.
- `default_autonomy_km` é usado quando nenhuma moto está cadastrada. Quando há moto ativa, a autonomia real (`fuel_economy_km_l × tank_liters`) substitui este valor para fins de alerta.
- `fuel_alert_km` cruza com `motorcycles.fuel_economy_km_l × tank_liters` para o alerta de autonomia.
- RLS padrão: usuário acessa apenas as próprias preferências.


### `motorcycles` — moto cadastrada pelo usuário
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE
make                text NOT NULL                        -- ex: "Honda"
model               text NOT NULL                        -- ex: "CB 500F"
year                integer NOT NULL
color               text
has_abs             boolean DEFAULT false
odometer_km         integer DEFAULT 0                    -- km total rodado (atualizado manualmente)
fuel_economy_km_l   numeric(4,1) NOT NULL                -- consumo real do usuário (ex: 22.0)
tank_liters         numeric(4,1) NOT NULL                -- capacidade do tanque em litros
displacement_cc     integer                              -- cilindrada (ex: 471)
power_hp            integer                              -- potência em cv (ex: 47)
weight_kg           integer                              -- peso em kg (ex: 192)
equipment           text[]                               -- ex: ['Baú lateral', 'GPS integrado', 'Protetor de motor']
next_revision_km    integer                              -- km da próxima revisão
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

Notas:
- Um usuário pode ter múltiplas motos cadastradas, mas apenas uma ativa por vez (campo `is_active boolean DEFAULT true` — ao ativar uma, desativar as demais).
- `fuel_economy_km_l` e `tank_liters` são os campos críticos para o app: usados para calcular `autonomia_estimada = fuel_economy_km_l × tank_liters` e para alimentar o alerta de combustível.
- `odometer_km` é atualizado manualmente pelo usuário — não há integração com odômetro real.
- RLS padrão: usuário acessa apenas as próprias motos.

Campo adicional em `motorcycles`:
```sql
is_active   boolean DEFAULT true   -- moto em uso atualmente; só uma ativa por usuário
```


---

### `stop_ratings` — avaliação individual por usuário × parada × viagem
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id         uuid REFERENCES trips(id) ON DELETE CASCADE
user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE
place_id        text NOT NULL                        -- Google Places ID da parada
place_name      text NOT NULL                        -- snapshot do nome
stop_type       text NOT NULL                        -- fuel | food | lodging | attraction | other
stars           integer NOT NULL CHECK (stars BETWEEN 1 AND 5)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
UNIQUE(trip_id, user_id, place_id)                  -- 1 avaliação por (usuário, parada, viagem)
```

Notas:
- O triplo `(trip_id, user_id, place_id)` garante avaliações independentes: mesmo posto em viagens diferentes = avaliações separadas.
- A avaliação não é edição de roteiro.

### `stop_comments` — comentários por usuário × parada × viagem
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
trip_id     uuid REFERENCES trips(id) ON DELETE CASCADE
user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE
place_id    text NOT NULL                            -- Google Places ID
place_name  text NOT NULL                            -- snapshot do nome
body        text NOT NULL
created_at  timestamptz DEFAULT now()
updated_at  timestamptz DEFAULT now()
```

Notas:
- Múltiplos comentários permitidos por usuário (sem UNIQUE — ao contrário da avaliação).
- Usuário pode editar ou apagar os próprios comentários.

## Compartilhamento de roteiro (cópia independente)

Quando o owner compartilha o roteiro com alguém que **não viajará junto** (compartilhamento de template):

- O sistema cria uma **nova viagem** no banco com os mesmos waypoints e estrutura, mas:
  - `user_id` = usuário destinatário (ele é o owner da cópia)
  - `status = 'planned'`
  - `source_trip_id` (campo adicional em `trips`) referencia a viagem original para rastreabilidade
- Os parâmetros do destinatário (consumo da moto, km/dia, preferências) são aplicados no recálculo dos segmentos
- A cópia é completamente independente — alterações não afetam a viagem original
- O sistema exibe notificação para o destinatário: *"Você recebeu este roteiro de [nome]. Pode não ser idêntico ao original — aplicamos seus parâmetros de viagem."*

Campo adicional em `trips`:
```sql
source_trip_id      uuid REFERENCES trips(id) ON DELETE SET NULL   -- null se viagem original
rating              integer CHECK (rating BETWEEN 1 AND 5)           -- avaliação geral da viagem (1-5), preenchida pelo usuário ao concluir
rating_note         text                                             -- texto livre opcional junto à avaliação (ex: "Ótima! Estrada excelente.")
total_distance_km   numeric(7,1)                                     -- cache: SUM(segments.distance_km) — atualizado ao salvar/concluir o roteiro
total_duration_min  integer                                          -- cache: SUM(segments.duration_minutes) — atualizado ao salvar/concluir o roteiro
stop_count          integer DEFAULT 0                                -- cache: número de paradas selecionadas — atualizado ao alterar o roteiro
```

---

## Índices de performance

Todos os índices abaixo devem ser criados nas migrations. Usam B-tree por padrão (omitir `USING` é suficiente).

```sql
-- Listagem de viagens do usuário (home, salvos, realizadas)
CREATE INDEX idx_trips_user_status ON trips(user_id, status);

-- Roteiro: trechos de uma viagem em ordem
CREATE INDEX idx_segments_trip_day ON segments(trip_id, day_index, order_index);

-- Paradas sugeridas por trecho (roteiro e alternativas)
CREATE INDEX idx_stops_segment_selected ON stop_suggestions(segment_id, is_selected);

-- Hospedagem por viagem e dia
CREATE INDEX idx_lodging_trip_day ON lodging_suggestions(trip_id, day_index);

-- Avaliações por parada
CREATE INDEX idx_ratings_trip_place ON stop_ratings(trip_id, place_id);

-- Favoritas por usuário
CREATE INDEX idx_favorites_user ON favorites(user_id, place_type);

-- Motos ativas do usuário
CREATE INDEX idx_motorcycles_user_active ON motorcycles(user_id, is_active);
```

---

## Estratégia de cache por camada

### Camada 1 — Campos computados em `trips` (banco)

Campos cujo recálculo exigiria JOINs a cada listagem. São atualizados por triggers ou pela camada de serviço nos momentos indicados:

| Campo | Onde | Quando atualizar |
|-------|------|-----------------|
| `total_distance_km` | `trips` | Ao salvar/alterar segmentos; ao concluir a viagem |
| `total_duration_min` | `trips` | Ao salvar/alterar segmentos; ao concluir a viagem |
| `stop_count` | `trips` | Ao adicionar, remover ou trocar uma parada selecionada |
| `has_weather_alert` | `trips` | Ao atualizar clima de qualquer segmento; recalculado com `user_preferences.rain_alert_threshold` do usuário |

### Camada 2 — Cache de APIs externas (banco)

As tabelas `segments`, `stop_suggestions` e `lodging_suggestions` funcionam como cache persistente das APIs externas. Nenhuma chamada de API é feita durante a listagem de viagens.

| API | Onde persiste | TTL | Quando re-consultar |
|-----|---------------|-----|---------------------|
| Directions API | `segments` (distance_km, duration_minutes, route_summary) | Indeterminado | Somente quando o roteiro for alterado (parada adicionada/removida) |
| WeatherAPI | `segments` (weather_*, weather_updated_at) | 6 horas | Botão "Atualizar" manual; automático no day-of-trip |
| Places API — paradas | `stop_suggestions` | Indeterminado | Não atualiza — é um snapshot no momento do planejamento |
| Places API — hospedagem | `lodging_suggestions` | Indeterminado | Não atualiza — é um snapshot no momento da busca |
| Geocoding API — ref. hospedagem | `lodging_suggestions` (reference_lat/lng) | Permanente | Não atualiza |

**Regra do clima:** `weather_updated_at` controla o TTL. Se `now() - weather_updated_at > 6h`, o badge "Desatualizado" aparece na UI. O botão "Atualizar" força re-consulta independente do TTL.

### Camada 3 — Cache client-side mobile (AsyncStorage)

Dados persistidos no dispositivo para garantir funcionamento offline durante a viagem.

| Chave | Conteúdo | Invalidar quando |
|-------|----------|-----------------|
| `active_trip` | Roteiro completo da viagem ativa (segmentos + paradas + hospedagem) | Viagem concluída ou check-in em nova parada |
| `user_preferences` | Cópia local das preferências do usuário | Usuário salva alteração na tela de Preferências |
| `active_motorcycle` | Dados da moto ativa (tank_liters, fuel_economy_km_l) | Usuário troca a moto ativa |

- Formato: JSON, serializado via `AsyncStorage.setItem` / `getItem`
- Sincronização: ao abrir o app com conexão, compara `trips.updated_at` com o timestamp do cache local — se o banco for mais recente, substitui
- Offline total: app funciona sem internet usando o cache; mostra banner "Você está offline — dados podem estar desatualizados"

### Camada 4 — Cache client-side web (localStorage)

| Chave | Conteúdo | Invalidar quando |
|-------|----------|-----------------|
| `user_preferences` | Cópia das preferências (dark_mode, language, stop_type_defaults) | Usuário salva alteração |
| `last_viewed_trip` | ID + título da última viagem visualizada | A cada navegação para uma viagem |
| `roteiro_scroll:{trip_id}` | Posição de scroll no roteiro | A cada sessão nova |
| `roteiro_view_mode:{trip_id}` | 'list' ou 'map' | Quando usuário troca o toggle |

- localStorage é síncrono e disponível imediatamente — usar apenas para dados leves (< 50KB)
- Não armazenar roteiros completos no localStorage — risco de bloqueio da thread principal
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                