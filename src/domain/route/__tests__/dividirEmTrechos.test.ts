import type { DividirResult } from '../types';
import { dividirEmTrechos } from '../dividirEmTrechos';
import { rotaReta, FakeRoute, FakeStops, input } from '../__testkit';

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
