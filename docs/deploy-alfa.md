---
atualizado_em: 2026-07-02
status: vigente
---

# Deploy — MotoRoute Alfa

> **Ver também:** [`../../docs/deploy-admin.md`](../../docs/deploy-admin.md) · [`../../docs/deploy-site.md`](../../docs/deploy-site.md) — compartilham Vercel + Registro.br + Supabase.

## Infraestrutura atual (26/06/2026)

Tudo abaixo já existe e está em produção. Esta seção é a referência rápida.

### GitHub
| Campo | Valor |
|-------|-------|
| Conta | `avrossini` |
| Repositório | `github.com/avrossini/motoroute` (privado) |
| Branch principal | `main` |
| Último commit | `6c06159` — alertas de expedição e lógica multi-day |

Push na `main` → Vercel faz deploy automático em ~1 minuto. Sem ação adicional.

---

### Supabase Cloud (banco de produção)
| Campo | Valor |
|-------|-------|
| Project ref | `udmqeydzuiilcsdzuuti` |
| URL | `https://udmqeydzuiilcsdzuuti.supabase.co` |
| Painel | https://supabase.com/dashboard/project/udmqeydzuiilcsdzuuti |
| Credenciais locais | `.env.production` (não versionado) |
| Migrations | Aplicadas — banco ativo com dados reais |
| Auth Site URL | ⚠️ ainda aponta para localhost — atualizar após DNS propagar (ver pendências) |

---

### Vercel (web)
| Campo | Valor |
|-------|-------|
| Conta | `avrossini1` (plano Hobby — gratuito) |
| Projeto | `motoroute` |
| Painel | https://vercel.com/avrossini1/motoroute |
| URL temporária | https://motoroute-eosin.vercel.app ✅ funcionando |
| URL definitiva | `https://app.motoroute.com.br` ⏳ aguardando DNS |
| Deploy automático | Sim — conectado ao GitHub, branch `main` |
| Vercel CLI | Instalado globalmente (`vercel` no terminal), logado como `avrossini1` |

**Variáveis de ambiente configuradas no Vercel:**
| Nome | Ambientes |
|------|-----------|
| `EXPO_PUBLIC_SUPABASE_URL` | Production + Preview |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Production + Preview |
| `EXPO_PUBLIC_WEATHER_API_KEY` | Production + Preview |

**Build settings (via `vercel.json`):**
- Build command: `npx expo export -p web`
- Output directory: `dist/client`
- SSR adapter: `api/index.js` → `@expo/server/adapter/vercel`

---

### Domínio
| Campo | Valor |
|-------|-------|
| Domínio | `motoroute.com.br` |
| Registrador | Registro.br |
| Data de registro | 26/06/2026 |
| Data de expiração | 26/06/2031 |
| DNS | Servidores do próprio Registro.br |
| Status da zona DNS | ⏳ em transição pós-registro (~2h após criação) |

**Estrutura de subdomínios:**
| URL | Destino | Status |
|-----|---------|--------|
| `app.motoroute.com.br` | Vercel — a aplicação | ⏳ aguardando CNAME |
| `motoroute.com.br` | Hotsite/landing page | 🔜 fora do escopo desta alfa |

---

### Desenvolvimento local
| Campo | Valor |
|-------|-------|
| Diretório | `C:\Users\rossi\Dev\Bike_Trip_Planner` |
| Iniciar | `docker compose up` |
| App local | http://localhost:8081 |
| Supabase local | http://localhost:54321 |
| Container Metro | `motoroute-expo-1` |
| Após editar arquivo | `docker compose restart expo` (limpa cache in-memory do Metro) |

---

## Pendências para completar a alfa

### 1. DNS — CNAME para `app.motoroute.com.br`
> A zona DNS do Registro.br fica disponível ~2h após o registro do domínio.
> Quando liberar, criar o seguinte registro em registro.br → Painel → motoroute.com.br → Configurar zona DNS → Nova Entrada:

| Tipo | Nome/Host | Valor/Destino |
|------|-----------|---------------|
| CNAME | `app` | `78937e94d3588eff.vercel-dns-017.com.` |

Após salvar: Vercel detecta automaticamente e emite o certificado SSL. `app.motoroute.com.br` fica ativo com HTTPS em até 30 minutos.

### 2. Supabase Auth — atualizar URL após DNS propagar
Após `app.motoroute.com.br` estar ativo com SSL:

Painel Supabase → Authentication → URL Configuration:
- **Site URL:** `https://app.motoroute.com.br`
- **Redirect URLs:**
  - `https://app.motoroute.com.br/auth/callback`
  - `motoroute://auth/callback` (deep link mobile — para quando o APK existir)

### 3. APK Android (EAS Build) — quando quiser
Pré-requisitos (ainda não feitos):
- Criar conta em https://expo.dev (pode usar o GitHub `avrossini`)
- Instalar EAS CLI: `npm install -g eas-cli`

Quando pronto, basta me avisar e eu rodo:
```bash
eas login
eas build --platform android --profile preview
```
Leva 5–15 minutos. Trago o link do APK quando terminar.

---

## Checklist

**GitHub**
- [x] Conta `avrossini` criada
- [x] Repositório `github.com/avrossini/motoroute` (privado)
- [x] Código subido, deploy automático configurado

**Supabase Cloud**
- [x] Projeto `udmqeydzuiilcsdzuuti` criado e ativo
- [x] Migrations aplicadas no banco de produção
- [x] Credenciais em `.env.production` e nas env vars do Vercel
- [ ] Auth URL atualizado para `https://app.motoroute.com.br`

**Vercel (web)**
- [x] Conta `avrossini1` criada (plano Hobby)
- [x] Projeto `motoroute` conectado ao GitHub
- [x] Deploy automático ativo — `motoroute-eosin.vercel.app` ✅ funcionando
- [x] Variáveis de ambiente configuradas (4 vars)
- [x] Domínio `app.motoroute.com.br` adicionado ao projeto (aguardando DNS)
- [ ] CNAME criado no Registro.br → DNS propaga → SSL emitido automaticamente

**APK Android**
- [ ] Conta Expo criada (expo.dev)
- [ ] EAS CLI instalado (`npm install -g eas-cli`)
- [ ] APK gerado e link enviado para testers

**Distribuição**
- [ ] Links enviados para testers (`https://app.motoroute.com.br` + link do APK)

---

## Como publicar uma nova versão

**Web — automático:**
Qualquer `git push` para `main` dispara deploy na Vercel em ~1 minuto. Nenhuma ação necessária.

**APK — quando quiser atualizar:**
1. Me avise que há mudanças prontas para o mobile
2. Eu rodo `eas build --platform android --profile preview`
3. Você envia o novo link para os testers (válido 30 dias; gero novo se expirar)

---

## Texto para enviar aos testers (copie e mande)

**MotoRoute — Acesso alfa**

Você foi convidado para testar o MotoRoute antes do lançamento!

**No computador (planejamento de rotas):**
https://app.motoroute.com.br

**No celular Android (uso em campo):**
[LINK DO APK — gerado pelo EAS]

Para instalar no celular:
1. Acesse o link no celular e baixe o arquivo `.apk`
2. Abra o arquivo baixado
3. Se aparecer "Instalação bloqueada": toque em Configurações → ative "Permitir desta fonte" → volte e instale
4. Crie sua conta com email e senha — funciona tanto no app quanto no site

---

## Problemas comuns

| Sintoma | Quem resolve |
|---------|-------------|
| App não conecta ao banco | Claude — verifico credenciais do Supabase |
| Tester não consegue criar conta | Claude — verifico Auth URLs no Supabase |
| "Instalação bloqueada" no Android | Você — item 3 das instruções de instalação acima |
| Site com erro após deploy | Claude — verifico logs no painel do Vercel |
| Build do APK falhou | Claude — me envie a mensagem de erro |
| Link do APK expirou (30 dias) | Claude — gero novo build |
| `app.motoroute.com.br` não abre | Claude — verifico propagação DNS e SSL no Vercel |
