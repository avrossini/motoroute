# MotoRoute App — Banco de Dados

> **Versão didática.** Explica cada tabela em linguagem simples. A **fonte técnica
> completa** (DDL, constraints, RLS, índices, campos de cache) é
> [`../docs/database.md`](../docs/database.md) — consulte-a antes de escrever
> migrations ou tipos.

## Tecnologia: Supabase

O MotoRoute usa **Supabase** como banco de dados. O Supabase é um serviço cloud que oferece:
- Banco de dados PostgreSQL (relacional, como MySQL ou SQL Server)
- Autenticação de usuários (login, sessão, magic link)
- API REST automática para acessar as tabelas

O banco de dados é **compartilhado** entre o app e o painel admin — ambos leem e escrevem nas mesmas tabelas.

---

## Tabelas principais

### `auth.users` (gerenciada pelo Supabase)
Armazena as contas de usuário: e-mail, data de criação, último login. Não é criada por nós — o Supabase cuida disso automaticamente quando alguém se cadastra.

---

### `user_preferences`
Preferências e perfil do usuário.

| Campo | O que armazena |
|---|---|
| `user_id` | ID do usuário (referência à `auth.users`) |
| `road_type` | Tipo de estrada preferida (asfalto, misto, terra) |
| `travel_pace` | Ritmo de viagem (rápido, moderado, tranquilo) |
| `daily_km_limit` | Limite de km por dia |

---

### `motorcycles`
Motos cadastradas pelo usuário.

| Campo | O que armazena |
|---|---|
| `user_id` | Dono da moto |
| `brand` | Marca (Honda, Yamaha, etc.) |
| `model` | Modelo (CB 500, Lander, etc.) |
| `year` | Ano |
| `engine_cc` | Cilindrada |

---

### `trips`
Viagens criadas pelos usuários.

| Campo | O que armazena |
|---|---|
| `user_id` | Quem criou a viagem |
| `title` | Nome da viagem |
| `origin` | Cidade de origem |
| `destination` | Cidade de destino |
| `status` | planejada / em_andamento / pausada / concluida / cancelada |
| `start_date` | Data de início planejada |

---

### `segments`
Trechos de uma viagem (roteiro dia a dia).

| Campo | O que armazena |
|---|---|
| `trip_id` | Qual viagem pertence |
| `day` | Número do dia (1, 2, 3...) |
| `origin` | Início do trecho |
| `destination` | Fim do trecho |
| `distance_km` | Distância estimada |
| `weather` | JSON com previsão do tempo |

---

### `checkins`
Registros de check-in feitos durante a viagem.

| Campo | O que armazena |
|---|---|
| `trip_id` | Qual viagem |
| `user_id` | Quem fez o check-in |
| `location` | Coordenadas GPS |
| `note` | Anotação livre do usuário |
| `created_at` | Quando foi feito |

---

### `waitlist`
Leads do hotsite (pessoas que se cadastraram para receber convite).

| Campo | O que armazena |
|---|---|
| `name` | Nome |
| `email` | E-mail |
| `phone` | WhatsApp |
| `city` | Cidade |
| `status` | novo / contatado / convidado / convertido / descartado |
| `source` | De onde veio o lead (hotsite, instagram, etc.) |
| `linked_user_id` | Se virou usuário, qual o ID da conta criada |

---

### `api_usage_logs`
Registro de todas as chamadas às APIs externas (Google, WeatherAPI).

| Campo | O que armazena |
|---|---|
| `user_id` | Quem disparou a chamada |
| `provider` | google / weatherapi |
| `api_type` | directions / geocoding / places / weather |
| `request_status` | success / error |
| `duration_ms` | Tempo de resposta em milissegundos |
| `estimated_cost_cents` | Custo estimado em centavos de dólar |

---

### `error_logs`
Registro de erros técnicos nas APIs do app.

| Campo | O que armazena |
|---|---|
| `endpoint` | Qual rota causou o erro (directions, geocode, etc.) |
| `error_code` | Tipo do erro (FetchError, NetworkError, etc.) |
| `stack_summary` | Primeiras 500 letras do stack trace |
| `user_id` | Usuário afetado (se identificado) |

---

### `user_feedback`
Feedbacks enviados pelos usuários pelo app.

| Campo | O que armazena |
|---|---|
| `feedback_type` | bug / sugestao / duvida / elogio / dor_planejamento |
| `body` | Texto do feedback |
| `severity` | critica / alta / media / baixa |
| `status` | novo / triado / em_analise / planejado / resolvido / descartado |
| `tags` | Array de tags adicionadas pela equipe na triagem |

---

## Tabelas de paradas, hospedagem e favoritos

### `stop_suggestions`
Postos, restaurantes e pontos sugeridos para cada trecho (vêm do Google Places).

| Campo | O que armazena |
|---|---|
| `segment_id` | A qual trecho pertence |
| `place_id` | ID do lugar no Google Places |
| `name` | Nome do local |
| `rating` | Avaliação (ex.: 4.3) |
| `is_24h` | Se funciona 24 horas |
| `latitude` / `longitude` | Coordenadas |
| `is_selected` | Se foi o escolhido para o trecho |

---

### `lodging_suggestions`
Hospedagem planejada para cada dia com pernoite. Pode vir da busca automática (Google Places) ou ser inserida manualmente pelo usuário.

| Campo | O que armazena |
|---|---|
| `trip_id` / `day_index` | Viagem e qual dia da viagem |
| `source` | `auto` (Google) ou `manual` (inserção do usuário) |
| `name` / `address` / `city` | Dados do local |
| `rating` / `price_level` | Avaliação e faixa de preço ($ a $$$$) |
| `lodging_type` | hotel / pousada / chalé / casa-apto / outro |
| `checkin_date` / `checkout_date` | Datas da estadia |
| `is_selected` / `is_reserved` | Escolhida para o dia / marcada como reservada |
| `parking_requirement` / `breakfast_requirement` | Preferências da busca (estacionamento, café) |
| `reference_label` / `distance_m` | Ponto de referência e distância até ele |

> A confiabilidade dos atributos (estacionamento, café) é registrada como `confirmed` / `inferred` / `unknown` — ver `docs/database.md`.

---

### `favorites`
Lugares que o usuário salvou como favoritos para reutilizar em viagens.

| Campo | O que armazena |
|---|---|
| `user_id` | Dono do favorito |
| `place_id` | ID do lugar no Google Places |
| `name` / `address` | Dados do local |
| `place_type` | fuel / food / cafe / lodging / attraction / other |
| `latitude` / `longitude` | Coordenadas (usadas para inserir no roteiro) |
| `rating` | Avaliação salva no momento em que favoritou |
| `custom_tags` | Rótulos livres do usuário (ex.: "Café especial", "Vista serrana") |

---

### `stop_ratings`
Avaliação (1 a 5 estrelas) que o usuário dá a uma parada **dentro de uma viagem**.

| Campo | O que armazena |
|---|---|
| `trip_id` / `user_id` / `place_id` | Viagem, quem avaliou e qual parada |
| `place_name` / `stop_type` | Nome e tipo da parada |
| `stars` | Nota de 1 a 5 |

> Uma avaliação por (usuário × parada × viagem) — o mesmo posto em viagens diferentes tem avaliações separadas.

---

### `stop_comments`
Comentários em texto livre sobre uma parada, também por viagem.

| Campo | O que armazena |
|---|---|
| `trip_id` / `user_id` / `place_id` | Viagem, quem comentou e qual parada |
| `place_name` | Nome da parada |
| `body` | Texto do comentário |

> Ao contrário da avaliação, o usuário pode ter **vários** comentários na mesma parada e editá-los/apagá-los.

---

## Como as migrations funcionam?

Toda alteração no banco (criar tabela, adicionar coluna, etc.) é feita via arquivo de **migration** na pasta `supabase/migrations/`. Cada arquivo tem um número de versão no nome e é executado em ordem.

Isso garante que qualquer desenvolvedor possa recriar o banco exatamente igual executando as migrations na sequência.

> Nunca altere o banco direto pelo painel do Supabase sem criar uma migration correspondente — a alteração seria perdida na próxima vez que alguém recriar o ambiente.
