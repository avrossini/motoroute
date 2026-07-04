// Caminhada de km sobre a GEOMETRIA FINA da rota (polyline decodificada).
// É a peça que "faz ou quebra" o primitivo: os steps do Directions são grossos
// demais em rodovia (um step pode ter centenas de km), então amostrar/projetar
// sobre eles coloca paradas no lugar errado. Trabalhamos sobre os pontos da
// polyline, densos o bastante para amostrar paradas a cada ~150 km.
import type { Ponto, RawStep } from './types';
import { haversineKm } from './geo';

/** Um ponto da geometria da rota com km acumulado desde a origem. */
export interface CaminhoPonto {
  lat: number;
  lng: number;
  cumKm: number;
}

/** Constrói o caminho (pontos + km acumulado) a partir da geometria decodificada. */
export function construirCaminho(pontos: Ponto[]): CaminhoPonto[] {
  const caminho: CaminhoPonto[] = [];
  let cum = 0;
  for (let i = 0; i < pontos.length; i++) {
    if (i > 0) cum += haversineKm(pontos[i - 1], pontos[i]);
    caminho.push({ lat: pontos[i].lat, lng: pontos[i].lng, cumKm: cum });
  }
  return caminho;
}

/** Km total da rota (cumKm do último ponto do caminho). */
export function kmTotalCaminho(caminho: CaminhoPonto[]): number {
  return caminho.length === 0 ? 0 : caminho[caminho.length - 1].cumKm;
}

/**
 * Coordenada da rota no alvo: o primeiro ponto do caminho cujo km acumulado
 * cruza `alvoKm`. Se `alvoKm` passa do total, devolve o último ponto.
 */
export function amostrarPontoNoAlvo(caminho: CaminhoPonto[], alvoKm: number): Ponto {
  for (const p of caminho) {
    if (p.cumKm >= alvoKm) return { lat: p.lat, lng: p.lng };
  }
  const ult = caminho[caminho.length - 1];
  return { lat: ult.lat, lng: ult.lng };
}

/**
 * Km rodoviário (along-route) aproximado até um posto: projeta o posto ao ponto
 * do caminho mais próximo por haversine, considerando SÓ pontos à frente de
 * `desdeKm` (evita ambiguidade em alças/ida-e-volta), e devolve o cumKm desse
 * ponto. Aproximação do v1 — a distância real é reconciliada pela Directions
 * final que passa pelos postos escolhidos.
 */
export function kmRodoviarioAte(caminho: CaminhoPonto[], posto: Ponto, desdeKm: number): number {
  let melhorKm = desdeKm;
  let melhorDist = Infinity;
  for (const p of caminho) {
    if (p.cumKm < desdeKm) continue;
    const d = haversineKm({ lat: p.lat, lng: p.lng }, posto);
    if (d < melhorDist) {
      melhorDist = d;
      melhorKm = p.cumKm;
    }
  }
  return melhorKm;
}

/**
 * Nome da via principal de um conjunto de steps: a rodovia (padrão XX-000) com
 * mais metros percorridos, extraída das html_instructions. Espelha o
 * extractMainRoad do generate-segments. Retorna '' se nenhuma for reconhecida.
 */
export function rodoviaPrincipal(steps: RawStep[]): string {
  const metrosPorVia = new Map<string, number>();
  for (const s of steps) {
    for (const m of (s.htmlInstructions ?? '').matchAll(/<b>([^<]+)<\/b>/g)) {
      const nome = m[1].trim();
      if (/^[A-Z]{2,}-\d{2,}/.test(nome)) {
        metrosPorVia.set(nome, (metrosPorVia.get(nome) ?? 0) + (s.distanceMeters ?? 0));
      }
    }
  }
  let melhor = '';
  let melhorMetros = 0;
  for (const [via, metros] of metrosPorVia) {
    if (metros > melhorMetros) {
      melhor = via;
      melhorMetros = metros;
    }
  }
  return melhor;
}
