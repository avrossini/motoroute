# MotoRoute App — Telas e Funcionalidades

## Jornada do usuário

```
Cadastro → Cadastra a moto → Cria uma viagem → Gera roteiro →
Inicia a viagem → Faz check-ins → Conclui a viagem → Dá feedback
```

---

## Telas por área

### Autenticação (`app/(auth)/`)

O usuário entra com **magic link** (Supabase envia um link por e-mail, sem precisar de senha). Durante o alfa, é necessário ter um código de convite para se cadastrar.

---

### Tela inicial — Mapa (`app/(tabs)/index.tsx`)

A tela principal do app. Mostra um mapa interativo com:
- Posição atual do usuário
- Rota da viagem ativa (se houver uma em andamento)
- Paradas sugeridas ao longo do caminho

---

### Minhas Viagens (`app/(tabs)/viagens.tsx`)

Lista todas as viagens do usuário com status:
- **Planejada** — criada mas não iniciada
- **Em andamento** — viagem ativa
- **Pausada** — interrompida temporariamente
- **Concluída** — finalizada
- **Cancelada** — descartada

---

### Criar / Detalhar Viagem (`app/trip/`)

Fluxo de criação de viagem:
1. Usuário digita origem e destino
2. App chama `geocode+api` para converter endereços em coordenadas
3. App chama `directions+api` para calcular a rota
4. App chama `generate-segments+api` para criar o roteiro com paradas, hospedagem e clima
5. Usuário revisa o roteiro e confirma

O roteiro gerado inclui:
- **Segmentos** — trechos da viagem (ex: "São Paulo → Campinas")
- **Paradas sugeridas** — postos, restaurantes, pontos turísticos
- **Hospedagem** — hotéis/pousadas próximos ao fim de cada dia
- **Clima** — previsão do tempo para cada trecho

---

### Paradas (`app/stop/`) e Hospedagem (`app/lodging/`)

Telas de detalhe de uma parada ou hospedagem específica, mostrando fotos (via `places-photos+api`), endereço e informações do lugar.

---

### Minha Moto (`app/minha-moto.tsx`)

O usuário cadastra a(s) moto(s) que possui: marca, modelo, ano, cilindrada. Essa informação é usada para personalizar sugestões (ex: autonomia estimada entre paradas para abastecer).

---

### Preferências (`app/preferencias.tsx`)

Configurações do usuário: tipo de estrada preferida (asfalto / terra), ritmo de viagem (rápido / tranquilo), etc.

---

### Perfil (`app/(tabs)/perfil.tsx`)

Dados do usuário, opção de sair da conta e link para suporte.

---

### Check-ins

Dentro de uma viagem ativa, o usuário pode registrar check-ins em paradas. Esses registros ficam salvos no banco e servem para o histórico da viagem.

---

## Fluxo de feedback

O usuário pode enviar feedback diretamente do app (botão no perfil ou nas telas de viagem). Os tipos disponíveis são:

| Tipo | Quando usar |
|---|---|
| Bug | Algo não funcionou |
| Sugestão | Ideia de melhoria |
| Dúvida | Não entendeu como usar |
| Elogio | Algo que gostou |
| Dor de planejamento | Dificuldade específica no planejamento de viagem |

Os feedbacks aparecem no painel admin para triagem pela equipe.
