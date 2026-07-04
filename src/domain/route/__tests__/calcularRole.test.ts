import { calcularRole } from '../calcularRole';
import { rotaReta, FakeRoute, FakeStops, input } from '../__testkit';

describe('calcularRole', () => {
  test('só ida delega ao primitivo', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([{ km: 150, rating: 4.6, reviews: 200, placeId: 'P150' }]);
    const r = await calcularRole({ ...input(300, 100, 200), idaEVolta: false }, rota, stops);
    expect(r.trechos[0].posto?.placeId).toBe('P150');
    expect(r.trechos[r.trechos.length - 1].destino.nome).toBe('Destino');
    expect(r.voltaInicio).toBeNull();
  });

  test('ida e volta concatena, reindexa ordem e soma os totais', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([{ km: 150, rating: 4.6, reviews: 200, placeId: 'P150' }]);
    const soIda = await calcularRole({ ...input(300, 100, 200), idaEVolta: false }, rota, stops);
    const idaEVolta = await calcularRole({ ...input(300, 100, 200), idaEVolta: true }, rota, stops);

    // rota simétrica no harness → volta tem o mesmo nº de trechos da ida
    expect(idaEVolta.trechos).toHaveLength(soIda.trechos.length * 2);
    // ordem contígua 0..N-1
    expect(idaEVolta.trechos.map((t) => t.ordem)).toEqual(idaEVolta.trechos.map((_, i) => i));
    // totais somados
    expect(idaEVolta.totalKm).toBe(soIda.totalKm * 2);
    expect(idaEVolta.totalMin).toBe(soIda.totalMin * 2);
    // voltaInicio aponta o 1º trecho da volta
    expect(idaEVolta.voltaInicio).toBe(soIda.trechos.length);
    // a volta parte do Destino e termina na Origem
    const primeiroDaVolta = idaEVolta.trechos[idaEVolta.voltaInicio!];
    expect(primeiroDaVolta.origem.nome).toBe('Destino');
    expect(idaEVolta.trechos[idaEVolta.trechos.length - 1].destino.nome).toBe('Origem');
  });
});
