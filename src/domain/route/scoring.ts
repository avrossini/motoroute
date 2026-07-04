// Escolha do posto dentro de um conjunto de candidatos — cascata de qualidade.
// Puro: recebe candidatos já com km along-route, decide qual vence.
import type { Posto } from './types';
import { PISO_RATING, MIN_REVIEWS } from './config';

/** Um candidato a parada: o posto e seu km along-route (absoluto na rota). */
export interface PostoComKm {
  posto: Posto;
  km: number;
}

export interface EscolhaPosto {
  posto: Posto;
  km: number;
  /** true quando nenhum candidato passou no piso de qualidade (alerta avaliacao_baixa). */
  avaliacaoBaixa: boolean;
}

export interface OpcoesEscolha {
  pisoRating?: number;
  minReviews?: number;
}

/** Ordena por rating desc, depois pela proximidade do alvo (menor |km−alvo|). */
function melhor(cs: PostoComKm[], alvoAbsKm: number): PostoComKm {
  return [...cs].sort((a, b) => {
    const r = (b.posto.rating ?? 0) - (a.posto.rating ?? 0);
    if (r !== 0) return r;
    return Math.abs(a.km - alvoAbsKm) - Math.abs(b.km - alvoAbsKm);
  })[0];
}

function qualificado(p: Posto, piso: number, minRev: number): boolean {
  return (p.rating ?? 0) >= piso && (p.totalRatings ?? 0) >= minRev;
}

/**
 * Escolhe o melhor posto entre os candidatos, na cascata de qualidade:
 *   1. favorito (vence sempre, mesmo abaixo do piso);
 *   2. qualificado (rating ≥ piso E reviews ≥ mínimo);
 *   3. melhor disponível (nenhum qualificado) → avaliacaoBaixa=true.
 * Desempate em todos os níveis: rating desc, depois proximidade do alvo.
 * Retorna null se `candidatos` estiver vazio.
 */
export function escolherPosto(
  candidatos: PostoComKm[],
  alvoAbsKm: number,
  favoritos: Set<string>,
  opts: OpcoesEscolha = {}
): EscolhaPosto | null {
  if (candidatos.length === 0) return null;
  const piso = opts.pisoRating ?? PISO_RATING;
  const minRev = opts.minReviews ?? MIN_REVIEWS;

  const favs = candidatos.filter((c) => favoritos.has(c.posto.placeId));
  if (favs.length > 0) {
    const b = melhor(favs, alvoAbsKm);
    return { posto: b.posto, km: b.km, avaliacaoBaixa: false };
  }

  const quals = candidatos.filter((c) => qualificado(c.posto, piso, minRev));
  if (quals.length > 0) {
    const b = melhor(quals, alvoAbsKm);
    return { posto: b.posto, km: b.km, avaliacaoBaixa: false };
  }

  const b = melhor(candidatos, alvoAbsKm);
  return { posto: b.posto, km: b.km, avaliacaoBaixa: true };
}
