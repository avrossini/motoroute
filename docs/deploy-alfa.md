# Plano de Deploy — Versão Alfa

Guia para publicar o MotoRoute como APK Android (mobile) e site web — ambos conectados ao mesmo banco de produção, mesma conta do usuário.

## Como usar este guia

Cada passo está marcado com quem executa:

> **👤 VOCÊ FAZ** — ação que só você pode fazer: criar conta, digitar senha, instalar programa, enviar mensagem  
> **🌐 CLAUDE FAZ (browser)** — eu navego e clico no site pelo Claude in Chrome  
> **🤖 CLAUDE FAZ (terminal)** — eu executo o comando ou edito o arquivo

Quando aparecer **👤 VOCÊ FAZ**, siga as instruções e me avise quando terminar. No resto, só acompanhe.

---

## Visão geral

```
[0] GitHub          →   [1] Supabase Cloud   →   [2] Configurar app
  repositório do código    banco na nuvem           arquivos e env

  👤 criar conta          👤 criar conta          🤖 Claude edita tudo
  🤖 Claude sobe código   🌐 Claude configura
  
       ↓                                                  ↓
[3] EAS Build                                    [4] Vercel (web)
  APK para Android                                 site no browser

  🤖 Claude roda build                            👤 criar conta
  👤 compartilhar link                            🌐 Claude configura
                                                  🌐 Claude faz deploy
       ↓
[5] Distribuição
  testers instalam APK + acessam o site
  👤 você envia links
```

---

## PARTE 0 — Git e GitHub (repositório do código)

> **Por que é necessário:** o código precisa estar em um repositório Git para o Vercel fazer deploy automático. Hoje o projeto não tem Git configurado.

---

### Passo 0.1 — Criar conta no GitHub

> **👤 VOCÊ FAZ** — criar conta exige login pessoal

1. Abra **https://github.com** no Chrome
2. Clique em **"Sign up"**
3. Siga o fluxo: email → senha → nome de usuário → verificar email
4. Na pergunta sobre plano, escolha **"Free"**

**Avise quando estiver logado e me diga seu nome de usuário do GitHub.**

---

### Passo 0.2 — Criar o repositório

> **🌐 CLAUDE FAZ (browser)**

Vou navegar até o GitHub, criar um repositório chamado `motoroute` (privado) e me preparar para receber o código.

---

### Passo 0.3 — Inicializar Git e subir o código

> **🤖 CLAUDE FAZ (terminal)**

```bash
git init
git add .
git commit -m "Initial commit — alfa"
git remote add origin https://github.com/SEU_USUARIO/motoroute.git
git push -u origin main
```

> `.env`, `.env.production` e `.env.local` já estão no `.gitignore` — as credenciais não vão para o GitHub.

---

## PARTE 1 — Supabase Cloud (banco de produção)

> **Por que é necessário:** O banco atual roda no Docker na sua máquina. Ninguém de fora consegue acessar. O Supabase Cloud é o mesmo banco, mas hospedado na internet.

---

### Passo 1.1 — Criar conta no Supabase

> **👤 VOCÊ FAZ**

1. Abra **https://supabase.com** no Chrome
2. Clique em **"Start your project"**
3. Clique em **"Sign in with GitHub"** — use a mesma conta do passo anterior
4. Autorize o acesso quando pedido

**Avise quando estiver logado.**

---

### Passo 1.2 — Criar o projeto de produção

> **🌐 CLAUDE FAZ (browser)** + **👤 VOCÊ FAZ** apenas: digitar a senha do banco

Vou navegar até o painel e preencher o formulário de criação do projeto. Quando chegar no campo de senha do banco, vou parar e pedir que você a defina — porque a senha é sua.

> Sugestão: use um gerador de senhas ou algo como `Moto@2026!Prod`. Anote em lugar seguro.

Após você salvar a senha, eu retomo e concluo.

---

### Passo 1.3 — Copiar as credenciais do projeto

> **🌐 CLAUDE FAZ (browser)**

Após o projeto ficar ativo, vou navegar até Settings → API e copiar:
- Project URL
- Anon key
- Service role key
- Reference ID (Settings → General)

---

### Passo 1.4 — Aplicar as migrations no banco de produção

> **🤖 CLAUDE FAZ (terminal)**

```bash
supabase login
supabase link --project-ref ID_DO_PROJETO
supabase db push
```

O `supabase login` abre o browser pedindo autorização — você só clica em **"Authorize"**.

---

### Passo 1.5 — Configurar Auth (URLs permitidas)

> **🌐 CLAUDE FAZ (browser)**

Vou navegar até Authentication → URL Configuration e configurar:
- Site URL: URL do Vercel (definida na Parte 4 — voltamos aqui depois)
- Redirect URLs: `motoroute://auth/callback` (mobile) + URL do Vercel + `/auth/callback` (web)

---

## PARTE 2 — Configurar o app

> **🤖 CLAUDE FAZ (terminal + arquivos)**

Com as credenciais coletadas, vou:
- Criar `.env.production` com URL e anon key do Supabase Cloud
- Ajustar `app.json` (nome, ícone, package Android, bundle ID iOS)
- Verificar se `src/services/supabase.ts` usa variáveis de ambiente corretamente
- Criar `eas.json` com perfil `preview` (APK) e `production` (loja futura)
- Subir as alterações para o GitHub

---

## PARTE 3 — EAS Build (APK Android)

### Passo 3.1 — Criar conta no Expo

> **👤 VOCÊ FAZ**

1. Abra **https://expo.dev** no Chrome
2. Clique em **"Sign Up"**
3. Escolha **"Continue with GitHub"** — usa a mesma conta
4. Autorize

**Avise quando estiver logado e me diga seu nome de usuário do Expo.**

---

### Passo 3.2 — Instalar o EAS CLI

> **👤 VOCÊ FAZ** — instalação de programa no seu PC

Abra o **PowerShell** (tecla Windows → digite "PowerShell" → Enter) e rode:

```
npm install -g eas-cli
```

Aguarde terminar. Quando o cursor voltar, está pronto.

**Avise quando terminar.**

---

### Passo 3.3 — Autenticar e gerar o APK

> **🤖 CLAUDE FAZ (terminal)** + **👤 VOCÊ FAZ** apenas: clicar em "Authorize" no browser

```bash
eas login
eas build --platform android --profile preview
```

Leva entre 5 e 15 minutos na nuvem. Quando terminar, eu trago o link do APK aqui.

---

## PARTE 4 — Vercel (versão web)

> **Por que é necessário:** o app tem uma versão web para planejamento de rotas no computador. O Vercel hospeda essa versão e a mantém atualizada automaticamente a cada novo commit no GitHub.

---

### Passo 4.1 — Criar conta na Vercel

> **👤 VOCÊ FAZ**

1. Abra **https://vercel.com** no Chrome
2. Clique em **"Sign Up"**
3. Escolha **"Continue with GitHub"** — usa a mesma conta
4. Autorize o acesso
5. Quando perguntar sobre plano, escolha **"Hobby"** (gratuito)

**Avise quando estiver logado.**

---

### Passo 4.2 — Conectar o repositório e configurar o deploy

> **🌐 CLAUDE FAZ (browser)**

Vou navegar pelo painel da Vercel e:
1. Importar o repositório `motoroute` do GitHub
2. Configurar o framework como **Expo**
3. Definir as variáveis de ambiente de produção:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. Disparar o primeiro deploy

Quando terminar, você ganha uma URL pública como `https://motoroute.vercel.app` (ou escolhemos um nome personalizado).

---

### Passo 4.3 — Atualizar Auth com a URL do Vercel

> **🌐 CLAUDE FAZ (browser)**

Volto ao Supabase e completo o Passo 1.5 agora que a URL da Vercel existe:
- Site URL: `https://motoroute.vercel.app`
- Redirect URLs: adiciono `https://motoroute.vercel.app/auth/callback`

---

## PARTE 5 — Distribuição para testers

### Passo 5.1 — Compartilhar

> **👤 VOCÊ FAZ**

Você terá dois links para enviar:
- **APK Android:** link gerado pelo EAS (válido 30 dias; se expirar, eu gero novo)
- **Web:** `https://motoroute.vercel.app` (permanente, sempre atualizado)

---

### Passo 5.2 — Texto para enviar aos testers (copie e mande)

---

**MotoRoute — Acesso alfa 🏍**

Você foi convidado para testar o MotoRoute antes do lançamento!

**No computador (planejamento de rotas):**
👉 https://motoroute.vercel.app

**No celular Android (uso em campo):**
👉 [LINK DO APK]

Para instalar no celular:
1. Acesse o link no celular e baixe o arquivo `.apk`
2. Abra o arquivo baixado
3. Se aparecer "Instalação bloqueada": toque em Configurações → ative "Permitir desta fonte" → volte e instale
4. Crie sua conta com email e senha — funciona tanto no app quanto no site

Qualquer bug ou sugestão, me manda mensagem. 🙏

---

## PARTE 6 — iOS (para depois do alfa)

> **Não necessário agora.** Exige $99/ano para Apple Developer Program.

Quando quiser:

> **👤 VOCÊ FAZ**
1. Acesse **https://developer.apple.com/programs/enroll/**
2. Pague a anuidade
3. Aguarde aprovação (1–2 dias úteis)
4. Me avise — cuido do build e envio para TestFlight

---

## Checklist — onde estamos

**GitHub**
- [ ] **0.1** Conta GitHub criada — 👤 você
- [ ] **0.2** Repositório `motoroute` criado — 🌐 Claude
- [ ] **0.3** Código subido para o GitHub — 🤖 Claude

**Supabase Cloud**
- [ ] **1.1** Conta Supabase criada — 👤 você
- [ ] **1.2** Projeto `motoroute-prod` criado — 🌐 Claude (você define a senha)
- [ ] **1.3** Credenciais copiadas — 🌐 Claude
- [ ] **1.4** Migrations aplicadas — 🤖 Claude
- [ ] **1.5** Auth configurado — 🌐 Claude (após Parte 4)

**App**
- [ ] **2.x** Arquivos configurados — 🤖 Claude

**EAS Build (APK)**
- [ ] **3.1** Conta Expo criada — 👤 você
- [ ] **3.2** EAS CLI instalado — 👤 você
- [ ] **3.3** APK gerado — 🤖 Claude

**Vercel (web)**
- [ ] **4.1** Conta Vercel criada — 👤 você
- [ ] **4.2** Deploy configurado e publicado — 🌐 Claude
- [ ] **4.3** Auth atualizado com URL do Vercel — 🌐 Claude

**Distribuição**
- [ ] **5.1** Links enviados para testers — 👤 você

---

## Como publicar uma nova versão

**Web** — automático: a cada commit que eu fizer no GitHub, o Vercel publica sozinho em ~2 minutos. Nenhuma ação necessária.

**Mobile** — quando quiser atualizar o APK:
1. Me avise que há mudanças prontas
2. **🤖 CLAUDE FAZ:** roda `eas build --platform android --profile preview`
3. **👤 VOCÊ FAZ:** envia o novo link para os testers

---

## Problemas comuns

| Sintoma | Quem resolve |
|---------|-------------|
| App/site não conecta ao banco | 🤖 Claude — verifico credenciais do Supabase |
| "Instalação bloqueada" no Android | 👤 Você — passo 5.2, item 3 |
| Tester não consegue criar conta | 🤖 Claude — verifico configuração de Auth |
| Build do APK falhou | 🤖 Claude — me envie a mensagem de erro |
| Site com erro após deploy | 🌐 Claude — verifico logs no painel do Vercel |
| Link do APK expirou | 🤖 Claude — gero novo build |
