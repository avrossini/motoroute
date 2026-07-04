// Caminhada de km sobre os steps do Directions. É a peça que "faz ou quebra"
// o primitivo: como acumular distância on-road e projetar um posto de volta à rota.
import type { Ponto, RawLeg } from './types';
import { haversineKm } from './geo';

/** Um step com km/min acumulados desde o início da leg. `end` é sempre on-road. */
export interface StepAcum {
  end: Ponto;
  cumKm: number;
  cumMin: number;
  htmlInstructions: string;
}

/** Normaliza os steps de uma leg em pontos com km/min acumulados. */
export function acumularSteps(leg: RawLeg): StepAcum[] {
  const out: StepAcum[] = [];
  let cumKm = 0;
  let cumMin = 0;
  for (const s of leg.steps) {
    cumKm += (s.distanceMeters ?? 0) / 1000;
    cumMin += (s.durationSeconds ?? 0) / 60;
    out.push({
      end: s.end,
      cumKm,
      cumMin,
      htmlInstructions: s.htmlInstructions ?? '',
    });
  }
  return out;
}

/** Km total da rota (cumKm do último step). */
export function kmTotal(steps: StepAcum[]): number {
  return steps.length === 0 ? 0 : steps[steps.length - 1].cumKm;
}

/**
 * Coordenada on-road no alvo: o `end` do primeiro step cujo km acumulado
 * cruza `alvoKm`. Nunca interpola — sempre um ponto real de step do Google.
 * Se `alvoKm` passa do total, devolve o último ponto.
 */
export function amostrarPontoNoAlvo(steps: StepAcum[], alvoKm: number): Ponto {
  for (const s of steps) {
    if (s.cumKm >= alvoKm) return s.end;
  }
  return steps[steps.length - 1].end;
}

/**
 * Km rodoviário (along-route) aproximado até um posto: projeta o posto ao
 * step-end mais próximo por haversine, considerando SÓ steps à frente de
 * `desdeKm` (evita ambiguidade em alças/ida-e-volta), e devolve o cumKm desse
 * step. É a aproximação central do v1 — a distância real é reconciliada depois
 * pela chamada Directions final que passa pelos postos escolhidos.
 */
export function kmRodoviarioAte(
  steps: StepAcum[],
  posto: Ponto,
  desdeKm: number
): number {
  let melhorKm = desdeKm;
  let melhorDist = Infinity;
  for (const s of steps) {
    if (s.cumKm < desdeKm) continue;
    const d = haversineKm(s.end, posto);
    if (d < melhorDist) {
      melhorDist = d;
      melhorKm = s.cumKm;
    }
  }
  return melhorKm;
}
