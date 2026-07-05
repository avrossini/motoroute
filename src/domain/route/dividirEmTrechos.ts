// Orquestrador do primitivo — modelo buscar-primeiro (greedy para frente).
// async porque chama as portas (RoutePort/StopsPort), mas sem I/O direto:
// toda rede fica nos adapters injetados. Ver docs/route-engine.md §2-3.
import type {
  DividirInput,
  DividirResult,
  Trecho,
  PontoNomeado,
  Ponto,
  Posto,
  Alerta,
  RoutePort,
  StopsPort,
  RawDirections,
} from './types';
import {
  construirCaminho,
  kmTotalCaminho,
  amostrarPontoNoAlvo,
  kmRodoviarioAte,
  rodoviaPrincipal,
  type CaminhoPonto,
} from './routeWalk';
import { escolherPosto, type EscolhaPosto, type PostoComKm } from './scoring';
import { resolverSemPosto } from './cascata';
import { MARGEM_KM, RAIO_MAX_KM } from './config';

/** Waypoint escolhido para um trecho: o ponto a rotear + o posto (ou "a confirmar"). */
interface Parada {
  ponto: Ponto;
  posto: Posto | null;
  nome: string;
  /** Alerta de qualidade/existência do posto (avaliacao_baixa | sem_posto). Km-alerts são recomputados depois. */
  alertaExtra: Alerta | null;
  /** true quando é uma parada OBRIGATÓRIA do usuário (precedência sobre a regra de km). */
  mandatory?: boolean;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function assertOk(raw: RawDirections): void {
  if (raw.status !== 'OK' || raw.legs.length === 0) {
    throw new Error(`Directions falhou: ${raw.status}`);
  }
}

function paradaDePosto(esc: EscolhaPosto): Parada {
  return {
    ponto: { lat: esc.posto.lat, lng: esc.posto.lng },
    posto: esc.posto,
    nome: esc.posto.nome,
    alertaExtra: esc.avaliacaoBaixa ? 'avaliacao_baixa' : null,
  };
}

/**
 * Decide a próxima parada a partir de `atualKm`: busca postos no alvo, filtra à
 * faixa, escolhe; se a faixa vier vazia, aplica a cascata (recuar/estender) e,
 * como último recurso, amplia o raio até RAIO_MAX; persistindo vazio, devolve um
 * ponto "a confirmar" (sem_posto).
 */
async function decidirParada(
  caminho: CaminhoPonto[],
  atualKm: number,
  input: DividirInput,
  stops: StopsPort
): Promise<Parada> {
  const { faixa, favoritos } = input;
  const alvoAbs = atualKm + (faixa.min + faixa.max) / 2;
  const pontoAlvo = amostrarPontoNoAlvo(caminho, alvoAbs);
  const raioBaseKm = Math.min((faixa.max - faixa.min) / 2 + MARGEM_KM, RAIO_MAX_KM);

  let raioKm = raioBaseKm;
  for (;;) {
    const brutos = await stops.searchStops(pontoAlvo.lat, pontoAlvo.lng, raioKm * 1000);
    const comKm: PostoComKm[] = brutos.map((p) => ({
      posto: p,
      km: kmRodoviarioAte(caminho, { lat: p.lat, lng: p.lng }, atualKm),
    }));

    const naFaixa = comKm.filter((c) => {
      const rel = c.km - atualKm;
      return rel >= faixa.min && rel <= faixa.max;
    });
    if (naFaixa.length > 0) {
      return paradaDePosto(escolherPosto(naFaixa, alvoAbs, favoritos)!);
    }

    const casc = resolverSemPosto(comKm, atualKm, faixa, favoritos);
    if (casc.tipo === 'recuar' || casc.tipo === 'estender') {
      return paradaDePosto(casc.escolha);
    }

    if (raioKm >= RAIO_MAX_KM) {
      // Deserto absoluto — ponto "a confirmar" (única exceção à regra "nunca ponto teórico").
      return { ponto: pontoAlvo, posto: null, nome: 'Local a confirmar', alertaExtra: 'sem_posto' };
    }
    raioKm = Math.min(raioKm + 5, RAIO_MAX_KM);
  }
}

/**
 * Divide origem→destino em trechos, onde cada parada intermediária já é um posto
 * real dentro da faixa [min,max]. Origem e destino têm nomes preservados.
 */
export async function dividirEmTrechos(
  input: DividirInput,
  rota: RoutePort,
  stops: StopsPort
): Promise<DividirResult> {
  const { origem, destino, faixa } = input;
  const paradasObrig = input.paradasObrigatorias ?? [];

  // 1. Rota inicial passando pelas paradas obrigatórias (km/geometria já com o desvio)
  const raw0 = await rota.getRoute(
    origem,
    destino,
    paradasObrig.map((p) => ({ lat: p.lat, lng: p.lng }))
  );
  assertOk(raw0);
  const caminho = construirCaminho(raw0.pontos);
  const total = kmTotalCaminho(caminho);

  // km along-route de cada parada obrigatória, em ordem de rota
  const paradasKm = paradasObrig
    .map((p) => ({ p, km: kmRodoviarioAte(caminho, { lat: p.lat, lng: p.lng }, 0) }))
    .sort((a, b) => a.km - b.km);

  // Caso trivial: cabe em 1 trecho e não há parada obrigatória a cravar
  if (total <= faixa.max && paradasKm.length === 0) {
    const leg = raw0.legs[0];
    const dist = leg.distanceMeters / 1000;
    const trecho: Trecho = {
      ordem: 0,
      origem,
      destino,
      distanciaKm: round1(dist),
      duracaoMin: Math.round(leg.durationSeconds / 60),
      rodovia: rodoviaPrincipal(leg.steps) || raw0.summary,
      posto: null,
      alertas: dist > faixa.max ? ['trecho_longo'] : [],
    };
    return { trechos: [trecho], totalKm: Math.round(dist), totalMin: trecho.duracaoMin };
  }

  // 2. Loop greedy: postos naturais + paradas obrigatórias cravadas na ordem.
  //    Continua enquanto sobra mais que um trecho OU ainda há parada por cravar.
  const paradas: Parada[] = [];
  let atualKm = 0;
  let mIdx = 0;
  const MAX_ITER = 200; // backstop contra loop patológico
  for (let guard = 0; guard < MAX_ITER; guard++) {
    const faltamParadas = mIdx < paradasKm.length;
    if (total - atualKm <= faixa.max && !faltamParadas) break;

    let parada: Parada;
    if (faltamParadas && paradasKm[mIdx].km <= atualKm + faixa.max + 1e-6) {
      // parada obrigatória alcançável neste trecho → crava (precedência sobre 100-200)
      const po = paradasKm[mIdx].p;
      parada = { ponto: { lat: po.lat, lng: po.lng }, posto: null, nome: po.nome, alertaExtra: null, mandatory: true };
      mIdx++;
    } else {
      parada = await decidirParada(caminho, atualKm, input, stops);
    }
    const novoKm = kmRodoviarioAte(caminho, parada.ponto, atualKm);
    paradas.push(parada);
    if (novoKm <= atualKm) break; // proteção contra não-avanço
    atualKm = novoKm;
  }

  // 3. Directions final passando pelos postos escolhidos (1 chamada) → km/duração reais
  const rawF = await rota.getRoute(
    origem,
    destino,
    paradas.map((p) => p.ponto)
  );
  assertOk(rawF);

  const trechos: Trecho[] = rawF.legs.map((leg, i) => {
    const isLast = i === rawF.legs.length - 1;
    const dist = leg.distanceMeters / 1000;
    const origemT: PontoNomeado = i === 0 ? origem : paradaComoPonto(paradas[i - 1]);
    const destinoT: PontoNomeado = isLast ? destino : paradaComoPonto(paradas[i]);

    const alertas: Alerta[] = [];
    // alerta de qualidade/existência do posto que fecha este trecho
    if (!isLast && paradas[i].alertaExtra) alertas.push(paradas[i].alertaExtra!);
    // km-alertas recomputados sobre a distância REAL — mas a fronteira que é uma
    // parada OBRIGATÓRIA tem precedência sobre a regra 100-200 e não gera alerta.
    const fronteiraObrigatoria = !isLast && !!paradas[i].mandatory;
    if (!fronteiraObrigatoria) {
      if (dist > faixa.max) alertas.push('trecho_longo');
      if (!isLast && dist < faixa.min) alertas.push('trecho_curto'); // último trecho é isento do mínimo
    }

    return {
      ordem: i,
      origem: origemT,
      destino: destinoT,
      distanciaKm: round1(dist),
      duracaoMin: Math.round(leg.durationSeconds / 60),
      rodovia: rodoviaPrincipal(leg.steps) || rawF.summary,
      posto: isLast ? null : paradas[i].posto,
      alertas,
    };
  });

  const totalKmReal = trechos.reduce((s, t) => s + t.distanciaKm, 0);
  const totalMin = trechos.reduce((s, t) => s + t.duracaoMin, 0);
  return { trechos, totalKm: Math.round(totalKmReal), totalMin };
}

function paradaComoPonto(p: Parada): PontoNomeado {
  return { lat: p.ponto.lat, lng: p.ponto.lng, nome: p.nome };
}
