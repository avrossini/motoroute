// Cascata "sem posto na faixa": decide recuar (parar antes do mínimo) ou
// estender (passar do máximo). Puro: opera sobre os candidatos já encontrados.
// A ampliação de raio e o fallback "deserto" (I/O) ficam no orquestrador.
import type { FaixaKm } from './types';
import { escolherPosto, type PostoComKm, type EscolhaPosto, type OpcoesEscolha } from './scoring';

export type ResultadoCascata =
  | { tipo: 'recuar'; escolha: EscolhaPosto } // posto real antes do mínimo → trecho_curto
  | { tipo: 'estender'; escolha: EscolhaPosto } // posto real além do máximo → trecho_longo
  | { tipo: 'vazio' }; // nenhum posto utilizável nos candidatos dados

/**
 * Quando a faixa [min,max] vem vazia, tenta, nesta ordem:
 *   1. recuar — melhor posto ANTES do mínimo (mais conservador; alvo = min);
 *   2. estender — 1º posto ALÉM do máximo (alvo = max);
 *   3. vazio — nada nos candidatos (o orquestrador amplia o raio ou cai em "a confirmar").
 * A escolha em cada zona usa a mesma cascata de qualidade do `escolherPosto`.
 */
export function resolverSemPosto(
  candidatos: PostoComKm[],
  atualKm: number,
  faixa: FaixaKm,
  favoritos: Set<string>,
  opts: OpcoesEscolha = {}
): ResultadoCascata {
  const antesDoMin = candidatos.filter((c) => {
    const rel = c.km - atualKm;
    return rel > 0 && rel < faixa.min;
  });
  if (antesDoMin.length > 0) {
    const escolha = escolherPosto(antesDoMin, atualKm + faixa.min, favoritos, opts)!;
    return { tipo: 'recuar', escolha };
  }

  const alemDoMax = candidatos.filter((c) => c.km - atualKm > faixa.max);
  if (alemDoMax.length > 0) {
    const escolha = escolherPosto(alemDoMax, atualKm + faixa.max, favoritos, opts)!;
    return { tipo: 'estender', escolha };
  }

  return { tipo: 'vazio' };
}
