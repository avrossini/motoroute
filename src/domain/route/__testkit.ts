// Harness de teste compartilhado (NÃO é uma suíte — fica fora de __tests__).
// Rota reta determinística onde 1 km ao longo da rota ≈ 1 km em linha reta, então
// o raio de busca mapeia direto para km ao longo da rota. Fakes das portas.
import type { Ponto, PontoNomeado, Posto, RawStep, RawLeg, RawDirections, RoutePort, StopsPort } from './types';
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
  private legEntre(aKm: number, bKm: number): RawLeg {
    const steps = this.steps.filter((_, i) => this.cum[i] > aKm + 1e-6 && this.cum[i] <= bKm + 1e-6);
    return {
      distanceMeters: (bKm - aKm) * 1000,
      durationSeconds: ((bKm - aKm) / 80) * 3600,
      start: pontoNoKm(aKm),
      end: pontoNoKm(bKm),
      steps: steps.length ? steps : [{ distanceMeters: (bKm - aKm) * 1000, durationSeconds: ((bKm - aKm) / 80) * 3600, end: pontoNoKm(bKm), htmlInstructions: '<b>BR-101</b>' }],
    };
  }
  async getRoute(_o: Ponto | string, _d: Ponto | string, wps?: Ponto[]): Promise<RawDirections> {
    if (!wps || wps.length === 0) {
      return { status: 'OK', summary: this.summary, pontos: this.pontos, legs: [this.legEntre(0, this.total())] };
    }
    const bounds = [0, ...wps.map((w) => this.projetar(w)), this.total()];
    const legs: RawLeg[] = [];
    for (let i = 0; i < bounds.length - 1; i++) legs.push(this.legEntre(bounds[i], bounds[i + 1]));
    return { status: 'OK', summary: this.summary, pontos: [], legs };
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
