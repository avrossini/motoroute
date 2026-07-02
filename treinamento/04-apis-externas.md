# MotoRoute App — APIs Externas

> Os custos abaixo são **estimativas** para orientar o monitoramento — os valores
> reais dependem do plano de cada provedor e aparecem no admin em **Consumo de APIs**.
> A implementação canônica de cada chamada está no código, em `app/api/` (ver
> [`02-estrutura-de-pastas.md`](02-estrutura-de-pastas.md)).

## Por que usamos APIs externas?

O MotoRoute não tem um banco de dados de mapas, rotas ou clima próprio. Em vez disso, ele usa serviços especializados de terceiros e paga por uso. O app atua como um **orquestrador**: coleta os dados do usuário, consulta as APIs externas e monta o resultado final.

---

## Google Maps Platform

**Site:** maps.google.com/maps/apis  
**O que usamos:**

| Serviço | Endpoint interno | Custo estimado |
|---|---|---|
| Directions API | `directions+api.ts` | ~$0,005 por requisição |
| Places Text Search | `places-stop+api.ts`, `places-lodging+api.ts` | ~$0,032 por requisição |
| Places Photos | `places-photos+api.ts` | ~$0,007 por foto |
| Geocoding | `geocode+api.ts` | ~$0,005 por requisição |

**Como funciona:** o app envia uma coordenada ou texto para o nosso servidor (`app/api/`), que então consulta o Google. A chave de API fica apenas no servidor — o celular do usuário nunca a vê.

**Monitoramento:** o painel admin mostra o custo estimado mensal em **Consumo de APIs**.

---

## WeatherAPI

**Site:** weatherapi.com  
**O que usamos:** previsão do tempo diária para uma coordenada GPS e uma data específica.

**Endpoint interno:** `weather+api.ts`  
**Custo estimado:** ~$0,001 por requisição

**Como funciona:** ao gerar o roteiro, o app calcula em quais dias o usuário estará em quais coordenadas e consulta o clima de cada ponto. O resultado aparece no roteiro como ícone de chuva/sol e temperatura máxima.

---

## Como os erros são monitorados?

Se uma chamada a qualquer API externa falhar (timeout, chave inválida, serviço fora do ar), o sistema:

1. Registra o erro na tabela `error_logs` no banco
2. O painel admin mostra o erro em **Alertas de Erro**
3. Se um endpoint acumular 5+ erros em 24h, aparece um banner de alerta no dashboard do admin

Isso permite que a equipe saiba rapidamente quando um serviço externo está com problema, antes mesmo que usuários reclamem.

---

## Tabela de custos estimados

Os custos são estimativas — os valores reais podem variar conforme o plano contratado com cada provedor.

| API | Tipo | Custo (centavos USD) |
|---|---|---|
| Google | Directions | 0,5¢ |
| Google | Geocoding | 0,5¢ |
| Google | Places Text Search | 3,2¢ |
| Google | Places Photos | 0,7¢ |
| WeatherAPI | Forecast | 0,1¢ |

O painel admin soma esses valores e mostra o custo acumulado do mês atual.
