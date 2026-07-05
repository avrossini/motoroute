// Constantes tunáveis do motor de rotas. Ajustar aqui afeta todo o núcleo.

/** Rating mínimo para um posto ser considerado "qualificado". */
export const PISO_RATING = 4.0;

/** Nº mínimo de avaliações para a nota do posto ser confiável. */
export const MIN_REVIEWS = 5;

/** Margem adicionada ao raio de busca além da meia-faixa, em km. */
export const MARGEM_KM = 15;

/** Teto do raio de busca de postos, em km (espelha o places-stop atual). */
export const RAIO_MAX_KM = 50;

// ── Expedição (divisão em dias) ──────────────────────────────────────────────

/** Raio inicial de busca de cidade de pernoite, em km (cidades são mais esparsas que postos). */
export const RAIO_CIDADE_KM = 50;

/** Teto do raio de busca de cidade — a cascata amplia até aqui em regiões esparsas. */
export const RAIO_CIDADE_MAX_KM = 150;

/** Peso do desvio da rota vs. desvio do alvo diário, na escolha da cidade. */
export const PESO_DESVIO_ROTA = 2;

/** km/dia acima do qual a expedição é "puxada" (alerta informativo). */
export const DIA_PUXADO_KM = 500;

/** km/dia acima do qual a expedição é "extrema" (alerta forte). */
export const DIA_EXTREMO_KM = 650;
