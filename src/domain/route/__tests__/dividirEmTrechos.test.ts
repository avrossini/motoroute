import type { Ponto, PontoNomeado, Posto, RawStep, RawLeg, RawDirections, RoutePort, StopsPort, DividirResult } from '../types';
import { haversineKm } from '../geo';
import { dividirEmTrechos } from '../dividirEmTrechos';

// ─────────────────────────────────────────────────────────────────────────────
// Harness determinístico: uma "rota reta" onde 1 km ao longo da rota ≈ 1 km em
// linha reta, então o raio de busca mapeia diretamente para km ao longo da rota.
// Postos são colocados EXATAMENTE em km múltiplos do step (10 km) para a projeção
// ser exata. Ver docs/route-engine.md.
// ─────────────────────────────────────────────────────────────────────────────

const LAT = -20;
// Calibrado ao mesmo raio (6371) do haversineKm → 1 unidade = 1 km real, sem drift.
const KM_POR_GRAU_LNG = (6371 * Math.PI * Math.cos((LAT * Math.PI) / 180)) / 180;
const lngNoKm = (km: number): number => -45 - km / KM_POR_GRAU_LNG;
const pontoNoKm = (km: number): Ponto => ({ lat: LAT, lng: lngNoKm(km) });

function rotaReta(totalKm: number, stepKm = 10): RawStep[] {
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

class FakeRoute implements RoutePort {
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

interface PostoDef {
  km: number;
  rating: number | null;
  reviews: number | null;
  placeId: string;
}

class FakeStops implements StopsPort {
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

const input = (totalKm: number, min: number, max: number, favoritos: string[] = []) => ({
  origem: { ...pontoNoKm(0), nome: 'Origem' } as PontoNomeado,
  destino: { ...pontoNoKm(totalKm), nome: 'Destino' } as PontoNomeado,
  faixa: { min, max },
  favoritos: new Set(favoritos),
});

// Invariantes que TODO resultado deve respeitar (docs/route-engine.md §9).
function checarInvariantes(r: DividirResult, min: number, max: number) {
  const ts = r.trechos;
  expect(ts.length).toBeGreaterThan(0);
  // origem/destino preservados
  expect(ts[0].origem.nome).toBe('Origem');
  expect(ts[ts.length - 1].destino.nome).toBe('Destino');
  ts.forEach((t, i) => {
    const isLast = i === ts.length - 1;
    // encadeamento: destino do trecho == origem do próximo
    if (!isLast) expect(ts[i + 1].origem).toEqual(t.destino);
    // trecho intermediário sem alerta deve estar na faixa
    if (!isLast && t.alertas.length === 0) {
      expect(t.distanciaKm).toBeGreaterThanOrEqual(min);
      expect(t.distanciaKm).toBeLessThanOrEqual(max);
    }
    // endpoint intermediário tem posto real, salvo "a confirmar" (sem_posto)
    if (!isLast) {
      if (t.alertas.includes('sem_posto')) expect(t.posto).toBeNull();
      else expect(t.posto?.placeId).toBeTruthy();
    } else {
      expect(t.posto).toBeNull(); // trecho final não tem posto
    }
  });
  // soma dos km bate com o total
  const soma = ts.reduce((s, t) => s + t.distanciaKm, 0);
  expect(Math.round(soma)).toBe(r.totalKm);
}

describe('dividirEmTrechos — caminho feliz', () => {
  test('600 km, faixa [100,200]: 4 trechos, postos reais, escolhe por rating na janela', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const stops = new FakeStops([
      { km: 150, rating: 4.5, reviews: 100, placeId: 'A150' },
      { km: 160, rating: 4.8, reviews: 500, placeId: 'A160' }, // melhor rating na janela → vence
      { km: 300, rating: 4.6, reviews: 300, placeId: 'B300' },
      { km: 310, rating: 4.5, reviews: 200, placeId: 'B310' },
      { km: 450, rating: 4.4, reviews: 150, placeId: 'C450' },
      { km: 460, rating: 4.7, reviews: 220, placeId: 'C460' },
    ]);
    const r = await dividirEmTrechos(input(600, 100, 200), rota, stops);
    checarInvariantes(r, 100, 200);
    expect(r.trechos).toHaveLength(4);
    expect(r.trechos.slice(0, 3).map((t) => t.posto?.placeId)).toEqual(['A160', 'B300', 'C460']);
    expect(r.trechos.every((t) => t.alertas.length === 0)).toBe(true);
    expect(r.trechos[0].rodovia).toBe('BR-101');
    expect(r.totalKm).toBe(600);
  });

  test('favorito vence mesmo com rating baixo', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([
      { km: 150, rating: 4.9, reviews: 900, placeId: 'TOP' },
      { km: 160, rating: 3.4, reviews: 20, placeId: 'FAV' },
    ]);
    const r = await dividirEmTrechos(input(300, 100, 200, ['FAV']), rota, stops);
    expect(r.trechos[0].posto?.placeId).toBe('FAV');
  });
});

describe('dividirEmTrechos — caso trivial (1 trecho)', () => {
  test('90 km, faixa [100,200]: 1 trecho, sem posto, sem chamada ao Places', async () => {
    const rota = new FakeRoute(rotaReta(90));
    const stops = new FakeStops([{ km: 40, rating: 5, reviews: 900, placeId: 'X' }]);
    const r = await dividirEmTrechos(input(90, 100, 200), rota, stops);
    expect(r.trechos).toHaveLength(1);
    expect(r.trechos[0].posto).toBeNull();
    expect(r.trechos[0].alertas).toEqual([]); // final isento do mínimo
    expect(stops.chamadas).toBe(0);
    checarInvariantes(r, 100, 200);
  });
});

describe('dividirEmTrechos — cascata sem posto na faixa', () => {
  test('recuar: sem posto em [80,120], há um antes do mínimo → trecho_curto', async () => {
    const rota = new FakeRoute(rotaReta(180));
    const stops = new FakeStops([{ km: 70, rating: 4.5, reviews: 100, placeId: 'ANTES' }]);
    const r = await dividirEmTrechos(input(180, 80, 120), rota, stops);
    expect(r.trechos[0].posto?.placeId).toBe('ANTES');
    expect(r.trechos[0].alertas).toContain('trecho_curto');
    expect(r.trechos[0].distanciaKm).toBeLessThan(80);
    checarInvariantes(r, 80, 120);
  });

  test('estender: sem posto até o máximo, há um além → trecho_longo', async () => {
    const rota = new FakeRoute(rotaReta(280));
    const stops = new FakeStops([
      { km: 140, rating: 4.5, reviews: 100, placeId: 'ALEM' },
      { km: 240, rating: 4.6, reviews: 200, placeId: 'OK' },
    ]);
    const r = await dividirEmTrechos(input(280, 80, 120), rota, stops);
    expect(r.trechos[0].posto?.placeId).toBe('ALEM');
    expect(r.trechos[0].alertas).toContain('trecho_longo');
    expect(r.trechos[0].distanciaKm).toBeGreaterThan(120);
    checarInvariantes(r, 80, 120);
  });
});

describe('dividirEmTrechos — deserto absoluto', () => {
  test('nenhum posto ao alcance → pontos "a confirmar" (sem_posto), sem quebrar o roteiro', async () => {
    const rota = new FakeRoute(rotaReta(400));
    const stops = new FakeStops([{ km: 300, rating: 4.6, reviews: 200, placeId: 'UNICO' }]);
    const r = await dividirEmTrechos(input(400, 80, 120), rota, stops);
    // primeiros trechos sem posto real
    expect(r.trechos[0].alertas).toContain('sem_posto');
    expect(r.trechos[0].posto).toBeNull();
    expect(r.trechos[0].destino.nome).toBe('Local a confirmar');
    // o posto real aparece quando entra ao alcance
    expect(r.trechos.some((t) => t.posto?.placeId === 'UNICO')).toBe(true);
    checarInvariantes(r, 80, 120);
  });
});

describe('dividirEmTrechos — avaliação baixa', () => {
  test('só postos abaixo do piso na janela → melhor disponível + avaliacao_baixa', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([
      { km: 150, rating: 3.5, reviews: 100, placeId: 'RUIM' },
      { km: 160, rating: 3.8, reviews: 200, placeId: 'MENOS_RUIM' },
    ]);
    const r = await dividirEmTrechos(input(300, 100, 200), rota, stops);
    expect(r.trechos[0].posto?.placeId).toBe('MENOS_RUIM'); // maior rating disponível
    expect(r.trechos[0].alertas).toContain('avaliacao_baixa');
    checarInvariantes(r, 100, 200);
  });

  test('nota alta mas poucas reviews não qualifica; um sólido próximo vence', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([
      { km: 150, rating: 4.9, reviews: 3, placeId: 'INFLADO' }, // reviews < 5
      { km: 160, rating: 4.3, reviews: 400, placeId: 'SOLIDO' },
    ]);
    const r = await dividirEmTrechos(input(300, 100, 200), rota, stops);
    expect(r.trechos[0].posto?.placeId).toBe('SOLIDO');
    expect(r.trechos[0].alertas).not.toContain('avaliacao_baixa');
  });
});
