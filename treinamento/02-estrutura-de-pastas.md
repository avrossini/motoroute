# MotoRoute App — Estrutura de Pastas

## Mapa geral

```
motoroute-app/
├── app/                    ← Telas e API Routes do app
│   ├── (auth)/             ← Telas de login e cadastro
│   ├── (tabs)/             ← Telas principais (com barra de navegação inferior)
│   ├── api/                ← Endpoints do servidor (rodam no backend Expo)
│   ├── trip/               ← Telas de detalhe e criação de viagem
│   ├── stop/               ← Telas de paradas
│   ├── lodging/            ← Telas de hospedagem
│   ├── favoritas.tsx       ← Tela de lugares favoritos
│   ├── minha-moto.tsx      ← Tela de cadastro da moto
│   └── preferencias.tsx    ← Tela de preferências do usuário
├── lib/                    ← Utilitários compartilhados
│   ├── logApiUsage.ts      ← Registra uso das APIs externas no banco
│   └── logError.ts         ← Registra erros técnicos no banco
├── supabase/               ← Migrations e configuração do banco
│   └── migrations/         ← Histórico de alterações no banco de dados
├── assets/                 ← Imagens, fontes e ícones
└── .env                    ← Variáveis de ambiente (chaves de API, URL do banco)
```

---

## O que são as "tabs"?

As tabs são as telas principais que aparecem com a barra de navegação inferior do app. São elas:

| Arquivo | Tela |
|---|---|
| `(tabs)/index.tsx` | Tela inicial / mapa |
| `(tabs)/viagens.tsx` | Lista de viagens do usuário |
| `(tabs)/perfil.tsx` | Perfil e configurações |

---

## O que são as "API Routes"?

A pasta `app/api/` contém endpoints de servidor — código que roda **no backend**, não no celular do usuário. Eles funcionam como intermediários entre o app e os serviços externos (Google Maps, WeatherAPI), protegendo as chaves de API.

| Arquivo | O que faz |
|---|---|
| `directions+api.ts` | Calcula rota completa entre origem e destino |
| `directions-simple+api.ts` | Versão simplificada de rota (para preview rápido) |
| `geocode+api.ts` | Converte endereço em coordenadas GPS |
| `weather+api.ts` | Busca previsão do tempo para uma coordenada e data |
| `places-stop+api.ts` | Busca postos de gasolina e restaurantes próximos à rota |
| `places-lodging+api.ts` | Busca hotéis e pousadas próximos à rota |
| `places-photos+api.ts` | Busca fotos de um lugar pelo ID do Google Maps |
| `generate-segments+api.ts` | Gera o roteiro completo de uma viagem (a mais complexa) |
| `insert-stop+api.ts` | Insere uma parada manual na viagem |
| `map-waypoints+api.ts` | Calcula waypoints para exibição no mapa |
| `feedback+api.ts` | Recebe feedback do usuário (bug, sugestão, etc.) |

> A lista canônica de endpoints é a própria pasta `app/api/` no código. Para custos por chamada e provedores, veja [`04-apis-externas.md`](04-apis-externas.md); para o schema das tabelas que essas rotas leem/gravam, [`../docs/database.md`](../docs/database.md).

---

## Variáveis de ambiente (.env)

O arquivo `.env` contém informações sensíveis que **nunca devem ser compartilhadas ou commitadas no Git**:

```
EXPO_PUBLIC_SUPABASE_URL=          # Endereço do banco de dados
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # Chave pública do Supabase
SUPABASE_SERVICE_ROLE_KEY=         # Chave secreta (só usada no servidor)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=   # Chave da API do Google Maps
EXPO_PUBLIC_WEATHER_API_KEY=       # Chave da API de clima
```

> Variáveis que começam com `EXPO_PUBLIC_` ficam visíveis no app (client-side). As demais ficam **apenas no servidor**.
