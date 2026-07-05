// Motor da Expedição (multi_day): divide Origem→Destino em N dias onde cada
// pernoite É uma CIDADE. Mesmo padrão "buscar-primeiro" do primitivo, uma escala
// acima (dias em vez de trechos; cidades em vez de postos; alvo = total÷N).
// Só decide as CIDADES de pernoite — os trechos internos de cada dia são o Rolê,
// rodado sob demanda depois. Ver docs/route-engine.md §6.
import type {
  DividirEmDiasInput,
  DividirEmDiasResult,
  DiaExpedicao,
  PontoNomeado,
  Ponto,
  Cidade,
  AlertaDia,
  ParadaObrigatoria,
  RoutePort,
  CitiesPort,
  RawDirections,
} from './types';
import {
  construirCaminho,
  kmTotalCaminho,
  amostrarPontoNoAlvo,
  kmRodoviarioAte,
  type CaminhoPonto,
} from './routeWalk';
import { haversineKm } from './geo';
import { escolherCidade, type CidadeComKm } from './cidadeScoring';
import { RAIO_CIDADE_KM, RAIO_CIDADE_MAX_KM, DIA_PUXADO_KM, DIA_EXTREMO_KM } from './config';

const round1 = (n: number): number => Math.round(n * 10) / 10;

function assertOk(raw: RawDirections): void {
  if (raw.status !== 'OK' || raw.legs.length === 0) {
    throw new Error(`Directions falhou: ${raw.status}`);
  }
}

/** Alertas de km/dia (business-logic §51-54). */
function alertasKmDia(kmDia: number): AlertaDia[] {
  if (kmDia > DIA_EXTREMO_KM) return ['dia_extremo'];
  if (kmDia > DIA_PUXADO_KM) return ['dia_puxado'];
  return [];
}

/** Fronteira de dia: a cidade de pernoite (ou ponto "a confirmar") + seu ponto. */
interface Fronteira {
  ponto: Ponto;
  cidade: Cidade | null;
  nome: string;
  semCidade: boolean;
}

/**
 * Escolhe a cidade que fecha um dia perto de `alvoAbs`: busca cidades, projeta ao
 * along-route, escolhe a melhor (proximidade do alvo + menor desvio da rota).
 * Janela vazia → amplia o raio; persistindo vazio → ponto "a confirmar" (sem_cidade).
 */
async function escolherFronteira(
  caminho: CaminhoPonto[],
  atualKm: number,
  alvoAbs: number,
  cities: CitiesPort
): Promise<Fronteira> {
  const pontoAlvo = amostrarPontoNoAlvo(caminho, alvoAbs);
  let raioKm = RAIO_CIDADE_KM;
  for (;;) {
    const brutas = await cities.searchCities(pontoAlvo.lat, pontoAlvo.lng, raioKm * 1000);
    const comKm: CidadeComKm[] = brutas
      .map((c) => {
        const km = kmRodoviarioAte(caminho, { lat: c.lat, lng: c.lng }, atualKm);
        const pontoNaRota = amostrarPontoNoAlvo(caminho, km);
        return { cidade: c, km, desvioRota: haversineKm({ lat: c.lat, lng: c.lng }, pontoNaRota) };
      })
      .filter((c) => c.km > atualKm); // só cidades à frente da posição atual

    if (comKm.length > 0) {
      const esc = escolherCidade(comKm, alvoAbs)!;
      return {
        ponto: { lat: esc.cidade.lat, lng: esc.cidade.lng },
        cidade: esc.cidade,
        nome: esc.cidade.nome,
        semCidade: false,
      };
    }

    if (raioKm >= RAIO_CIDADE_MAX_KM) {
      // Deserto absoluto (raro entre O e D) — ponto "a confirmar" no alvo.
      return { ponto: pontoAlvo, cidade: null, nome: 'Local a confirmar', semCidade: true };
    }
    raioKm = Math.min(raioKm + 25, RAIO_CIDADE_MAX_KM);
  }
}

/**
 * Divide origem→destino em `nDias` dias, cada um terminando numa cidade de
 * pernoite. Devolve só as pernas de dia — os trechos internos são o Rolê, depois.
 */
export async function dividirEmDias(
  input: DividirEmDiasInput,
  rota: RoutePort,
  cities: CitiesPort
): Promise<DividirEmDiasResult> {
  const { origem, destino, nDias } = input;
  const paradasObrig = input.paradasObrigatorias ?? [];

  // 1. Rota base passando pelas paradas obrigatórias (km/geometria já com o desvio,
  //    para a divisão em dias distribuir levando as paradas em conta).
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

  // 2. N=1: dia único O→D (não busca cidade); todas as paradas caem nele
  if (nDias <= 1) {
    const leg = raw0.legs[0];
    const kmDia = round1(leg.distanceMeters / 1000);
    const dia: DiaExpedicao = {
      dia: 1,
      origem,
      destino,
      cidade: null,
      kmDia,
      duracaoMin: Math.round(leg.durationSeconds / 60),
      alertas: alertasKmDia(kmDia),
      paradasObrigatorias: paradasObrig.length ? paradasObrig.slice() : undefined,
    };
    return { dias: [dia], totalKm: Math.round(kmDia), totalMin: dia.duracaoMin };
  }

  // 3. Greedy com re-âncora: N-1 fronteiras (cidades de pernoite)
  const fronteiras: Fronteira[] = [];
  const boundaryKm: number[] = [0]; // km de início de cada dia (0, km1, km2, …)
  let atualKm = 0;
  for (let i = 1; i <= nDias - 1; i++) {
    const diasRestantes = nDias - (i - 1); // dias ainda por dividir, incluindo o atual
    const alvoAbs = atualKm + (total - atualKm) / diasRestantes; // re-âncora: espalha o restante
    const fronteira = await escolherFronteira(caminho, atualKm, alvoAbs, cities);
    const novoKm = kmRodoviarioAte(caminho, fronteira.ponto, atualKm);
    if (novoKm <= atualKm) break; // proteção contra não-avanço
    fronteiras.push(fronteira);
    atualKm = novoKm;
    boundaryKm.push(atualKm);
  }
  boundaryKm.push(total); // fim do último dia

  // Bucket cada parada obrigatória no dia cujo span [início, fim) a contém.
  // A fronteira (limite superior) pertence ao dia anterior (determinístico).
  const paradasPorDia: ParadaObrigatoria[][] = Array.from({ length: fronteiras.length + 1 }, () => []);
  for (const { p, km } of paradasKm) {
    let d = 0;
    while (d < boundaryKm.length - 2 && km > boundaryKm[d + 1]) d++;
    paradasPorDia[d].push(p);
  }

  // 4. Directions final passando pelas cidades → legs reais por dia
  const rawF = await rota.getRoute(
    origem,
    destino,
    fronteiras.map((f) => f.ponto)
  );
  assertOk(rawF);

  const dias: DiaExpedicao[] = rawF.legs.map((leg, i) => {
    const isLast = i === rawF.legs.length - 1;
    const kmDia = round1(leg.distanceMeters / 1000);
    const origemDia: PontoNomeado = i === 0 ? origem : fronteiraComoPonto(fronteiras[i - 1]);
    const destinoDia: PontoNomeado = isLast ? destino : fronteiraComoPonto(fronteiras[i]);
    const alertas: AlertaDia[] = alertasKmDia(kmDia);
    if (!isLast && fronteiras[i].semCidade) alertas.push('sem_cidade');
    const pd = paradasPorDia[i] ?? [];
    return {
      dia: i + 1,
      origem: origemDia,
      destino: destinoDia,
      cidade: isLast ? null : fronteiras[i].cidade,
      kmDia,
      duracaoMin: Math.round(leg.durationSeconds / 60),
      alertas,
      paradasObrigatorias: pd.length ? pd : undefined,
    };
  });

  const totalKm = dias.reduce((s, d) => s + d.kmDia, 0);
  const totalMin = dias.reduce((s, d) => s + d.duracaoMin, 0);
  return { dias, totalKm: Math.round(totalKm), totalMin };
}

function fronteiraComoPonto(f: Fronteira): PontoNomeado {
  return { lat: f.ponto.lat, lng: f.ponto.lng, nome: f.nome };
}
