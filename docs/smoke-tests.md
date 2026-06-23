# MotoRoute — Smoke Tests (Testes Manuais de Fumaça)

Protocolo de testes para validar o funcionamento do app após cada deploy ou alteração significativa.
Deve ser executado tanto na **versão web** (`https://motoroute-eosin.vercel.app`) quanto no **APK Android**.

---

## Como usar este arquivo

Cada teste tem:
- **Pré-condição:** estado necessário antes de começar
- **Passos:** exatamente o que fazer, passo a passo
- **Resultado esperado:** o que deve aparecer/acontecer

Marque cada teste como ✅ (passou), ❌ (falhou) ou ⚠️ (passou parcialmente).
Se falhou, anote a mensagem de erro exata.

---

## BLOCO A — Autenticação

### A1 — Cadastro de nova conta

**Pré-condição:** nenhuma conta cadastrada com o e-mail de teste  
**Passos:**
1. Abrir o app/site
2. Na tela de login, tocar em "Criar conta"
3. Preencher: nome completo, e-mail de teste (`teste+<data>@gmail.com`), senha com 8+ caracteres
4. Tocar em "Criar conta"

**Resultado esperado:**
- App redireciona para a tela Início (tabs visíveis: Início, Viagens, Perfil)
- Nome do usuário aparece na aba Perfil
- Nenhuma mensagem de erro

---

### A2 — Login com conta existente

**Pré-condição:** conta criada no teste A1  
**Passos:**
1. Se estiver logado: ir em Perfil → Sair
2. Preencher e-mail e senha da conta criada
3. Tocar em "Entrar"

**Resultado esperado:**
- App redireciona para a tela Início
- Sem loop de login ou tela em branco

---

### A3 — Login com credenciais erradas

**Pré-condição:** qualquer estado  
**Passos:**
1. Na tela de login, preencher e-mail correto e senha errada
2. Tocar em "Entrar"

**Resultado esperado:**
- Mensagem de erro visível ("Credenciais inválidas" ou similar)
- App NÃO navega para Início
- Campos não são limpos automaticamente

---

### A4 — Logout

**Pré-condição:** usuário logado  
**Passos:**
1. Ir para a aba "Perfil"
2. Tocar em "Sair" (ou "Logout")
3. Confirmar se houver diálogo

**Resultado esperado:**
- App volta para tela de login
- Reabrir o app/aba não mantém sessão

---

## BLOCO B — Perfil e preferências

### B1 — Cadastrar moto

**Pré-condição:** usuário logado, nenhuma moto cadastrada  
**Passos:**
1. Ir em Perfil → "Minha Moto" (ou botão de adicionar moto)
2. Preencher: apelido, marca, modelo, ano, litros do tanque, consumo km/L
3. Salvar

**Resultado esperado:**
- Moto aparece listada no perfil
- Dados salvos são exibidos corretamente (sem valores zerados ou trocados)

---

### B2 — Alterar preferências de distância

**Pré-condição:** usuário logado  
**Passos:**
1. Ir em Perfil → "Preferências"
2. Alterar "Distância mínima entre paradas" para 150 km
3. Alterar "Distância máxima entre paradas" para 250 km
4. Salvar
5. Sair das preferências e voltar

**Resultado esperado:**
- Valores 150 km e 250 km persistem após reabrir a tela
- Sem erro de validação

---

## BLOCO C — Criação de viagem

### C1 — Criar Expedição (multi_day) simples

**Pré-condição:** usuário logado  
**Passos:**
1. Ir em "Viagens" → botão de nova viagem ("+")
2. Escolher tipo "Expedição"
3. Preencher nome: "Teste SP-RJ"
4. Origem: "São Paulo, SP"
5. Destino: "Rio de Janeiro, RJ"
6. Data de saída: amanhã
7. Data de retorno: 3 dias depois
8. Tocar em "Criar" / "Gerar roteiro"

**Resultado esperado:**
- Roteiro gerado com pelo menos 1 parada intermediária sugerida
- Distâncias em km exibidas (não zeros, não "undefined")
- Tempos estimados exibidos
- Nenhuma mensagem de erro de API

---

### C2 — Criar Rolê (day_trip) ida e volta

**Pré-condição:** usuário logado  
**Passos:**
1. Nova viagem → tipo "Rolê"
2. Nome: "Teste Passeio"
3. Origem: "Campinas, SP"
4. Destino: "Atibaia, SP"
5. Data: hoje ou amanhã
6. Marcar "Ida e volta"
7. Criar

**Resultado esperado:**
- Roteiro com trecho de ida + trecho de volta
- Data de retorno igual à data de saída (mesmo dia)
- Distâncias e tempos calculados para ambos os trechos

---

### C3 — Validação de trecho fora do intervalo mínimo/máximo

**Pré-condição:** preferências com mínimo 100 km / máximo 200 km (padrão)  
**Passos:**
1. Criar Rolê com origem e destino muito próximos (ex: "São Paulo" → "Santo André, SP")
2. Observar avisos

**Resultado esperado:**
- App exibe alerta de trecho abaixo do mínimo configurado
- Trecho não é bloqueado (alerta é informativo)

---

## BLOCO D — Roteiro e paradas

### D1 — Visualizar roteiro gerado

**Pré-condição:** viagem criada (teste C1)  
**Passos:**
1. Na lista "Viagens", tocar na viagem "Teste SP-RJ"
2. Verificar tela de detalhe/roteiro

**Resultado esperado:**
- Lista de paradas em ordem (origem → paradas → destino)
- Cada segmento mostra distância em km e tempo estimado
- Ícone de clima exibido se viagem estiver dentro de 7 dias

---

### D2 — Adicionar parada manual ao roteiro

**Pré-condição:** viagem "Teste SP-RJ" aberta  
**Passos:**
1. No roteiro, tocar em "Adicionar parada" (ou ícone "+")
2. Buscar por "Resende, RJ"
3. Confirmar a inserção

**Resultado esperado:**
- "Resende, RJ" aparece no roteiro na posição correta (entre SP e RJ)
- Distâncias e tempos são recalculados automaticamente
- Total da viagem é atualizado

---

### D3 — Remover parada do roteiro

**Pré-condição:** viagem com parada "Resende, RJ" (teste D2)  
**Passos:**
1. Pressionar a parada "Resende, RJ"
2. Selecionar "Remover" ou deslizar para excluir

**Resultado esperado:**
- Parada é removida
- Distâncias recalculadas automaticamente
- Roteiro não fica com gaps ou erros

---

## BLOCO E — Viagem ativa

### E1 — Iniciar viagem

**Pré-condição:** viagem no status "planned"  
**Passos:**
1. Abrir a viagem "Teste SP-RJ"
2. Tocar em "Iniciar viagem"
3. Confirmar se houver diálogo

**Resultado esperado:**
- Status da viagem muda para "active"
- Tela de viagem ativa é exibida (paradas com checkboxes/botões de check-in)
- Card verde "EM ANDAMENTO" aparece na tela Início

---

### E2 — Fazer check-in em uma parada

**Pré-condição:** viagem ativa (teste E1)  
**Passos:**
1. Na tela de viagem ativa, tocar no botão de check-in da primeira parada
2. Confirmar horário (aceitar o automático ou digitar manual)

**Resultado esperado:**
- Parada marcada como visitada (ícone/cor diferente)
- Horários estimados das próximas paradas são recalculados
- Sem erro ao salvar

---

### E3 — Pular parada

**Pré-condição:** viagem ativa com pelo menos 2 paradas pendentes  
**Passos:**
1. Na parada seguinte, tocar em "Pular" (não fazer check-in)
2. Confirmar

**Resultado esperado:**
- Parada marcada como "pulada" (visualmente distinta de visitada e pendente)
- Viagem continua normalmente para as próximas paradas

---

### E4 — Concluir viagem

**Pré-condição:** viagem ativa  
**Passos:**
1. Na tela de viagem ativa, tocar em "Concluir viagem"
2. Avaliar a viagem (1–5 estrelas) e opcionalmente adicionar nota
3. Confirmar

**Resultado esperado:**
- Status muda para "completed"
- Viagem aparece em "Viagens" com status concluída
- Card verde some da tela Início

---

### E5 — Cancelar viagem ativa

**Pré-condição:** viagem ativa com check-ins parciais  
**Passos:**
1. Na tela de viagem ativa, tocar em "Cancelar viagem"
2. Confirmar o cancelamento

**Resultado esperado:**
- Status volta para "planned"
- Check-ins anteriores são preservados
- Viagem aparece na lista com status "planned"

---

## BLOCO F — Hospedagem

### F1 — Adicionar hospedagem a uma expedição

**Pré-condição:** viagem multi_day "Teste SP-RJ" no status planned  
**Passos:**
1. Abrir a viagem → seção de hospedagem / botão "Adicionar hospedagem"
2. Preencher: nome "Hotel Teste", localização "Volta Redonda, RJ", data da noite, link opcional
3. Salvar

**Resultado esperado:**
- Hospedagem aparece no roteiro no dia correto
- Não há duplicação do registro

---

## BLOCO G — Dados e persistência

### G1 — Dados persistem após fechar e reabrir

**Pré-condição:** viagem criada (teste C1)  
**Passos:**
1. Fechar completamente o app (ou fechar a aba no browser)
2. Reabrir
3. Ir em "Viagens"

**Resultado esperado:**
- Viagem "Teste SP-RJ" ainda existe com todas as paradas

---

### G2 — Dados sincronizam entre web e mobile

**Pré-condição:** conta logada em ambas as plataformas simultaneamente  
**Passos:**
1. Criar uma viagem na versão web
2. Abrir o app Android (sem reiniciar)
3. Ir em "Viagens"

**Resultado esperado:**
- Viagem criada no web aparece no mobile em até 30 segundos (ou após pull-to-refresh)

---

## BLOCO H — Navegação e UX

### H1 — Botão "Navegar" abre GPS externo

**Pré-condição:** viagem ativa com ao menos uma parada  
**Passos:**
1. Na tela de viagem ativa, tocar em "Navegar" em qualquer parada

**Resultado esperado:**
- **Mobile:** abre Google Maps ou Waze com o endereço da parada como destino
- **Web:** abre nova aba com o Google Maps apontando para o destino
- App NÃO tenta navegar internamente

---

### H2 — Tela Início mostra estado correto sem viagem ativa

**Pré-condição:** nenhuma viagem com status "active"  
**Passos:**
1. Ir para a aba "Início"

**Resultado esperado:**
- Card verde "EM ANDAMENTO" NÃO aparece
- Tela não exibe erros ou loading infinito

---

## Ordem sugerida de execução

Para um ciclo completo do zero (conta nova):

```
A1 → A4 → A2 → B1 → B2 → C1 → D1 → D2 → D3 → E1 → E2 → E3 → E4 → G1
```

Para validação rápida pós-deploy (conta já existente):

```
A2 → C1 → E1 → E2 → E4 → G1 → H1
```

---

## Registro de execução

| Data | Plataforma | Executor | Testes ✅ | Testes ❌ | Observações |
|------|-----------|---------|----------|----------|-------------|
|      | Web / Android |  |  |  |  |
