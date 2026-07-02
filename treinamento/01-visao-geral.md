# MotoRoute App — Visão Geral

## O que é o MotoRoute App?

O MotoRoute App é o aplicativo mobile principal do produto. Ele é usado pelos **motociclistas** (usuários finais) para planejar viagens de moto: definir origem e destino, gerar um roteiro completo com paradas sugeridas, acompanhar a viagem em tempo real com check-ins e consultar condições climáticas do percurso.

Pense nele como o "Google Maps para motociclistas", mas com foco em descoberta de paradas interessantes, planejamento de hospedagem e segurança em estrada.

---

## Tecnologias usadas

| Tecnologia | Para quê serve |
|---|---|
| **React Native / Expo** | Framework para criar o app mobile (roda em iOS e Android) |
| **TypeScript** | Linguagem de programação (JavaScript com tipagem) |
| **Supabase** | Banco de dados e autenticação (cloud, similar ao Firebase) |
| **Expo Router** | Navegação entre telas do app |
| **Google Maps API** | Rotas, geocodificação (endereço → coordenadas) e busca de lugares |
| **WeatherAPI** | Previsão do tempo ao longo do percurso |

---

## Para quem é esse app?

O público-alvo são motociclistas brasileiros que fazem viagens médias e longas (50 km+). Durante o alfa fechado, apenas usuários convidados pelo time têm acesso.

---

## Onde fica o código?

```
C:\Users\rossi\Dev\MotoRoute\motoroute-app\
```

---

## Como rodar localmente

O app usa **Metro** (bundler do React Native) dentro de um container Docker.

```bash
# Na pasta do projeto
docker compose up
```

Depois de iniciar, use o app **Expo Go** no celular para escanear o QR Code, ou um emulador no computador.

> **Atenção:** se você alterar algum arquivo de código, o Metro detecta automaticamente e recarrega o app. Mas se alterar configurações de ambiente (`.env`), precisa reiniciar o container.

---

## Próximos documentos desta pasta

- `02-estrutura-de-pastas.md` — onde fica cada coisa no código
- `03-telas-e-funcionalidades.md` — o que o usuário vê e faz
- `04-apis-externas.md` — como funcionam as integrações com Google e Weather
- `05-banco-de-dados.md` — tabelas e o que cada uma armazena
