// Tipos do motor de cálculo de rotas — núcleo puro.
// Nenhum acoplamento a Google/Supabase/react-native: só formas de dados.
// Ver docs/route-engine.md para a arquitetura.

export interface Ponto {
  lat: number;
  lng: number;
}

export interface PontoNomeado extends Ponto {
  nome: string;
}

/** Posto de combustível real (resultado normalizado do Places). */
export interface Posto {
  placeId: string;
  nome: string;
  rating: number | null;
  totalRatings: number | null;
  is24h: boolean | null;
  lat: number;
  lng: number;
}

export type Alerta =
  | 'trecho_curto' // abaixo do mínimo (recuar por falta de posto, ou trecho final)
  | 'trecho_longo' // acima do máximo (estender por falta de posto, ou trecho final)
  | 'avaliacao_baixa' // posto escolhido não passou no piso de qualidade
  | 'sem_posto'; // deserto absoluto — ponto "a confirmar", sem posto real

export interface FaixaKm {
  min: number;
  max: number;
}

/** Um trecho do roteiro: origem → destino, terminando (quando intermediário) num posto real. */
export interface Trecho {
  ordem: number;
  origem: PontoNomeado;
  destino: PontoNomeado;
  distanciaKm: number;
  duracaoMin: number;
  rodovia: string; // nome da via principal (route_summary)
  posto: Posto | null; // o posto que É o destino; null no trecho final e no caso sem_posto
  alertas: Alerta[];
}

export interface DividirInput {
  origem: PontoNomeado;
  destino: PontoNomeado;
  faixa: FaixaKm;
  /** place_ids favoritados pelo usuário (favorites.place_id). */
  favoritos: Set<string>;
}

export interface DividirResult {
  trechos: Trecho[];
  totalKm: number;
  totalMin: number;
}

// ── Forma mínima do Directions que o núcleo consome (normalizada pelo adapter) ──

export interface RawStep {
  distanceMeters: number;
  durationSeconds: number;
  end: Ponto; // sempre on-road (step.end_location do Google)
  htmlInstructions: string;
}

export interface RawLeg {
  distanceMeters: number;
  durationSeconds: number;
  start: Ponto;
  end: Ponto;
  steps: RawStep[];
}

export interface RawDirections {
  status: string; // 'OK' quando válido
  summary: string;
  /** Geometria fina da rota (overview polyline decodificado) — para amostragem/projeção. */
  pontos: Ponto[];
  legs: RawLeg[];
}

// ── Portas injetadas (implementadas por adapters fora do núcleo) ──

export interface RoutePort {
  getRoute(
    origem: Ponto | string,
    destino: Ponto | string,
    waypoints?: Ponto[]
  ): Promise<RawDirections>;
}

export interface StopsPort {
  searchStops(lat: number, lng: number, raioM: number): Promise<Posto[]>;
}

// ── Expedição (multi_day) — divisão em dias ──────────────────────────────────

/** Cidade (locality) real perto da rota — candidata a pernoite. */
export interface Cidade {
  placeId: string | null; // null quando vem de reverse-geocode sem place_id confiável
  nome: string;
  lat: number;
  lng: number;
}

/** Porta de busca de cidades (locality) perto de um ponto. Espelha StopsPort. */
export interface CitiesPort {
  searchCities(lat: number, lng: number, raioM: number): Promise<Cidade[]>;
}

export type AlertaDia =
  | 'dia_puxado' // 500 < kmDia <= 650 — alerta informativo
  | 'dia_extremo' // kmDia > 650 — alerta forte
  | 'sem_cidade'; // nenhuma cidade na janela: deslizou p/ a mais próxima (ou "a confirmar")

/** Uma perna de dia da Expedição: origem → cidade de pernoite. SEM trechos internos. */
export interface DiaExpedicao {
  dia: number; // 1..N
  origem: PontoNomeado;
  destino: PontoNomeado; // cidade de pernoite, ou o destino final no último dia
  cidade: Cidade | null; // locality escolhida; null no último dia (é o destino do usuário)
  kmDia: number;
  duracaoMin: number;
  alertas: AlertaDia[];
}

export interface DividirEmDiasInput {
  origem: PontoNomeado;
  destino: PontoNomeado;
  nDias: number; // dias de DESLOCAMENTO (dias parados são overlay do Ciclo 2)
}

export interface DividirEmDiasResult {
  dias: DiaExpedicao[]; // length === nDias
  totalKm: number;
  totalMin: number;
}
