import type { DividirEmDiasResult } from '../types';
import { dividirEmDias } from '../dividirEmDias';
import { rotaReta, FakeRoute, FakeCities, inputDias } from '../__testkit';

function checarInvariantes(r: DividirEmDiasResult, nDias: number) {
  expect(r.dias).toHaveLength(nDias);
  expect(r.dias[0].origem.nome).toBe('Origem');
  const ultimo = r.dias[r.dias.length - 1];
  expect(ultimo.destino.nome).toBe('Destino');
  expect(ultimo.cidade).toBeNull(); // último dia termina no destino do usuário
  r.dias.forEach((d, i) => {
    expect(d.dia).toBe(i + 1);
    const isLast = i === r.dias.length - 1;
    if (!isLast) {
      expect(r.dias[i + 1].origem).toEqual(d.destino); // encadeamento
      if (!d.alertas.includes('sem_cidade')) expect(d.cidade?.placeId).toBeTruthy();
    }
  });
  expect(Math.round(r.dias.reduce((s, d) => s + d.kmDia, 0))).toBe(r.totalKm);
}

describe('dividirEmDias — divisão igual', () => {
  test('600 km / 3 dias → ~200/dia, cidades mais perto do alvo', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const cities = new FakeCities([
      { km: 195, nome: 'Cidade-A' },
      { km: 200, nome: 'Cidade-B' }, // vence no dia 1 (alvo 200)
      { km: 395, nome: 'Cidade-C' },
      { km: 400, nome: 'Cidade-D' }, // vence no dia 2 (alvo 400)
    ]);
    const r = await dividirEmDias(inputDias(600, 3), rota, cities);
    checarInvariantes(r, 3);
    expect(r.dias.slice(0, 2).map((d) => d.cidade?.nome)).toEqual(['Cidade-B', 'Cidade-D']);
    expect(r.dias.every((d) => d.alertas.length === 0)).toBe(true);
    expect(r.totalKm).toBe(600);
  });
});

describe('dividirEmDias — re-âncora', () => {
  test('cidade do dia 1 desvia do alvo → dias seguintes compensam e ficam iguais entre si', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const cities = new FakeCities([
      { km: 240, nome: 'Longe' }, // única na janela do alvo 200 (40 km além)
      { km: 420, nome: 'Meio' },
    ]);
    const r = await dividirEmDias(inputDias(600, 3), rota, cities);
    checarInvariantes(r, 3);
    expect(r.dias[0].cidade?.nome).toBe('Longe');
    expect(r.dias[0].kmDia).toBeGreaterThan(r.dias[1].kmDia);
    expect(Math.abs(r.dias[1].kmDia - r.dias[2].kmDia)).toBeLessThan(5); // re-âncora equilibrou o resto
  });
});

describe('dividirEmDias — sem cidade', () => {
  test('nenhuma cidade ao alcance do dia 1 → "a confirmar" (sem_cidade), sem quebrar', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const cities = new FakeCities([{ km: 400, nome: 'Unica' }]); // 200 km além do alvo do dia 1
    const r = await dividirEmDias(inputDias(600, 3), rota, cities);
    checarInvariantes(r, 3);
    expect(r.dias[0].alertas).toContain('sem_cidade');
    expect(r.dias[0].cidade).toBeNull();
    expect(r.dias[0].destino.nome).toBe('Local a confirmar');
    expect(r.dias.some((d) => d.cidade?.nome === 'Unica')).toBe(true);
  });
});

describe('dividirEmDias — N=1', () => {
  test('1 dia único O→D, sem buscar cidade', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const cities = new FakeCities([{ km: 150, nome: 'X' }]);
    const r = await dividirEmDias(inputDias(300, 1), rota, cities);
    expect(r.dias).toHaveLength(1);
    expect(r.dias[0].cidade).toBeNull();
    expect(cities.chamadas).toBe(0);
    checarInvariantes(r, 1);
  });
});

describe('dividirEmDias — alerta de km/dia', () => {
  test('1400 km / 2 dias → 700/dia, dia_extremo nos dois', async () => {
    const rota = new FakeRoute(rotaReta(1400));
    const cities = new FakeCities([{ km: 700, nome: 'Meio' }]);
    const r = await dividirEmDias(inputDias(1400, 2), rota, cities);
    checarInvariantes(r, 2);
    expect(r.dias[0].alertas).toContain('dia_extremo');
    expect(r.dias[1].alertas).toContain('dia_extremo');
  });
});

describe('dividirEmDias — desvio da rota', () => {
  test('mesmo km, escolhe a cidade de menor desvio da rota', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const cities = new FakeCities([
      { km: 150, nome: 'NaRota', offKm: 0 },
      { km: 150, nome: 'Desviada', offKm: 40 },
    ]);
    const r = await dividirEmDias(inputDias(300, 2), rota, cities);
    expect(r.dias[0].cidade?.nome).toBe('NaRota');
  });
});
