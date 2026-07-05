// Escolha da cidade de pernoite entre as candidatas de uma janela. Puro.
// Critério (travado): mais perto do alvo diário E com menor desvio da rota —
// tratados como co-primários num score combinado (menor vence).
import type { Cidade } from './types';
import { PESO_DESVIO_ROTA } from './config';

/** Uma cidade candidata com seu km along-route (absoluto) e desvio da rota (km). */
export interface CidadeComKm {
  cidade: Cidade;
  km: number;
  desvioRota: number;
}

/**
 * Escolhe a cidade que minimiza `|km − alvo| + PESO·desvioRota`.
 * Retorna null se `candidatas` estiver vazio.
 */
export function escolherCidade(candidatas: CidadeComKm[], alvoAbsKm: number): CidadeComKm | null {
  if (candidatas.length === 0) return null;
  const score = (c: CidadeComKm): number =>
    Math.abs(c.km - alvoAbsKm) + PESO_DESVIO_ROTA * c.desvioRota;
  return [...candidatas].sort((a, b) => score(a) - score(b))[0];
}
