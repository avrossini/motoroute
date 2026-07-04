// Constantes tunáveis do motor de rotas. Ajustar aqui afeta todo o núcleo.

/** Rating mínimo para um posto ser considerado "qualificado". */
export const PISO_RATING = 4.0;

/** Nº mínimo de avaliações para a nota do posto ser confiável. */
export const MIN_REVIEWS = 5;

/** Margem adicionada ao raio de busca além da meia-faixa, em km. */
export const MARGEM_KM = 15;

/** Teto do raio de busca de postos, em km (espelha o places-stop atual). */
export const RAIO_MAX_KM = 50;
