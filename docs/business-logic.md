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

## Geração automática de roteiro

### Preservação de origem e destino
Dentro do cálculo do roteiro, o `origin_name` do primeiro segmento e o `destination_name` do último segmento devem ser exatamente os strings recebidos como parâmetros pela API — nunca substituídos por reverse geocoding. O geocoding de validação da origem/destino ocorre na etapa de criação da viagem (escopo separado) e não é alterado por este fluxo.

### Destino final de cada dia deve ser uma cidade (`multi_day` apenas)
Para viagens de múltiplos dias, o último segmento de cada dia (`is_last_of_day = true`, exceto o último dia) deve terminar em um ponto que o reverse geocoding identifique como `locality` (cidade). O motociclista precisa de estrutura urbana para pernoite: restaurantes, hotéis, serviços.

- Se o corte natural do algoritmo cair num step endpoint sem `locality` (ex: cruzamento no interior, nome de município esparsamente populado), o algoritmo desliza para o step endpoint mais próximo — antes ou depois — cujo geocoding retorne uma `locality`.
- O fim de dia não deve ser escolhido apenas por estar próximo da distância matemática ideal. O algoritmo deve preferir cidades com maior probabilidade de infraestrutura para pernoite: hospedagem, alimentação, abastecimento, serviços básicos e segurança/logística.
- A divisão dos dias **não precisa ser exata em quilometragem**: um dia pode ficar ligeiramente mais longo ou mais curto do que o target se isso for necessário para garantir pernoite em cidade. Infraestrutura urbana tem prioridade sobre precisão de km diário.
- Esta regra **não se aplica** ao último dia da viagem (cujo destino é o destino final informado pelo usuário) nem a viagens `day_trip`.

### Distância diária recomendada em expedições

A regra de 100–200 km entre paradas controla segurança e autonomia entre abastecimentos. A distância diária total controla cansaço e viabilidade da expedição — são validações independentes, e ambas devem ser verificadas em viagens `multi_day`.

Faixas de referência:

| Ritmo | Distância/dia | Comportamento do app |
|-------|--------------|----------------------|
| Tranquilo | até 350 km | Sem alerta |
| Normal | até 500 km | Sem alerta |
| Puxado | até 650 km | Alerta informativo |
| Extremo | acima de 650 km | Alerta forte — expedição potencialmente cansativa ou insegura |

- Esses limites são referências para orientar o usuário, não configurações técnicas fechadas no MVP
- O app não impede a criação de expedições acima de 650 km/dia — exibe alerta e o usuário decide conscientemente

### Alerta de média diária acima do recomendado

Se `distância_total ÷ número_de_dias` resultar em média acima do limite recomendado, o app exibe alerta informativo antes de confirmar a geração do roteiro.

Exemplo de mensagem:
> "Esta expedição terá média de 710 km por dia. Para uma viagem de moto, considere adicionar mais dias ou revisar o ritmo."

- O alerta não bloqueia a criação da viagem
- O app sugere aumentar o número de dias; o usuário pode continuar como planejado
- O alerta deve ser visível antes da confirmação final, não escondido no detalhe do roteiro

### Validação do fim de dia como ponto de pernoite

O último ponto de cada dia — exceto o destino final da viagem — deve ser validado como ponto adequado de pernoite, não apenas como endpoint de step de rota.

**O algoritmo deve preferir:**
- Locais cujo reverse geocoding retorne `locality`
- Pontos com nome legível e reconhecível como cidade

**O algoritmo deve evitar como fim de dia:**
- Código de coordenada ou ponto técnico sem nome urbano
- Posto isolado sem estrutura de pernoite
- Estrada, cruzamento ou área rural
- Nome pouco legível ou identificador interno de mapa

**Quando não houver cidade ideal exatamente no corte diário:**
- O algoritmo desliza antes ou depois dentro de uma tolerância razoável, priorizando a cidade mais próxima com estrutura provável
- O dia pode ficar ligeiramente mais curto ou mais longo — infraestrutura tem prioridade sobre precisão de km

Esta seção é uma extensão da regra `### Destino final de cada dia deve ser uma cidade` e aplica-se em conjunto com ela.

### Nomes legíveis no roteiro

O roteiro final não deve exibir labels técnicos ou identificadores não humanos como pontos de rota.

**Exemplos de nomes inaceitáveis:**
- `47CPMX97+26` (Plus Code do Google)
- Coordenadas cruas: `−15.8234, −47.9291`
- Identificadores internos ou step index de mapa

**Quando um ponto retornar label técnico:**
1. O app tenta substituir pelo nome retornado em reverse geocoding — cidade, bairro ou localidade
2. Se não houver nome confiável, exibir "Local a confirmar" como label do ponto
3. Nunca tratar um ponto com label técnico como ponto normal sem notificação ao usuário

- Esta regra se aplica a todos os pontos do roteiro: paradas intermediárias, fins de dia e destinos
- Origem e destino informados pelo usuário são preservados conforme `### Preservação de origem e destino`

### Diferença entre trecho válido e dia viável

Um roteiro pode respeitar a regra de 100–200 km entre paradas em todos os trechos e ainda assim gerar dias inviáveis por acúmulo.

A validação de expedição opera em duas camadas independentes:

1. **Validação de trecho**: cada segmento individual está dentro do mínimo e máximo configurados → controla autonomia e segurança entre abastecimentos
2. **Validação de dia**: a soma dos trechos do dia não ultrapassa o limite diário recomendado → controla cansaço e viabilidade de continuar a expedição

Ambas as camadas devem ser verificadas. Quando violadas, o resultado de cada camada deve ser exibido separadamente ao usuário — não basta indicar que "a rota está válida".

### Explicabilidade da escolha do fim de dia

Quando o algoritmo escolher uma cidade de pernoite que deixa o dia mais curto ou mais longo do que a divisão matemática, o app pode exibir uma justificativa simples no card do dia.

Exemplos:
- "Dia encerrado em Paraíso do Tocantins por ter melhor estrutura para pernoite."
- "Dia ficou mais curto para terminar em cidade com hospedagem provável."
- "Dia ficou mais longo porque a próxima cidade com estrutura está adiante."

- A justificativa é informativa — não bloqueia nenhuma ação
- Ajuda o usuário a entender por que os dias podem ter comprimentos diferentes em km

### Alertas de expedição não bloqueiam a viagem

Todas as validações desta seção — distância diária alta, média acima do recomendado, fim de dia sem cidade ideal, nomes técnicos no roteiro — geram alertas informativos, não barreiras técnicas.

- O usuário pode aceitar uma expedição puxada de forma consciente
- O app deve deixar o risco visível e rastreável no roteiro
- Bloquear automaticamente é inadequado: ritmo, moto, experiência e condições da estrada variam de pessoa para pessoa

### Estratégia de cálculo por comprimento de rota
O algoritmo de geração de roteiro usa duas estratégias conforme o número de waypoints intermediários necessários (`round(totalKm / targetKm) - 1`):

**Viagens curtas (≤ 24 waypoints intermediários, ~até 3.750 km com target de 150 km):**
- Lógica em duas etapas: primeira chamada `getRoute(origin, destination)` para obter os steps → selecionar até 24 step endpoints como waypoints → segunda chamada `getRoute(origin, destination, waypoints)` → legs road-accurate diretamente do Google.
- Os pontos de parada são garantidamente sobre a estrada real porque o Google roteia através deles.
- Após geração dos segmentos, aplicar a regra de destino final de dia = cidade.

**Viagens longas (> 24 waypoints intermediários):**
- Primeira chamada `getRoute(origin, destination)` com cap de 24 waypoints → 25 legs de ~400–500 km cada.
- Para cada leg que exceder `max_stop_km`: subdividir usando step endpoints da própria leg (todos são coordenadas reais da estrada).
- Para cada leg que ficar abaixo de `min_stop_km`: mesclar com a leg adjacente.
- Após subdivisão, aplicar a regra de destino final de dia = cidade.

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
- Além da regra de trecho, a distribuição deve considerar a **distância diária total** — ver `### Distância diária recomendada em expedições`
- **O último trecho de cada dia (exceto o último) termina na hospedagem overnight**
- O ponto de hospedagem é tratado como destino final daquele dia — aparece no card do dia e o botão "Navegar" direciona para ele
- Paradas obrigatórias definidas pelo usuário têm precedência na distribuição por dia
- **Dias parados:** o usuário pode marcar um dia da expedição como "parado" (sem deslocamento, permanece na hospedagem do dia anterior) — por exemplo, para turismo local no meio de uma viagem mais longa. Um dia parado não gera trechos nem validação de regra de paradas, e mantém a mesma hospedagem do dia anterior.
- Uma expedição curta (ex: 2 dias, 1 pernoite) e uma longa com dias parados intercalados seguem exatamente a mesma lógica — não há tipo separado para "viagem curta com 1 pernoite".

## Hospedagem (multi-day — incluído no MVP)

A hospedagem é tratada como **pernoite planejado** — não como sugestão de API. O usuário tem três caminhos equivalentes para definir onde vai dormir: busca automática, inserção manual ou registro de uma reserva já existente em serviço externo.

### Quando e como o usuário define a hospedagem
- A hospedagem é **opcional** e definida **após a geração do roteiro**, dentro de cada card de dia
- Não é exigida no fluxo de criação — não pode ser impeditivo para o restante do planejamento
- O usuário abre o bloco "Pernoite" no fim de cada day card e escolhe entre **buscar** ou **inserir manualmente**

### Ponto de referência para busca
- Se o usuário informa apenas o **município**: o sistema usa as coordenadas do **centro da cidade** via Google Geocoding API
- Se o usuário informa um **endereço específico**: usa as coordenadas desse endereço
- O app exibe sempre uma nota explícita sobre qual referência está sendo usada: *"Usando o centro de Pindamonhangaba como referência. Para refinar, informe um endereço."*

### Busca automática
- Usar **Google Places API** com `type=lodging` em raio de **10 km** do ponto de referência
- Campos obrigatórios no retorno: `name`, `rating`, `user_ratings_total`, `price_level`, `geometry`, `place_id`
- Filtrar por avaliação mínima 3.8 (critério menos restritivo que postos — menos opções disponíveis)
- Exibir por opção: nome, endereço ou região, tipo aparente (hotel/pousada/chalé/casa), avaliação com total de reviews, faixa de preço quando disponível, distância do ponto de referência, atributos confirmados/não confirmados, ações externas disponíveis
- Ordenação padrão: **distância** — com opções de reordenar por avaliação, preço ou compatibilidade com preferências

### Inserção manual
O usuário pode informar uma hospedagem diretamente, sem busca automática. Isso cobre casos como: pousada já conhecida, hospedagem combinada com amigos, reserva feita fora do app.

**Campos mínimos (obrigatórios para salvar):**
- Nome da hospedagem
- Endereço ou cidade

**Campos opcionais:**
- Link da reserva (qualquer URL — Booking, Airbnb, direto)
- Observações livres (ex: "confirmar chegada antes das 22h")
- Status "já está reservado" — pré-marca `is_reserved = true`

**Regras:**
- A hospedagem manual aparece no card do dia exatamente como uma hospedagem encontrada por busca
- Pode ser marcada como reservada a qualquer momento
- Se houver endereço, o app tenta geocodificar e salvar lat/lng; se não conseguir, a hospedagem é salva normalmente e a navegação pode usar o endereço textual
- Não há validação de existência — o app registra o que o usuário informa

### Preferências de busca
As preferências influenciam ordenação, filtragem e links externos. **Não alteram o roteiro.**

**Local e período vêm do planejamento:**
- Local: ponto de referência do pernoite (município ou endereço)
- Check-in: data do dia corrente do pernoite
- Checkout: dia seguinte

**Parâmetros configuráveis pelo usuário:**

| Parâmetro | Opções |
|-----------|--------|
| Tipo de hospedagem | Qualquer · Hotel/Pousada · Casa/Apartamento |
| Hóspedes | Número inteiro ≥ 1 |
| Garagem | Não filtrar · Preferencial · Obrigatória |
| Café da manhã | Não filtrar · Preferencial · Obrigatório |

- "Preferencial" influencia ordenação dos resultados — opções com o atributo confirmado sobem na lista
- "Obrigatório" alerta quando um resultado não tem o atributo confirmado, mas **não oculta automaticamente** o resultado (pode haver poucas opções)
- Preferências são passadas nos links externos sempre que o serviço destino suportar os parâmetros

### Confiabilidade dos atributos
APIs externas não confirmam todos os atributos. Cada atributo exibido deve ser classificado explicitamente:

| Classificação | Significado |
|---------------|-------------|
| **Confirmado** | A fonte (API ou o próprio usuário) garantiu o atributo |
| **Inferido** | Deduzido de contexto (ex: nome sugere "pousada rural") — sem confirmação direta |
| **Não confirmado** | A fonte retornou o local mas não tem dados sobre aquele atributo |

**Regras:**
- Garagem e café da manhã **nunca** devem ser exibidos como garantidos se a fonte não confirmar
- Se o usuário inserir manualmente um atributo (ex: "garagem confirmada"), tratar como **confirmado pelo usuário**
- Quando um critério marcado como "obrigatório" não puder ser confirmado, exibir alerta visual no resultado — não ocultar

### Casa/Apartamento
Esse tipo de hospedagem pode não aparecer bem em APIs tradicionais de lugares (`type=lodging` tende a retornar hotéis e pousadas).

- Quando o usuário escolher "Casa/Apartamento" nas preferências, o app prioriza resultados compatíveis quando disponíveis
- Oferece link externo ("Buscar no Airbnb") como caminho primário para esse tipo
- A inserção manual é o caminho natural quando não há resultados automáticos adequados
- **Ausência de resultados automáticos não bloqueia o usuário** — o modo manual permanece sempre disponível

### Renderização dos chips de atributos

Cada card de resultado de hospedagem exibe chips de atributos. O chip de garagem e o chip de café **sempre aparecem** em cada card — ou confirmado ou não confirmado. Nunca omitidos silenciosamente.

| Campo | Valor | Chip exibido | Visual |
|-------|-------|-------------|--------|
| `parking_status` | `'confirmed'` | 🏍️ **Garagem confirmada** | Verde |
| `parking_status` | `'unknown'` ou `'inferred'` | ⚠️ **Garagem não confirmada** | Âmbar |
| `breakfast_status` | `'confirmed'` | ☕ **Café incluso** | Laranja suave |
| `breakfast_status` | `'unknown'` ou `'inferred'` | **Café não confirmado** | Cinza |

**Fonte dos valores:**
- Google Places confirma o atributo explicitamente → `'confirmed'`
- API retorna o local sem dados sobre o atributo → `'unknown'`
- Inferido por tipo/nome sem confirmação direta → `'inferred'`
- Usuário preenche manualmente → `'confirmed'`

**Regras de exibição:**
- Quando a preferência do usuário for "Obrigatório" e o atributo for `'unknown'` ou `'inferred'`, o chip de "não confirmado" recebe alerta visual adicional (ex: borda destacada), mas o card **não é ocultado**
- Não existe chip "Bom para moto" — o chip de garagem confirmada cobre o caso de uso principal para motociclistas

### Reserva — integração via deep link (sem API de parceiro)
O app **não faz reservas**. Apenas abre links externos para que o usuário finalize no serviço escolhido.

- **Booking.com:** `https://www.booking.com/searchresults.html?ss={cidade}&checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD+1}&group_adults={n}`
- **Airbnb:** link de busca com localidade e datas quando suportado
- **Google Maps:** abrir local pelo `place_id` ou endereço
- Sempre que possível, preencher automaticamente nos links: local, check-in, checkout e número de hóspedes
- **Mobile:** abrir no browser nativo via `Linking.openURL()`
- **Web:** abrir em nova aba via `window.open()`
- O app **não garante** disponibilidade, preço, política de cancelamento, garagem ou café da manhã — qualquer atributo exibido vem de APIs de discovery, não de confirmação de reserva

### Estados do bloco de pernoite

O bloco de pernoite no fim de cada day card (exceto o último dia) tem 3 estados visuais:

| Estado | Visual | Ações disponíveis |
|--------|--------|-------------------|
| **Sem hospedagem** | Botão discreto "＋ Adicionar hospedagem" | Buscar · Inserir manualmente |
| **Selecionada** | Fundo azul-escuro · nome, meta, distância | Marcar como reservado · Trocar · Navegar · Abrir link externo |
| **Reservada** | Fundo verde-escuro · badge "✓ RESERVADO" | Desfazer reserva · Trocar · Navegar · Abrir link externo |

### Marcador de reserva — comportamento
- "Marcar como reservado" é uma **ação manual do usuário** — não representa integração com nenhuma plataforma
- Serve como controle pessoal para rastrear quais pernoites já foram resolvidos
- Persiste no banco como `is_reserved = true`
- Pode ser desfeito — voltando ao estado "Selecionada"

### Card do dia — viagem de múltiplos dias
- Cada dia tem um card próprio no roteiro com: data, trechos do dia, km total do dia, horário estimado de saída e chegada
- O último item do card de cada dia (exceto o último) é a hospedagem overnight
- A hospedagem aparece como destino navegável — botão "Navegar até a hospedagem" com as mesmas regras de plataforma do botão Navegar padrão
- Hospedagens manuais e automáticas se comportam de forma idêntica no card do dia
- O usuário pode trocar por outra opção a qualquer momento (busca ou manual)

### Modelo de dados mínimo
Referência para implementação — sem obrigação de mudança imediata no banco enquanto o schema atual suportar.

**Obrigatórios:**
`trip_id` · `day_index` · `source` (auto | manual) · `name` · `address` · `city` · `checkin_date` · `checkout_date` · `is_selected` · `is_reserved`

**Opcionais:**
`place_id` · `latitude` · `longitude` · `rating` · `total_ratings` · `price_level` · `booking_url` · `notes` · `lodging_type` · `guest_count` · `parking_requirement` · `breakfast_requirement` · `parking_status` · `breakfast_status` · `reference_lat` · `reference_lng` · `reference_label` · `distance_m`

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