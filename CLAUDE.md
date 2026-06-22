# MotoRoute Planner — guia do projeto para Claude Code

App de planejamento de viagens de moto de longa distância. Mobile (iOS/Android) + Web, mesma conta, mesmo backend. Stack: **React Native / Expo** (mobile + web a partir do mesmo código) + **Supabase** (Postgres, Auth, Row Level Security) + APIs externas (Google Maps Directions, Google Places, WeatherAPI, Google Geocoding).

Escopo atual: **usuário único por viagem**. Não existe modelo de colaboração/múltiplos membros — isso foi avaliado e descartado. Não reintroduzir tabelas, papéis (owner/editor/viewer) ou lógica de grupo a menos que explicitamente solicitado.

## Estrutura deste pacote

```
docs/
  business-logic.md            regras de negócio — a fonte da verdade para qualquer decisão de comportamento
  database.md                  schema do Supabase: tabelas, colunas, RLS, índices, estratégia de cache
  mobile-ux.md                 diferenças de UX entre mobile (uso em campo) e web (planejamento)
  MotoRoute_MVP_Requisitos.docx  visão de produto original (contexto/motivação, nível mais alto que os .md acima)
prototype/
  index.html                   visualizador — abre os mockups em um frame de celular/browser, navegável
  mobile/*.html                mockup estático de cada tela mobile (HTML+CSS puro, sem framework)
  web/*.html                   mockup estático de cada tela web
  css/mobile.css, css/web.css  estilos dos mockups
app/                           rotas Expo Router (gerado na Fase 0)
src/
  services/supabase.ts         cliente Supabase tipado
  types/database.ts            tipos gerados do schema (supabase gen types)
  domain/                      lógica de negócio pura (segmentEngine, alertEngine)
  platform/                    abstrações mobile/web (navigation, storage)
  theme/colors.ts              paleta de cores do design system
supabase/
  config.toml                  configuração do Supabase CLI (ambiente local Docker)
  migrations/                  migrations versionadas — nunca editar direto no dashboard
  functions/                   Edge Functions (a adicionar futuramente)
.env.example                   template de variáveis de ambiente (commitar)
.env.local                     credenciais do ambiente LOCAL — não commitar
.env                           credenciais de PRODUÇÃO — não commitar
```

## Ambientes de desenvolvimento

O projeto usa **Docker Compose** para rodar toda a stack localmente (Supabase + Expo no mesmo ambiente isolado). Produção usa Supabase Cloud.

| Ambiente | Como rodar | URL do app |
|----------|-----------|-----------|
| **Local** (dev) | `docker compose up` | `http://localhost:8081` |
| **Produção** | Supabase Cloud + build Expo | configurar `.env.production` |

### Arquivos de ambiente

| Arquivo | Propósito | Commitar? |
|---------|-----------|-----------|
| `.env` | Variáveis do Docker Compose local (banco, JWT, API keys) | ❌ não |
| `.env.production` | Credenciais do Supabase Cloud | ❌ não |
| `.env.example` | Template com instruções — copiar para `.env` | ✅ sim |

### Fluxo padrão de desenvolvimento

```bash
# 1. Primeira vez — construir a imagem do Expo
docker compose build expo

# 2. Subir toda a stack (Supabase + Expo)
docker compose up

# Serviços disponíveis após subir:
#   App web:      http://localhost:8081
#   Supabase API: http://localhost:54321
#   Studio:       http://localhost:54323  ← painel visual do banco
#   Inbucket:     http://localhost:54324  ← e-mails de auth (dev)
#   Postgres:     localhost:5432

# 3. Acompanhar logs de um serviço específico
docker compose logs -f expo
docker compose logs -f auth

# 4. Parar tudo (preserva dados do banco no volume Docker)
docker compose down

# 5. Parar e apagar os dados (banco zerado — útil para testar migrations do zero)
docker compose down -v
```

### Migrations com Docker Compose

As migrations ficam em `supabase/migrations/`. Para aplicá-las no banco local:

```bash
# Aplicar todas as migrations no banco local (container db precisa estar rodando)
docker compose exec db psql -U postgres -d postgres \
  -c "\i /docker-entrypoint-initdb.d/migrate.sh"

# Alternativa: usar o Supabase CLI apontando para o Postgres do container
supabase db push --db-url "postgresql://postgres:postgres@localhost:5432/postgres"

# Após alterar o schema, regenerar os tipos TypeScript
docker compose exec expo \
  npx supabase gen types typescript \
  --db-url "postgresql://postgres:postgres@db:5432/postgres" \
  > src/types/database.ts
```

### Painel Studio local

Durante desenvolvimento, acesse `http://localhost:54323` para:
- Inspecionar tabelas e dados
- Testar queries SQL
- Verificar se as políticas RLS estão bloqueando corretamente
- Ver logs de Auth

### Usando Expo Go no celular físico

Por padrão o Metro bundler fica disponível só em `localhost`. Para usar Expo Go no celular:

```bash
# 1. Descobrir o IP da sua máquina
ipconfig   # Windows — copiar o "Endereço IPv4"

# 2. Subir com o IP definido
HOST_IP=192.168.1.100 docker compose up
```

O celular precisa estar na mesma rede Wi-Fi que o seu PC.

### Hot reload e cache — regras obrigatórias

O projeto roda em **Windows + Docker + WSL**. O WSL não propaga eventos `inotify` para o filesystem do container, então o Metro não detecta mudanças por padrão. A configuração abaixo (já presente no `docker-compose.yml`) resolve isso via polling:

```yaml
CHOKIDAR_USEPOLLING: "true"
CHOKIDAR_INTERVAL: "500"
```

Com isso em vigor, as regras são:

| O que mudou | O que fazer | Por quê |
|---|---|---|
| Código frontend (`app/`, `src/`) | **Nada** — Metro detecta via polling e envia HMR ao browser | Chokidar polling ativo |
| API route (`app/api/*+api.ts`) | **Nada** — Metro recompila na próxima requisição | Mesmo mecanismo de polling |
| Arquivo `.env` | `docker compose up -d expo` | `restart` não relê o `.env`; só `up` recria o container com os novos valores |
| `package.json` / dependências | `docker compose build expo && docker compose up -d expo` | Rebuild da imagem necessário |
| Cache do Metro corrompido | `docker compose exec expo npx expo start --clear` | Limpa o transform cache em `.metro-cache/` |

**Nunca sugerir `docker compose restart expo` para pegar mudanças de código.** O polling torna isso desnecessário. `restart` só se justifica se o processo Metro travou.

**Cache do Metro**: O transform cache fica em `.metro-cache/` (dentro do volume bind-mount), persistindo entre restarts de container para evitar recompilação completa a cada início. Essa pasta está no `.gitignore`.

**Hard reload no browser** (`Ctrl+Shift+R`): não funciona de forma confiável neste projeto. Em `web.output: "server"`, o Expo Router faz o reload in-place e o browser mantém o bundle antigo em memória mesmo com hard reload. O que funciona: **navegar para outra rota (`/`) e voltar** — isso força o browser a baixar o bundle novo do servidor. Nunca usar `location.reload()` no código para forçar atualizações.

## Ordem recomendada de leitura

1. `docs/MotoRoute_MVP_Requisitos.docx` — para entender o produto e o problema que ele resolve.
2. `docs/database.md` — schema completo; use como base para as migrations em `supabase/migrations/`.
3. `docs/business-logic.md` — toda regra de negócio (validação de km entre paradas, alertas de clima/autonomia, ciclo de vida da viagem, check-in, hospedagem, cache). Qualquer lógica implementada deve seguir exatamente o que está aqui.
4. `docs/mobile-ux.md` — regras de UX específicas de plataforma (tamanhos de toque, dark mode na viagem ativa, o que existe só no mobile vs. só na web).
5. `prototype/index.html` — abra no browser para navegar visualmente por cada tela antes de implementar o componente correspondente. **Os mockups são referência visual/fluxo, não código de produção** — são HTML/CSS estático sem estado real, sem chamadas de API, sem framework. Servem para replicar layout, hierarquia visual e copy, não para reaproveitar como componente.

## Por que este pacote está organizado assim

- **Separação docs/ vs. prototype/** deixa claro o que é especificação (regras, schema — texto que Claude Code deve ler integralmente antes de gerar código) e o que é referência visual (HTML estático — para consulta pontual tela a tela, não para leitura sequencial).
- **`database.md` tem front-matter `paths:`** apontando para `supabase/migrations/**`, `src/types/**`, `src/services/supabase*` — o schema só é relevante quando se está tocando nesses diretórios.
- **Cada arquivo .md é autocontido e sem dependência de pastas externas** — o projeto foi consolidado para ter uma única fonte de verdade, sem ramificações Fase 1/Fase 2.
- **Os mockups HTML usam nomes de arquivo previsíveis** (`nova-viagem-1.html`, `roteiro-lista.html`, `viagem-ativa.html` etc.) que correspondem 1:1 às telas descritas em `business-logic.md` e `mobile-ux.md`.
- **Nada de protótipos legados ou versões antigas**: este pacote contém só a versão final/consolidada.

## Convenções a seguir ao gerar código

- RLS habilitado em toda tabela nova; política padrão é "usuário só acessa os próprios dados" (ver `database.md`).
- `uuid` como PK, `timestamptz` para qualquer timestamp.
- Nunca estimar distância/tempo de rota — sempre Google Directions API.
- Navegação ("Navegar até aqui") sempre redireciona para GPS externo (deep link mobile / nova aba web) — nunca implementar navegação dentro do app.
- Mobile = uso em campo (telas com fonte grande, alto contraste, sem scroll na tela de viagem ativa). Web = planejamento (mouse/teclado, layouts mais densos). Ver `mobile-ux.md` antes de portar qualquer tela entre plataformas.
- Toda migration nova deve ser testada localmente (`docker compose down -v && docker compose up`) antes de fazer `supabase db push` para produção.
- Após alterar o schema, sempre regenerar `src/types/database.ts` (ver comando em "Migrations com Docker Compose" acima).
- O banco local roda no container `db` — conectar via `localhost:5432` (fora do Docker) ou `db:5432` (dentro da rede Docker).
