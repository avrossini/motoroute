// Harness de teste compartilhado (NÃO é uma suíte — fica fora de __tests__).
// Rota reta determinística onde 1 km ao longo da rota ≈ 1 km em linha reta, então
// o raio de busca mapeia direto para km ao longo da rota. Fakes das portas.
import type { Ponto, PontoNomeado, Posto, Cidade, RawStep, RawLeg, RawDirections, RoutePort, StopsPort, CitiesPort } from './types';
import { haversineKm } from './geo';

const LAT = -20;
// Calibrado ao mesmo raio (6371) do haversineKm → 1 unidade = 1 km real, sem drift.
const KM_POR_GRAU_LNG = (6371 * Math.PI * Math.cos((LAT * Math.PI) / 180)) / 180;
const lngNoKm = (km: number): number => -45 - km / KM_POR_GRAU_LNG;
export const pontoNoKm = (km: number): Ponto => ({ lat: LAT, lng: lngNoKm(km) });

export function rotaReta(totalKm: number, stepKm = 10): RawStep[] {
  const steps: RawStep[] = [];
  for (let k = stepKm; k <= totalKm + 1e-6; k += stepKm) {
    steps.push({
      distanceMeters: stepKm * 1000,
      durationSeconds: (stepKm / 80) * 3600,
      end: pontoNoKm(k),
      htmlInstructions: 'Continue on <b>BR-101</b>',
    });
  }
  return steps;
}

const cumKms = (steps: RawStep[]): number[] => {
  const acc: number[] = [];
  let c = 0;
  for (const s of steps) {
    c += s.distanceMeters / 1000;
    acc.push(c);
  }
  return acc;
};

export class FakeRoute implements RoutePort {
  private cum: number[];
  private pontos: Ponto[]; // geometria fina: 1 ponto por km (pontos[i] está no km i)
  constructor(private steps: RawStep[], private summary = 'BR-101') {
    this.cum = cumKms(steps);
    const totalKm = this.cum[this.cum.length - 1] ?? 0;
    this.pontos = [];
    for (let k = 0; k <= totalKm + 1e-6; k += 1) this.pontos.push(pontoNoKm(k));
  }
  private total(): number {
    return this.cum[this.cum.length - 1] ?? 0;
  }
  private projetar(p: Ponto): number {
    let bk = 0;
    let bd = Infinity;
    this.pontos.forEach((pt, i) => {
      const d = haversineKm(pt, p);
      if (d < bd) {
        bd = d;
        bk = i; // pontos[i] está no km i
      }
    });
    return bk;
  }
  private legEntre(aKm: number, bKm: number, distKm = bKm - aKm): RawLeg {
    const steps = this.steps.filter((_, i) => this.cum[i] > aKm + 1e-6 && this.cum[i] <= bKm + 1e-6);
    return {
      distanceMeters: distKm * 1000,
      durationSeconds: (distKm / 80) * 3600,
      start: pontoNoKm(aKm),
      end: pontoNoKm(bKm),
      steps: steps.length ? steps : [{ distanceMeters: distKm * 1000, durationSeconds: (distKm / 80) * 3600, end: pontoNoKm(bKm), htmlInstructions: '<b>BR-101</b>' }],
    };
  }
  async getRoute(_o: Ponto | string, _d: Ponto | string, wps?: Ponto[]): Promise<RawDirections> {
    if (!wps || wps.length === 0) {
      return { status: 'OK', summary: this.summary, pontos: this.pontos, legs: [this.legEntre(0, this.total())] };
    }
    // Cada waypoint carrega seu km projetado na rota + o desvio lateral (distância do
    // ponto até a rota). Um waypoint fora da rota adiciona ~2× o desvio (ida e volta),
    // dividido entre as legs adjacentes — assim o harness modela o detour de uma parada.
    const marcos = [
      { km: 0, lat: 0 },
      ...wps.map((w) => { const km = this.projetar(w); return { km, lat: haversineKm(w, pontoNoKm(km)) }; }),
      { km: this.total(), lat: 0 },
    ];
    const legs: RawLeg[] = [];
    for (let i = 0; i < marcos.length - 1; i++) {
      const alongKm = marcos[i + 1].km - marcos[i].km;
      const detourKm = marcos[i].lat + marcos[i + 1].lat; // sai do ponto i, entra no i+1
      legs.push(this.legEntre(marcos[i].km, marcos[i + 1].km, alongKm + detourKm));
    }
    return { status: 'OK', summary: this.summary, pontos: this.pontos, legs };
  }
}

export interface PostoDef {
  km: number;
  rating: number | null;
  reviews: number | null;
  placeId: string;
}

export class FakeStops implements StopsPort {
  public chamadas = 0;
  private postos: (Posto & { km: number })[];
  constructor(defs: PostoDef[]) {
    this.postos = defs.map((d) => ({ placeId: d.placeId, nome: d.placeId, rating: d.rating, totalRatings: d.reviews, is24h: null, ...pontoNoKm(d.km), km: d.km }));
  }
  async searchStops(lat: number, lng: number, raioM: number): Promise<Posto[]> {
    this.chamadas++;
    const centro = { lat, lng };
    return this.postos
      .filter((p) => haversineKm({ lat: p.lat, lng: p.lng }, centro) * 1000 <= raioM + 1)
      .map(({ km: _km, ...p }) => p);
  }
}

/** Monta um DividirInput com origem no km 0 e destino no km `totalKm`. */
export const input = (totalKm: number, min: number, max: number, favoritos: string[] = []) => ({
  origem: { ...pontoNoKm(0), nome: 'Origem' } as PontoNomeado,
  destino: { ...pontoNoKm(totalKm), nome: 'Destino' } as PontoNomeado,
  faixa: { min, max },
  favoritos: new Set(favoritos),
});

// ── Expedição ────────────────────────────────────────────────────────────────

const KM_POR_GRAU_LAT = (6371 * Math.PI) / 180; // ~111.19 km/grau de latitude
/** Ponto no km da rota, deslocado `offKm` lateralmente (para testar desvio da rota). */
const pontoOffRota = (km: number, offKm: number): Ponto => ({
  lat: LAT + offKm / KM_POR_GRAU_LAT,
  lng: lngNoKm(km),
});

export interface CidadeDef {
  km: number;
  nome: string;
  offKm?: number; // desvio lateral da rota (default 0 = sobre a rota)
}

export class FakeCities implements CitiesPort {
  public chamadas = 0;
  private cidades: (Cidade & { km: number })[];
  constructor(defs: CidadeDef[]) {
    this.cidades = defs.map((d) => ({
      placeId: d.nome,
      nome: d.nome,
      ...pontoOffRota(d.km, d.offKm ?? 0),
      km: d.km,
    }));
  }
  async searchCities(lat: number, lng: number, raioM: number): Promise<Cidade[]> {
    this.chamadas++;
    const centro = { lat, lng };
    return this.cidades
      .filter((c) => haversineKm({ lat: c.lat, lng: c.lng }, centro) * 1000 <= raioM + 1)
      .map(({ km: _km, ...c }) => c);
  }
}

/** Monta um DividirEmDiasInput com origem no km 0 e destino no km `totalKm`. */
export const inputDias = (totalKm: number, nDias: number) => ({
  origem: { ...pontoNoKm(0), nome: 'Origem' } as PontoNomeado,
  destino: { ...pontoNoKm(totalKm), nome: 'Destino' } as PontoNomeado,
  nDias,
});

export interface ParadaDef {
  km: number;
  nome: string;
  offKm?: number;
}
const paradaNoKm = (d: ParadaDef): PontoNomeado => ({
  ...(d.offKm ? pontoOffRota(d.km, d.offKm) : pontoNoKm(d.km)),
  nome: d.nome,
});

/** DividirEmDiasInput com paradas obrigatórias cravadas em km ao longo da rota. */
export const inputDiasComParadas = (totalKm: number, nDias: number, paradas: ParadaDef[]) => ({
  ...inputDias(totalKm, nDias),
  paradasObrigatorias: paradas.map(paradaNoKm),
});

/** DividirInput (primitivo) com paradas obrigatórias em km ao longo da rota. */
export const inputComParadas = (
  totalKm: number,
  min: number,
  max: number,
  paradas: ParadaDef[],
  favoritos: string[] = []
) => ({
  ...input(totalKm, min, max, favoritos),
  paradasObrigatorias: paradas.map(paradaNoKm),
});
