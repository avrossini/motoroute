# Regras de Negócio — MotoRoute

Derivadas do planejamento real da viagem SP → Brusque (junho/2026).
Cada regra aqui resolveu um problema real encontrado no processo manual.
Todas as regras se aplicam igualmente à versão mobile e à versão web.

## Regra de ouro das paradas
- Distância **mínima** entre paradas: configurável por usuário em `user_preferences.default_min_stop_km` (padrão: **100 km**)
- Distância **máxima** entre paradas: configurável por usuário em `user_preferences.default_max_stop_km` (padrão: **200 km**)
- Ao criar uma nova viagem, os valores de `trips.min_stop_km` e `trips.max_stop_km` são preenchidos com os defaults do usuário — e podem ser ajustados por viagem
- Paradas obrigatórias definidas pelo usuário têm precedência sobre a regra
- O app deve validar TODOS os trechos e alertar violações antes de exibir o roteiro
- Quando um trecho violar a regra, sugerir automaticamente onde inserir parada intermediária
  - **Último trecho do dia (`is_last_of_day = true`) — comportamento especial:**
    - Se a distância até a hospedagem for **menor que o mínimo configurado**: alertar o usuário e oferecer duas opções:
      1. **Pular a última parada do dia** — o app registra um `checkin` com `skipped = true` naquele segmento. O app lembra: *"Verifique se há autonomia suficiente para o trecho de Xkm sem abastecer."*
      2. **Manter como está** — usuário ignora o alerta e segue com a parada curta.
    - Se a distância até a hospedagem for **maior que o máximo configurado**: sugerir a inclusão de uma parada adicional de abastecimento e descanso antes da hospedagem. O usuário pode recusar — o alerta é informativo, não bloqueia.

### Alerta de autonomia vs. trecho máximo
- **Autonomia efetiva** do usuário = `motorcycles.fuel_economy_km_l × tank_liters` se houver moto cadastrada; caso contrário, usar `user_preferences.default_autonomy_km`
- Se `trips.max_stop_km > autonomia_efetiva`: exibir alerta informativo (não bloqueia). O usuário pode prosseguir ciente do risco.
- Mesmo que a autonomia seja alta (ex: 600km), a regra de trecho máximo do usuário prevalece como limite de segurança pessoal

**Contexto de criação (viagem nova):**
- O alerta dispara para o usuário no momento da criação: *"O trecho máximo configurado ({X}km) pode exceder a autonomia estimada da sua moto ({Y}km). Considere reduzir o trecho máximo ou planejar reabastecimentos intermediários."*

## Cálculo de distâncias e tempos
- **NUNCA** estimar distâncias — sempre usar Google Maps Directions API
- Velocidade média para cálculo de tempo: **80 km/h** em rodovias
- Tempo padrão de parada para combustível: **+20 minutos**
- Tempo padrão de parada com refeição: **+45 minutos**
- Recalcular todos os horários seguintes após cada check-in durante a viagem
- Exibir aviso claro quando previsão de clima estiver fora do alcance da API (>7 dias)

## Alertas obrigatórios — gerar automaticamente
- Saída antes das **06h00** → alerta de trecho noturno (visibilidade reduzida)
- Chegada prevista após **18h00** → alerta de trecho noturno no fim
- Chance de chuva acima de `user_preferences.rain_alert_threshold` (padrão 40%) em qualquer trecho → destaque visual com ícone de alerta no segmento. O mesmo threshold controla o badge de alerta na lista de viagens (`trips.has_weather_alert`)
- Rodovias de serra identificadas (Imigrantes SP-160, Anchieta SP-150, Serra do Mar, Graciosa) → alerta de neblina e pista úmida
- Trecho **> 200 km** sem parada → sugerir parada intermediária automaticamente
- Trecho **< 100 km** → sugerir consolidar com trecho seguinte
  - **Exceção:** o último trecho de cada dia (`is_last_of_day = true`) é isento do mínimo de 100km — a hospedagem pode estar a qualquer distância. O limite máximo de 200km ainda se aplica: se o trecho final do dia ultrapassar 200km, gerar alerta de trecho longo normalmente.
- Variação de temperatura **> 5°C** entre trechos consecutivos → alerta de mudança climática (ex: entrada em SC)

## Sugestão de pontos de parada

Todo trecho intermediário do roteiro (exceto o último, que termina no destino final ou na hospedagem) **deve terminar em um posto de combustível**. Não existe parada sem local de parada — o usuário não para no meio da estrada.

### Lógica de seleção em três níveis

A busca é feita via Google Places API (`type=gas_station`) e percorre os níveis abaixo até encontrar um resultado:

**Nível 1 — Preferencial (5 km, rating ≥ 4.0)**
- Busca postos num raio de 5 km com avaliação ≥ 4.0.
- Se houver resultados:
  - Prioridade 1: posto já favoritado pelo usuário (tabela `favorites`).
  - Prioridade 2: posto com maior avaliação.
- Nenhum alerta de qualidade é exibido.

**Nível 2 — Fallback de qualidade (5 km, qualquer avaliação)**
- Acionado apenas se o Nível 1 não retornou resultados.
- Mesmos 5 km, sem filtro de avaliação (inclui postos abaixo de 4.0 ou sem avaliação).
- Se houver resultados: seleciona o de maior avaliação.
- Exibir alerta: **⚠ Avaliação baixa — confirme antes de ir**.

**Nível 3 — Expansão de raio (10 km, 15 km, 20 km… até 50 km)**
- Acionado apenas se o Nível 2 também não retornou resultados (genuinamente nenhum posto dentro de 5 km).
- O raio cresce de 5 em 5 km a cada tentativa, até o máximo de 50 km.
- Seleciona o de maior avaliação entre os encontrados no primeiro raio com resultado.
- Exibir alerta **⚠ Avaliação baixa — confirme antes de ir** se o posto selecionado tiver avaliação < 4.0.

### Regra geral do alerta de qualidade
Qualquer posto com avaliação < 4.0 exibe **⚠ Avaliação baixa — confirme antes de ir**, independente do nível em que foi encontrado.

### Exibição
- Exibir por parada: nome, avaliação, total de reviews, status 24h.
- Permitir trocar a sugestão por outra opção próxima (lista de alternativas — ver seção **Alternativas de parada**).
- Posto Fazendeiro (Miracatu SP, BR-116 km 385) é exemplo de parada obrigatória — respeitar sempre.

## Previsão do tempo
- Consultar por **cidade de referência** de cada trecho, não pela rota exata
- Dados necessários por trecho: temperatura máxima, chance de chuva, tipo de precipitação
- Alertar quando a data da viagem estiver além do alcance da API de clima
- Recomendar nova consulta no dia anterior à viagem para confirmar previsão

## Botão "Navegar" — comportamento por plataforma
- **Mobile:** abrir GPS nativo (Google Maps / Waze) via deep link
- **Web:** abrir Google Maps em nova aba do browser
- A lógica de navegação não altera o roteiro — apenas redireciona o usuário ao GPS externo

## Ciclo de vida da viagem — transições de status

### Status da viagem (`trips.status`)

`started_at`/`completed_at` são colunas diretas em `trips`.

| De | Para | Quem aciona | Como |
|----|------|-------------|------|
| `planned` | `active` | O usuário | Botão "Iniciar viagem" — preenche `trips.started_at` |
| `planned` | `saved` | O usuário | Botão "Salvar roteiro" — sem data definida, vira template reutilizável |
| `active` | `planned` | O usuário | Botão "Cancelar viagem" — reverte para planejamento; `started_at` é preservado até o próximo início, quando é sobrescrito |
| `active` | `completed` | O usuário | Botão "Concluir viagem" — preenche `trips.completed_at`; app solicita `trips.rating` e `trips.rating_note` |

### Check-in — regras

- O usuário pode fazer check-in em qualquer parada enquanto `trips.status = active`.
- **Unicidade:** constraint `UNIQUE(trip_id, segment_id, user_id)` no banco — um registro por parada por viagem. Um segundo check-in faz upsert (`INSERT ON CONFLICT DO UPDATE`), atualizando `checked_in_at`.
- Após o check-in: os horários estimados dos trechos seguintes são recalculados.
- **Pular parada:** o usuário pode avançar sem fazer check-in, ou escolher "Pular" explicitamente. Pular explicitamente insere um `checkin` com `skipped = true`. A ausência de check-in sem `skipped` não é um erro — apenas indica que a parada foi passada sem parar.
- A tela de viagem ativa marca visualmente as paradas já visitadas (com check-in), as puladas (skipped) e as futuras, permitindo ver o progresso do percurso.


## Tipos de viagem

`trips.trip_type` continua com 2 valores (`day_trip` | `multi_day`) — a diferença entre os dois é **se há pernoite/hospedagem ou não**. Na UI, os tipos aparecem com nomes mais informais: **Rolê** (`day_trip`) e **Expedição** (`multi_day`).

### Rolê (`day_trip` — sem hospedagem)
- Toda a viagem ocorre em um único dia — sem necessidade de hospedagem
- O usuário seleciona este tipo na criação da viagem
- O roteiro é gerado normalmente, sem sugestão de hospedagem
- Sub-opção exibida apenas para este tipo: **"Ida e volta"** (o app também planeja o trecho de volta, que pode ser diferente da ida) ou **"Só ida"** (a viagem termina no destino, sem trecho de volta planejado). Isso não é um valor novo de `trip_type` — é um detalhe de quantos trechos gerar dentro do mesmo tipo "Rolê".
- Por ser um único dia, a tela de criação pede apenas **uma data**, não um par saída/retorno.

### Expedição (`multi_day` — com hospedagem)
- A viagem se divide em dias, cada um com seu conjunto de trechos
- O usuário informa o período (data de saída e de retorno) ou o número de dias
- O app distribui os trechos por dia, respeitando a regra de 100–200 km por trecho
- **O último trecho de cada dia (exceto o último) termina na hospedagem overnight**
- O ponto de hospedagem é tratado como destino final daquele dia — aparece no card do dia e o botão "Navegar" direciona para ele
- Paradas obrigatórias definidas pelo usuário têm precedência na distribuição por dia
- **Dias parados:** o usuário pode marcar um dia da expedição como "parado" (sem deslocamento, permanece na hospedagem do dia anterior) — por exemplo, para turismo local no meio de uma viagem mais longa. Um dia parado não gera trechos nem validação de regra de paradas, e mantém a mesma hospedagem do dia anterior.
- Uma expedição curta (ex: 2 dias, 1 pernoite) e uma longa com dias parados intercalados seguem exatamente a mesma lógica — não há tipo separado para "viagem curta com 1 pernoite".

## Hospedagem (multi-day — incluído no MVP)

### Quando e como o usuário define a hospedagem
- A hospedagem é **opcional** e definida **após a geração do roteiro**, dentro de cada card de dia
- Não é exigida no fluxo de criação — não pode ser impeditivo para o restante do planejamento
- O usuário abre o bloco "Pernoite" no fim de cada day card e informa cidade ou endereço

### Ponto de referência para busca
- Se o usuário informa apenas o **município**: o sistema usa as coordenadas do **centro da cidade** via Google Geocoding API
- Se o usuário informa um **endereço específico**: usa as coordenadas desse endereço
- O app exibe sempre uma nota explícita sobre qual referência está sendo usada: *"Usando o centro de Pindamonhangaba como referência. Para refinar, informe um endereço."*

### Discovery
- Usar **Google Places API** com `type=lodging` em raio de **10 km** do ponto de referência
- Campos obrigatórios no retorno: `name`, `rating`, `user_ratings_total`, `price_level`, `geometry`, `place_id`
- Filtrar por avaliação mínima 3.8 (critério menos restritivo que postos — menos opções disponíveis)
- Exibir por opção: nome, tipo (hotel/pousada/chalé), avaliação com total de reviews, faixa de preço, distância do ponto de referência
- Ordenação padrão: **distância** — com opções de reordenar por avaliação ou preço

### Reserva — integração via deep link (sem API de parceiro)
- Ao clicar em "Ver no Booking.com", abrir deep link com cidade + datas pré-preenchidas:
  - `https://www.booking.com/searchresults.html?ss={cidade}&checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD+1}&group_adults=1`
- **Mobile:** abrir no browser nativo via `Linking.openURL()`
- **Web:** abrir em nova aba via `window.open()`
- Não requer chave de API do Booking.com — é uma URL pública de busca

### Estados do bloco de pernoite

O bloco de pernoite no fim de cada day card (exceto o último dia) tem 3 estados visuais:

| Estado | Visual | Ações disponíveis |
|--------|--------|-------------------|
| **Sem hospedagem** | Botão discreto "＋ Adicionar hospedagem" | Abrir busca |
| **Selecionada** | Fundo azul-escuro · nome, avaliação, preço, distância | Marcar como reservado · Navegar · Booking.com · Trocar |
| **Reservada** | Fundo verde-escuro · badge "✓ RESERVADO" | Navegar · Booking.com · Desfazer / Trocar |

### Marcador de reserva — comportamento
- "Marcar como reservado" é uma **ação manual do usuário** — não representa integração com Booking.com ou qualquer plataforma
- Serve como controle pessoal para rastrear quais pernoites já foram resolvidos
- Persiste no banco como `is_reserved = true` na tabela `lodging_suggestions`

### Card do dia — viagem de múltiplos dias
- Cada dia tem um card próprio no roteiro com: data, trechos do dia, km total do dia, horário estimado de saída e chegada
- O último item do card de cada dia (exceto o último) é a hospedagem overnight
- A hospedagem aparece como destino navegável — botão "Navegar até a hospedagem" com as mesmas regras de plataforma do botão Navegar padrão
- O usuário pode trocar a sugestão de hospedagem por outra opção próxima (lista de alternativas)

## Nome da viagem
- Campo opcional no passo 1 da criação — se não preenchido, o app gera automaticamente: "{Origem} → {Destino}"
- Editável a qualquer momento antes ou durante a viagem

## Previsão do tempo — janela e atualização

### Estados do painel de clima por trecho

| Estado | Condição | Visual |
|--------|----------|--------|
| **Bloqueado** | Data do trecho > 7 dias | 🔒 + contador "Prev. em Xd" |
| **Sem dados** | Data ≤ 7 dias, mas `weather_condition` ainda é null | "—" + "Sem dados" |
| **Disponível** | `weather_condition` preenchido | ícone + temperatura + chuva% + vento |

- O estado "Sem dados" ocorre quando o clima nunca foi buscado para aquele trecho (ex: trecho recém-inserido antes da primeira atualização de clima)
- O estado "Sem dados" **não é** um erro — é esperado logo após inserção de parada; o usuário pode usar o botão "Atualizar Clima" para preencher
- Ao inserir uma nova parada, o clima é buscado automaticamente para os novos trechos (se dentro da janela de 7 dias) — o estado "Sem dados" dura apenas o tempo da requisição

### Atualização
- O card de clima de cada trecho fica **bloqueado** quando a data da viagem está a mais de 7 dias
- Exibir contador regressivo: "Clima disponível em X dias"
- Quando dentro da janela de 7 dias: exibir botão explícito "🔄 Atualizar previsão" com timestamp da última consulta ("Atualizado há Xh")
- Recomendar atualização no dia anterior à viagem (push notification se permitido)
- Nunca exibir dados de clima desatualizados sem aviso — sempre mostrar quando foi a última consulta

## Inserção manual de paradas no roteiro

### Via lista (view padrão)
- Cada card de trecho tem um botão `+` no canto superior direito
- O botão é explícito: inserir uma parada **neste trecho** (não entre dois trechos)
- Ao tocar: abrir campo de busca (cidade, endereço, nome de estabelecimento)

### Via mapa
- View alternativa ao roteiro em lista, acessível por toggle "Lista ↔ Mapa" no topo
- Exibe a rota completa no mapa com marcadores em cada parada
- Usuário toca em qualquer ponto da rota ou arredores para adicionar parada
- Long press em ponto existente: opções de remover ou mover a parada

### Fluxo de inserção — 4 fases obrigatórias

Toda inserção de parada percorre as mesmas fases antes de qualquer persistência.

#### Fase 1 — Geocodificação
- Converter o ponto inserido para lat/lng via Google Geocoding API

#### Fase 2 — Preview dos novos trechos
- Directions API calcula `A → P` e `P → B` (2 chamadas em paralelo), onde A→B é o trecho clicado
- Se qualquer sub-trecho resultante exceder `trips.max_stop_km`, ele é automaticamente subdividido em múltiplos trechos via `generateSegments`
- Exibir lista de **todos** os novos trechos que serão criados, com nome, km e duração de cada um
- Exibir desvio em km (distância perpendicular do ponto ao segmento original) com aviso se > 50 km

#### Fase 3 — Confirmação obrigatória
- Exibir modal com a lista de novos trechos antes de qualquer mudança persistida
- Botões: **Confirmar** e **Cancelar** (cancelar não gera nenhum efeito colateral)

#### Fase 4 — Persistência cirúrgica
- O trecho clicado é removido e substituído pelos N novos trechos (split cirúrgico)
- `order_index` dos demais trechos é ajustado para abrir espaço
- Caches da viagem atualizados: `total_distance_km`, `total_duration_min`, `stop_count`
- Postos de combustível buscados automaticamente para todos os novos trechos intermediários
- Previsão do tempo buscada automaticamente para todos os novos trechos (se dentro da janela de 7 dias)

### Regras gerais
- **Nunca persistir** a parada sem passar pela Fase 3 (confirmação)
- **Nunca estimar** distâncias — sempre Directions API
- Preservar paradas obrigatórias definidas pelo usuário em qualquer tipo de recálculo
- Durante viagem ativa (`trips.status = 'active'`): o fluxo é idêntico; o banner de aviso de viagem ativa (ver seção "Edições durante viagem ativa") é exibido antes de abrir o campo de busca

## Alternativas de parada
- Disponível a qualquer momento: durante o planejamento e durante a viagem
- Botão "Ver alternativas" visível diretamente no card de cada parada (não escondido em submenu)
- Exibe lista de até 5 opções próximas com: nome, avaliação, distância do ponto ideal, status 24h
- Ao selecionar alternativa: substitui a sugestão atual e persiste no roteiro
- Durante a viagem: alternativas ordenadas por distância da posição atual

### Delta de distância por alternativa

Ao abrir a lista de alternativas, o app exibe para cada opção o impacto que ela teria nos trechos adjacentes:

- **Delta do trecho anterior:** diferença em km entre a origem do segmento e a alternativa vs. a distância até a parada atual. Exibido como `+X km` (se mais distante) ou `−X km` (se mais próximo), em verde para negativo e laranja para positivo.
- O delta é calculado em tempo real via Google Directions API no momento em que o modal abre, usando a origem do segmento como ponto de partida. **Nunca estimar — sempre usar Directions API.**
- As 5 chamadas são disparadas em paralelo (`Promise.all`) para minimizar latência. Enquanto carregam, exibir skeleton/spinner na coluna de delta.
- O delta **não é persistido** no banco — é calculado sob demanda a cada abertura do modal.

### Recálculo ao selecionar alternativa

Ao confirmar a troca de parada, o app recalcula automaticamente os dois segmentos afetados:

1. O segmento que **termina** na parada trocada: nova distância e duração calculadas via Directions API (origem → nova parada, incluindo waypoints intermediários desse segmento se houver).
2. O segmento que **começa** na parada trocada: nova distância e duração calculadas via Directions API (nova parada → destino, incluindo waypoints intermediários desse segmento se houver).
3. Os dois segmentos são atualizados no banco com os novos valores de `distance_km` e `duration_minutes`.
4. Os campos cache da viagem (`total_distance_km`, `total_duration_min`) são recalculados via `SUM` dos segmentos após a atualização.

O botão "Recalcular Rota" completo continua existindo para o usuário forçar um recálculo global. A troca de parada dispara apenas o recálculo localizado dos dois segmentos adjacentes — não de toda a rota.

### Galeria de fotos por alternativa

Cada alternativa de parada pode exibir fotos do local para auxiliar na tomada de decisão (limpeza, estrutura, conveniência). As fotos vêm da **Google Places Photos API** e **não são persistidas no banco** — são buscadas sob demanda via `place_id`.

- Ao tocar em "ver fotos" de uma alternativa, o app faz uma chamada de **Place Details** (`fields=photos`) para aquele `place_id`.
- O retorno inclui até 10 `photo_reference` tokens. O app exibe as **3 primeiras fotos** em scroll horizontal num sub-modal (galeria).
- Cada imagem é carregada via URL `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={token}&key={KEY}`.
- Os tokens **não são armazenados** — expiram em horas e são buscados frescos a cada abertura.
- A chamada é **lazy**: só acontece quando o usuário toca explicitamente em "ver fotos". Não pré-carrega para todas as alternativas ao abrir o modal.
- Se o local não tiver fotos cadastradas no Google, exibir placeholder com ícone neutro.

---

## Compartilhamento de roteiro (cópia independente)

Quando um usuário compartilha um roteiro com outra pessoa:

1. O destinatário recebe notificação (e-mail + push) com prévia do roteiro.
2. Ao aceitar, o sistema cria uma cópia da viagem com `user_id` do destinatário (ele é o dono da cópia).
3. O sistema aplica os parâmetros do destinatário (consumo da moto, km/dia, preferências de rota) no recálculo.
4. O app exibe para o destinatário: *"Você recebeu este roteiro de [nome]. Pode não ser idêntico ao original — aplicamos seus parâmetros de viagem."* com opção de ver o roteiro original ou usar os próprios parâmetros.
5. A cópia é completamente independente — nenhuma alteração de um afeta o outro.
6. O sistema registra `source_trip_id` na cópia para rastreabilidade (sem impacto na UX do destinatário).

---

## Cache e performance

### Campos computados em `trips` — regras de atualização

Os campos `total_distance_km`, `total_duration_min`, `stop_count` e `has_weather_alert` são caches de queries que seriam custosas a cada listagem. As regras de atualização são:

- **`total_distance_km` e `total_duration_min`**: recalculados sempre que segmentos forem inseridos, atualizados ou removidos, e ao marcar a viagem como `completed`. Valor: `SUM` de `segments.distance_km` / `segments.duration_minutes` para a viagem.
- **`stop_count`**: incrementado/decrementado quando `stop_suggestions.is_selected` muda. Nunca é calculado por COUNT em tempo de exibição.
- **`has_weather_alert`**: calculado com `user_preferences.rain_alert_threshold` do usuário. Setado para `true` quando qualquer segmento tiver `weather_rain_pct > rain_alert_threshold` OU `segments.has_alert = true`. Resetado para `false` se nenhum segmento atender. É o único threshold de chuva do sistema — controla tanto o destaque de segmento no roteiro quanto o badge de alerta na lista de viagens.

### TTL e invalidação do clima (WeatherAPI)

- Cada segmento armazena `weather_updated_at` — timestamp da última chamada bem-sucedida à WeatherAPI.
- **TTL efetivo: 6 horas.** Se `now() - weather_updated_at > 6h`, exibir badge "Desatualizado" junto ao botão de atualizar.
- A atualização de clima para uma viagem re-consulta **todos os segmentos** da viagem de uma vez (chamadas em paralelo) — nunca atualizar um segmento isolado.
- No dia da viagem (`departure_date = today`): re-consultar automaticamente ao abrir o roteiro, independente do TTL.
- Após atualizar clima de todos os segmentos, recalcular `trips.has_weather_alert`, usando `user_preferences.rain_alert_threshold` do usuário.

### Sincronização mobile offline

O app mobile persiste o roteiro ativo em `AsyncStorage` para funcionamento offline completo durante a viagem. A lógica de sincronização é:

1. Ao abrir o app com internet: comparar `trips.updated_at` (banco) com `active_trip.updated_at` (AsyncStorage).
2. Se banco > local: substituir cache local pelo dado do banco e notificar o usuário ("Roteiro atualizado").
3. Se local > banco: situação anômala — não deve ocorrer (app mobile não edita o roteiro offline). Priorizar banco.
4. Se sem internet: usar cache local sem consultar banco. Exibir banner "Você está offline".
5. Ao fazer check-in offline: enfileirar a operação localmente e sincronizar ao reconectar.

### Dados nunca armazenados em AsyncStorage

- Listas de alternativas de parada (dados de planning, não de campo)

### Edições durante viagem ativa

Edições ao roteiro são permitidas mesmo quando `trips.status = 'active'`. O app exibe um aviso contextual antes de permitir a edição:

> ⚠️ **Esta viagem já foi iniciada.**
> Alterações serão aplicadas imediatamente no app.

O banner é informativo — não bloqueia a edição. O usuário pode prosseguir normalmente após ler.

- Exibir o banner uma vez por sessão por viagem ativa. Se o usuário já o dispensou (clicou em "Entendi"), não exibir novamente na mesma sessão.
- Em mobile: banner no topo da tela de roteiro, acima do conteúdo, com fundo âmbar.
- Em web: alert banner fixo abaixo da topbar, com fundo âmbar, largura total.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         