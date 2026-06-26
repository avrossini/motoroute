# UX — Contexto de Uso em Moto e na Web

## Princípio fundamental de plataforma

> **Mobile = uso em campo. Web = planejamento e acompanhamento.**

Esta distinção é absoluta e deve guiar todas as decisões de UX e produto:

- O **app mobile** (iOS e Android) é a plataforma principal para uso durante a viagem. O motociclista usa o celular no guidão, com capacete, luvas e sol na tela. Toda a experiência on the road — card de trecho ativo, botão Navegar, check-in em paradas, alertas em tempo real — existe exclusivamente no mobile.

- A **interface web** (browser) é a plataforma de planejamento e acompanhamento. O usuário planeja a viagem com conforto no computador antes de sair. Durante a viagem, a web pode ser usada por um acompanhante ou pelo próprio motociclista em uma parada para verificar o roteiro, mas **nunca é a interface de uso em campo**.

- A **sessão é unificada**: um roteiro criado na web está disponível no celular e vice-versa. O usuário faz login uma vez e acessa de qualquer plataforma.

---

## Mobile — uso em campo (on the road)

### Tela de viagem ativa — regras críticas
- Fonte mínima: **18sp** em qualquer elemento interativo
- Alto contraste obrigatório — legível com sol direto na tela
- Botão **"Navegar até aqui"** é o elemento mais destacado da tela
- **Proibido scroll** — todo conteúdo visível sem rolar
- Informações prioritárias visíveis: próxima parada, distância, horário estimado, clima
- Evitar gestos complexos — o app pode ser usado com luvas de couro

### Tamanhos de toque
- Botões principais: mínimo **56dp de altura**
- Elementos interativos secundários: mínimo **44dp**
- Espaçamento entre elementos tocáveis: mínimo **8dp**

### Botão "Navegar até aqui" — mobile
- Abre GPS nativo via `Linking.openURL('https://maps.google.com/?daddr=LAT,LNG')`
- Se Google Maps não estiver instalado, abre no browser
- **Nunca integrar navegação dentro do app** — redirecionar sempre para GPS externo

### Alertas e notificações — mobile
- Alertas de clima e distância: banner no topo, não modal
- Push notifications para alertas críticos (chuva iminente no próximo trecho)
- Nunca mostrar mais de 1 alerta simultâneo na tela de viagem ativa

### Performance — mobile
- Tela de viagem ativa: máximo 1 chamada de API a cada 30 segundos
- Cachear o roteiro com **AsyncStorage** — app funciona offline após gerar o roteiro
- **Nunca bloquear a UI** em chamadas de API — sempre mostrar loading state

---

## Web — planejamento e acompanhamento

### O que a web faz
- Criar e configurar viagens com conforto (teclado, mouse, tela grande)
- Visualizar o roteiro gerado com mapa e detalhes expandidos
- Editar paradas, ajustar preferências, comparar opções de rota
- Acompanhar o progresso de uma viagem em andamento (modo leitura)

### O que a web NÃO faz
- **A tela de viagem ativa na web é somente leitura** — exibe o progresso mas não tem check-in nem botão Navegar funcional para uso em campo
- Não recebe push notifications (apenas Web Notifications passivas, se o usuário permitir)
- Não é otimizada para uso com uma mão, luvas ou sol na tela

### Layout e interação — web
- Responsivo com `useWindowDimensions()`:
  - Mobile-width (<768px): layout idêntico ao app
  - Desktop (≥768px): sidebar com lista de trechos + área de detalhe à direita
- Hover states habilitados apenas em `Platform.OS === 'web'`
- Navegação por teclado nos formulários (Tab, Enter, Esc)
- Botão "Navegar" abre Google Maps em nova aba: `window.open('https://maps.google.com/?daddr=LAT,LNG', '_blank')`

### Cache — web
- Roteiro cacheado via **localStorage** para acesso offline no browser

---

## Modo noturno
- Suportar dark mode do sistema em todas as plataformas
- Tela de viagem ativa no mobile: dark mode por padrão independente do sistema (conforto de madrugada)

---

## Nome da viagem
- Campo de texto opcional no Step 1 — placeholder: "Ex: Viagem de aniversário"
- Exibido no topo do card de viagem e no roteiro gerado

## Card de clima — estados visuais
- **Fora da janela (> 7 dias):** card bloqueado com cadeado 🔒, texto "Clima disponível em X dias", fundo acinzentado
- **Dentro da janela (≤ 7 dias):** dados visíveis + botão "🔄 Atualizar" no canto + timestamp "Atualizado há Xh"
- **Alerta:** quando dados têm mais de 6h, exibir badge amarelo "Desatualizado" junto ao botão de atualizar
- Nunca esconder o botão de atualizar quando o clima estiver disponível — o usuário precisa saber que pode e deve atualizar

## Inserção de paradas — UX

### Toggle Lista / Mapa
- Posicionado no topo do roteiro gerado, visível sempre
- Ícones: ☰ Lista | 🗺️ Mapa
- Estado persistido: app lembra a última preferência do usuário

### View de lista — inserção via "+"
- Botão `+` entre cada par de trechos: fundo sutil, não compete visualmente com os trechos
- Ao tocar: bottom sheet desliza com campo de busca em foco
- Resultados mostram: nome, tipo, distância do ponto na rota, avaliação
- Confirmação: preview das mudanças antes de aplicar ("Trecho dividido · +42 km · +32 min")

### View de mapa — inserção por toque
- Rota desenhada como linha laranja sobre o mapa
- Marcadores nas paradas: ícone de pin com número do trecho
- Toque em ponto vazio próximo à rota: mostra confirmação "Adicionar parada aqui?"
- Long press em marcador existente: opções de remover ou editar
- Botão flutuante "✓ Confirmar" aparece quando há mudanças pendentes
- **Mobile:** interação por toque direta
- **Web:** interação por clique + hover para preview do ponto

### Tamanhos — inserção no mapa (mobile)
- Marcadores de parada: mínimo 44dp de área tocável
- Botão "Confirmar" flutuante: mínimo 56dp altura, posicionado acima do bottom nav

## Alternativas de parada — UX
- Botão "Ver alternativas" direto no card da parada — não em menu secundário
- Abre bottom sheet com lista de até 5 opções
- Cada opção: nome, ⭐ avaliação, distância do ponto ideal, badge 24h se aplicável
- Opção atualmente selecionada marcada com ✓ laranja
- "Confirmar troca" aplica e fecha o bottom sheet

---

### Avaliar parada (`avaliar-parada.html`)
- Acessível via botão "★ Avaliar" em cada stop-row do roteiro
- Componente: seletor de 1-5 estrelas + campo de texto para comentário
- Chave única: `(trip_id, user_id, place_id)` — independente por instância da viagem

---

## Hospedagem — UX

### Bloco de pernoite no roteiro
- Aparece ao fim de cada day card (exceto o último dia) — separado por `border-top` tracejado
- Não é parte de nenhum trecho/segmento — é um elemento de nível do dia

#### Estado 1 — Sem hospedagem
- Botão discreto "＋ Adicionar hospedagem" com fundo sutil
- Toque abre a tela `buscar-hospedagem.html`, que oferece busca automática ou inserção manual

#### Estado 2 — Selecionada (não reservada)
- Fundo gradiente azul-escuro (navy)
- Exibe: nome, tipo de hospedagem, avaliação com total de reviews, preço por noite, distância do ponto de referência
- Ações: "🗺 Navegar" · "🌐 Ver link externo" · "✓ Marcar como reservado" (texto verde) · "Trocar"
- "Marcar como reservado" é ação manual — não representa integração com nenhuma plataforma de reservas

#### Estado 3 — Reservada
- Fundo gradiente verde-escuro
- Badge "✓ RESERVADO" em destaque
- Ações: "🗺 Navegar" · "🌐 Ver link externo" · "Desfazer reserva" · "Trocar"
- "Desfazer reserva" volta o bloco para o Estado 2 (selecionada, sem badge de reservado)

### Tela de hospedagem (`buscar-hospedagem.html`)
Disparada pelo botão "Adicionar hospedagem" ou "Trocar" no bloco de pernoite. Oferece dois modos via segmented control no topo:

#### Modo Buscar
- Contexto exibido como informação (não editável na tela): check-in, checkout, cidade
- Campo de local (cidade ou endereço específico) com nota de referência: *"Usando o centro de [Município] como referência. Para refinar, informe um endereço."*
- Painel de preferências (recolhível no mobile, sempre visível na web):
  - Tipo: Qualquer · Hotel/Pousada · Casa/Apartamento
  - Garagem: Não filtrar · Preferencial · Obrigatória
  - Café da manhã: Não filtrar · Preferencial · Obrigatório
  - Hóspedes: contador numérico
- Chips de ordenação: Distância · Avaliação · Preço (padrão: Distância)
- Cada card de resultado exibe:
  - Nome, endereço/bairro, tipo de hospedagem
  - Avaliação + total de reviews, faixa de preço, badge de distância colorido (verde < 1 km · azul 1–3 km · cinza > 3 km)
  - Chips de atributos com indicação de confiabilidade: "🏍️ Garagem confirmada" · "⚠️ Garagem não confirmada" · "☕ Café incluso" · "Café não confirmado"
  - Botões: Selecionar · Ver no Booking (ou Airbnb para Casa/Apto) · Abrir no Maps
- Ao selecionar: bloco de selecionada aparece no topo com nome, meta e datas — permite marcar como reservado diretamente na tela, antes de voltar ao roteiro

#### Modo Inserir manualmente
- Campos: Nome (obrigatório) · Endereço · Link da reserva (opcional) · Observações (opcional) · Toggle "Já está reservado"
- Ao salvar: volta ao roteiro com o Estado 2 (ou Estado 3 se "já reservado" estava marcado)
- Hospedagem manual se comporta de forma idêntica à automática no card do dia

### Referência geográfica para busca
- Se o usuário informou apenas município → Google Geocoding retorna coordenadas do **centro da cidade**
- Se o usuário informou endereço específico → usa geocode do endereço
- Raio de busca: 10 km a partir do ponto de referência
- Avaliação mínima para exibição: 3.8 (menos restritivo que postos — menos opções disponíveis)
- Geocodificação tentada para entradas manuais com endereço; se falhar, hospedagem é salva sem lat/lng e a navegação usa o endereço textual
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 