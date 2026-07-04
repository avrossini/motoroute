# Motor de Cálculo de Rotas — o "cérebro" da aplicação

> **Status (2026-07-04):** primitivo `dividirEmTrechos` e **Rolê (`day_trip`)
> IMPLEMENTADOS e EM PRODUÇÃO** (PRs #4 e #6). A **Expedição (`multi_day`) ainda NÃO foi
> implementada** — o `multi_day` continua no motor antigo (`generate-segments`); falta a
> "caixa" de divisão em dias (§6). O cutover foi **incremental por tipo** (day_trip
> primeiro), **não** atômico (§10).
>
> Este documento é a **fonte da verdade da arquitetura de cálculo de rotas**. O
> `business-logic.md` define o *comportamento de negócio* que o motor deve respeitar;
> este define *como* o motor o implementa. Substitui a estratégia legada de
> `business-logic.md → ### Estratégia de cálculo por comprimento de rota` para o
> `day_trip`; para o `multi_day`, a estratégia antiga ainda vige até a Expedição.

---

## 1. Por que este motor existe (o problema que ele resolve)

O motor atual (`app/api/generate-segments+api.ts`) trabalha em **duas camadas
desconexas**:

1. **Corte geométrico** — divide a rota a cada `~(min+max)/2` km, cego. O ponto de
   parada é o step-endpoint do Google mais próximo do corte. É um ponto **teórico**:
   não há garantia de que exista qualquer coisa ali.
2. **Busca de posto** — depois, procura postos de combustível em volta do ponto
   teórico (Places, regra de 3 níveis) e **exibe** o melhor como o card do trecho.

O defeito de fundo: **o ponto de parada tem duas identidades divergentes.** O posto é
a "cara" da parada (o que o usuário vê), mas o roteiro continua ancorado no ponto
teórico:

| O que | Ancora no ponto... |
|---|---|
| Card ⛽ exibido | posto (camada 2) |
| Quilometragem do trecho | teórico (camada 1) |
| Botão "Navegar" | teórico (camada 1) |
| Nome no cabeçalho "A → B" | teórico (reverse-geocode) |

As duas nunca são reconciliadas na geração automática (só na troca manual de posto,
via `selectAlternative`). Resultado: o roteiro mistura uma **parada ideal teórica que
não vai acontecer** com um km que também é teórico — o que atrapalha o planejamento
real da viagem.

**O redesenho elimina a divergência por construção:** o ponto de parada nasce sendo um
posto real.

---

## 2. Arquitetura em 3 camadas

O cálculo é um **primitivo + dois compositores**. Não há lógica duplicada: a Expedição
reusa o Motor do Rolê, que reusa o primitivo.

```
┌──────────────────────────────────────────────────────────────┐
│  PRIMITIVO · dividirEmTrechos(origem, destino, min, max)      │
│  corta um ponto A→B em trechos; cada parada JÁ É um posto real │
└──────────────────────────────────────────────────────────────┘
        ▲ usa 1×                              ▲ usa N× (1 por dia)
        │                                     │
┌───────────────────┐          ┌───────────────────────────────────┐
│  MOTOR DO ROLÊ    │          │  MOTOR DA EXPEDIÇÃO               │
│  (day_trip)       │          │  (multi_day)                     │
│  só ida  → 1×     │          │  1. divide em dias (cidades de    │
│  ida+volta → 2×   │          │     pernoite) — «caixa» a definir │
│  (recalc indep.)  │          │  2. p/ cada dia: chama o Rolê     │
└───────────────────┘          └───────────────────────────────────┘
```

Consequência importante: como a Expedição **divide em dias primeiro**, cada "perna de
dia" é ≤ ~1 dia de moto (≤ 650 km) — pequena o bastante para o primitivo **nunca**
bater no limite de 24 waypoints do Google. A ramificação "viagem longa" do motor atual
deixa de ser necessária.

---

## 3. O primitivo — `dividirEmTrechos`

### 3.1 Contrato

**Entrada:**
- `origem`, `destino` — ponto + nome. Os nomes são **preservados exatamente**
  (`business-logic.md → ### Preservação de origem e destino`).
- `minKm`, `maxKm` — a faixa válida entre paradas.
- `favoritos` — `place_id`s favoritados pelo usuário (para desempate).

**Saída:** lista de trechos, cada um com:
- origem/destino (ponto + nome),
- `distance_km` e `duration_minutes` **reais** (medidos até o posto),
- o **posto** que É o ponto final (`place_id`, nome, rating, `is_24h`…),
- alertas (`trecho_longo`, `trecho_curto`, `sem_posto_na_faixa`…).

Origem e destino ficam intocados; apenas as paradas **intermediárias** são postos.

### 3.2 Princípio central — buscar-primeiro

Em vez de **cortar** teórico e **torcer** para haver posto, o primitivo **decide onde
parar escolhendo entre os postos reais dentro da faixa válida.** O ponto de parada
nunca é teórico. Km, nome, navegação e sugestão passam a ser **o mesmo lugar real**.

### 3.3 Algoritmo (greedy para frente)

```
atual = origem
enquanto  dist_rodoviária(atual → destino) > maxKm:
    candidatos = postos na faixa [minKm, maxKm] à frente de `atual`
    se candidatos:
        escolhido = melhor(candidatos)                 # ver 3.4
    senão:                                             # sem posto na faixa — ver 3.5
        escolhido = melhor posto ANTES do mínimo       # alerta trecho_curto
        se nada:  escolhido = 1º posto ALÉM do máximo  # alerta trecho_longo
    grava trecho(atual → escolhido)
    atual = escolhido
grava trecho final(atual → destino)                    # isento do mínimo
```

### 3.4 Critério de escolha do posto

Dentro da faixa `[minKm, maxKm]`, **a qualidade do posto puxa a escolha; o alvo
`(min+max)/2` é só desempate.** O objetivo não é o km exato — é o bom posto próximo do
ideal.

Ordem de prioridade:
1. **Favorito** do usuário (tabela `favorites`);
2. **Maior rating** (com piso de qualidade, ex. ≥ 4.0);
3. **Proximidade do alvo** (o meio da faixa) — desempate final.

Espelha a regra de 3 níveis de `business-logic.md → ## Sugestão de pontos de parada
(§168)`, mas agora ela decide **o ponto**, não apenas o que é exibido.

### 3.5 Caso "sem posto na faixa" (região vazia) — cascata

Prioridade: **segurança — nunca estourar o máximo silenciosamente.**

1. **Recuar:** parar num posto real **antes do mínimo** → trecho mais curto que o
   configurado, com alerta `trecho_curto`. É a 1ª tentativa (mais conservador: mais
   margem de combustível).
2. **Estender:** só se não houver posto algum antes do mínimo, seguir a rota **além do
   máximo** até o 1º posto real, com alerta `trecho_longo`. Último recurso.

Nunca inventar um ponto "a confirmar": toda parada intermediária é um posto real.

### 3.6 Trecho final

O último trecho (chegada ao destino) é **isento do mínimo**
(`business-logic.md §165`) — você chega onde precisa chegar. Se ele ultrapassar o
máximo, gerar alerta `trecho_longo` (informativo, não bloqueia).

### 3.7 Look-ahead (fora do v1)

No v1 o algoritmo é **greedy simples**: avança pela faixa sem otimizar o trecho final.
Em rotas onde a escolha do 1º posto afeta se o trecho final cabe (ex.: 440 km com faixa
[180,220]), o v1 pode gerar um alerta no trecho final em vez de rebalancear. O
**look-ahead** que ajusta a escolha para garantir um final viável fica como refino v2.

---

### 3.8 Nome exibido do trecho = cidade do posto

O endpoint intermediário de cada trecho **é** um posto, mas o **nome exibido do trecho**
é a **cidade** onde o posto fica (reverse-geocode → `locality`/município), **não** o nome
do estabelecimento — o nome do posto já aparece no card ⛽ da parada. Repetir o nome do
posto no cabeçalho é redundante e menos útil para o viajante, que quer saber **em qual
cidade** vai parar (ex.: "Poços de Caldas → Bueno Brandão", não "→ Auto Posto Retiro Ltda").

- O núcleo puro nomeia o endpoint com o nome do posto (não faz I/O de geocoding).
- O **enriquecimento para cidade é feito na API** (`app/api/role+api.ts` → `cidadeDoPonto`):
  reverse-geocode de cada posto escolhido, reescrevendo `trecho.destino.nome` (e o `origem`
  do trecho seguinte) com a cidade. Origem e destino informados pelo usuário são preservados.
- **Regra registrada aqui porque já regrediu antes** — o nome do trecho nunca deve ser o
  nome do posto.

## 4. Detalhe técnico — buscar na "janela ao longo da rota"

Esta é a parte que faz ou quebra o desenho.

1. **1 chamada Directions** `origem → destino` → geometria + km acumulado por step.
2. Para achar candidatos à frente de `atual`: amostrar o ponto da rota no **alvo**
   `(min+max)/2` e buscar Places `type=gas_station` com raio ≈ `(max−min)/2 + margem`.
3. Para cada candidato, medir a **distância rodoviária real** `atual → candidato` e
   manter só os que caem em `[minKm, maxKm]`.
4. Pontuar (3.4), escolher. O posto **é** o endpoint do trecho.
5. Ao final, **1 chamada Directions** passando por todos os postos escolhidos → legs
   reais (km/duração). Mesmo padrão de 2 chamadas do motor atual — mas agora os
   waypoints são postos reais, não cortes cegos.

**Maior risco técnico:** mapear o posto (que fica um pouco fora da linha da rota) para
"quantos km rodados até ele". **Mitigação:** usar a distância rodoviária real do
Directions como filtro da faixa — nunca a distância em linha reta.

**Custo:** comparável ao de hoje (1 busca Places por parada + Directions final). É o
mesmo esforço, gasto no lugar certo.

---

## 5. Motor do Rolê (`day_trip`)

- **Só ida:** `dividirEmTrechos(origem, destino)` → trechos, tudo em 1 dia. Sem cidade
  de pernoite, sem hospedagem.
- **Ida e volta:** roda o primitivo **2×** — ida `O→D` e volta `D→O` **recalculada de
  forma independente** (pode dar estradas diferentes; via de mão única, rota
  assimétrica). Os trechos da volta continuam a sequência.

Não há conceito de dia nem de pernoite. `day_index = 1` em **todos** os trechos —
inclusive a volta, que é o **mesmo dia** da ida (data, horário e clima não somam +1 na
volta). A separação visual **IDA/VOLTA** é feita no render por *grupos* (corte no destino
da viagem), não pelo `day_index`.

**Estado da implementação (em produção):** `src/domain/route/calcularRole.ts` +
`app/api/role+api.ts` (API fina) + serviço `roleService`. `calcularRota` (day_trip) chama
o motor novo e grava o posto escolhido como `stop_suggestion` selecionado + alternativas.
Sub-opção ida/volta persistida em `trips.round_trip`. Nome do trecho = **cidade** do posto
(§3.8). O `multi_day` NÃO usa isto ainda.

---

## 6. Motor da Expedição (`multi_day`)

> 🚧 **NÃO IMPLEMENTADA (2026-07-04).** O `multi_day` ainda usa o motor antigo
> `generate-segments`. Falta a **"caixa" de divisão em dias** abaixo — que o usuário vai
> detalhar. A arquitetura já está pronta para recebê-la como passo plugável, reusando o
> Motor do Rolê por dia, sem mexer no que está em produção.

Dois passos:

1. **Dividir em dias** — decide as cidades de pernoite que fecham cada dia, produzindo
   as "pernas de dia" `[O→C1, C1→C2, …, Cn→D]`. Aqui moram a **meta de km/dia**
   (`business-logic.md → ### Distância diária recomendada`) e a **escolha da cidade**
   (`### Destino final de cada dia deve ser uma cidade`).
   > ⚠️ **A definir.** O algoritmo interno desta "caixa" ainda será detalhado. Ela é
   > **plugável**: tem contrato claro (`origem, destino, nº de dias, min/max` →
   > lista de pernas de dia) e não afeta o resto da arquitetura.
2. **Roteiro interno do dia** — para cada perna de dia, chamar o **Motor do Rolê (só
   ida)**. O último trecho do dia termina na cidade `Cx`, que vira o ponto de
   pernoite/hospedagem (`is_last_of_day = true`).

Regras a honrar na divisão: paradas obrigatórias do usuário têm precedência; dias
parados (sem deslocamento) mantêm a cidade do dia anterior.

### Duas validações independentes

Conforme `business-logic.md → ### Diferença entre trecho válido e dia viável (§106)`:
- **km por trecho (100–200):** vive no **primitivo**.
- **km por dia (tranquilo/normal/puxado/extremo):** vive no **compositor da
  Expedição**.

Um roteiro pode ter todos os trechos válidos e ainda assim um dia inviável por acúmulo
— cada camada valida no seu nível.

---

## 7. Modelo de dados (como ficou implementado)

- O endpoint do segmento (`segments.dest_lat/dest_lng`) é o **posto escolhido**;
  `destination_name` é a **cidade** do posto (§3.8). **Não** foi adicionada coluna
  `place_id` em `segments` — o posto (nome/`place_id`/rating) vive em `stop_suggestions`
  com `is_selected=true`, junto das alternativas (`business-logic.md → §472`). Trocar a
  alternativa sincroniza o endpoint (`selectAlternative`).
- **`trips.round_trip`** (`boolean`, migration `20260704000001`) — sub-opção ida/volta do
  Rolê.
- Segmentos continuam planos com `day_index` / `is_last_of_day`. **Rolê = `day_index` 1
  em tudo** (ida e volta no mesmo dia; split IDA/VOLTA é no render). Expedição usaria
  1..N. Sem entidade "dia" separada.

---

## 8. Arquitetura de código

- **Núcleo puro** em `src/domain/` — recebe *portas* injetadas (`getRoute`,
  `searchStops`) e devolve os trechos. **Zero `fetch` dentro** → testável com fixtures,
  sem subir servidor nem bater no Google.
- **API fina** (`app/api/…`) só pluga os adaptadores reais de Google/Places e chama o
  núcleo.

---

## 9. Verificação ("bem feito")

- **Rotas-ouro:** SP→Brusque (rota real de referência do projeto) + uma de sertão com
  posto esparso (exercita a cascata "sem posto") + uma curta (1 trecho).
- **Invariantes automatizadas:**
  - todo trecho ∈ `[minKm, maxKm]`, exceto o final (isento do min) e casos de alerta;
  - todo endpoint intermediário tem `place_id` real (nunca ponto teórico);
  - a soma dos km bate com o Directions final;
  - origem e destino preservados exatamente.
- **Teste manual fim a fim** no app rodando (Docker), conferindo no card que **km, nome,
  "Navegar" e posto apontam para o mesmo ponto**.

---

## 10. Estratégia de substituição — cutover incremental (como foi feito)

O plano original era **cutover atômico** (um PR troca tudo). Na prática foi **incremental
por tipo**, porque o Rolê ficou pronto antes e há valor em entregá-lo já:

1. **PR #4** — primitivo puro + adapters + testes (dormente, sem tocar no app).
2. **PR #6** — o `day_trip` passa a usar o motor novo (`/api/role`); `generate-segments`
   **continua servindo o `multi_day`**.
3. **Pendente** — a Expedição (§6). Só quando ela migrar é que o `generate-segments` pode
   ser removido.

**Consequência aceita:** velho e novo **coexistem** enquanto a Expedição não é feita. O
`insert-stop` (subdivisão via `generateSegments`) e o `multi_day` ainda usam o motor antigo.

Fluxo de entrega (fim a fim): dev → build de produção local → PR → deploy → verificação.

---

## 11. Fora de escopo / pendências

- **Expedição (`multi_day`)** — a "caixa" de divisão em dias (§6). **Principal pendência.**
- **Look-ahead** do primitivo (§3.7) — refino v2.
- **Mapa nativo** — o mini-mapa das alternativas e o TripMap são web-only (native é stub).
- Limpeza dos erros de tipo `null` pré-existentes do app (revelados pela correção do
  `database.ts`), fora do escopo do motor.

---

## 12. Histórico de decisões

**2026-07-04 — design do redesenho:**

| Decisão | Escolha |
|---|---|
| Volta do Rolê (ida e volta) | Recalcular independente (pode diferir da ida) |
| Alvo dentro da faixa | Qualidade do posto puxa; meio só desempata |
| Desempate entre postos | Favorito → rating → proximidade |
| Sem posto na faixa | Recuar (antes do mín) primeiro; estender (além do máx) por último |
| Look-ahead | Greedy simples no v1; refina depois |
| Arquitetura de código | Núcleo puro testável + API fina |
| Verificação | Rotas-ouro automatizadas + teste manual no app |
| Escolha da cidade de pernoite (Expedição) | **A detalhar** |

**2026-07-04 — decisões da implementação (Rolê, em produção):**

| Decisão | Escolha |
|---|---|
| Substituição do motor | **Incremental por tipo** (não atômico): day_trip migrou (PR #6); multi_day segue no antigo |
| Nome do trecho | **Cidade** do posto (reverse-geocode), não o nome do posto (§3.8) |
| Rolê ida e volta | **Mesmo dia** (`day_index` 1); split IDA/VOLTA no render por grupos |
| Alternativas de parada | Posto escolhido (selecionado) + vizinhos (não-selecionados); mini-mapa web com pinpoints numerados |
| Preferências na criação | `nova.tsx` puxa `default_min/max_stop_km` de `user_preferences` |
| `place_id` no segmento | **Não** criado — posto fica em `stop_suggestions`, endpoint = coords do posto |
