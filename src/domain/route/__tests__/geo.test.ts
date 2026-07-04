import { haversineKm } from '../geo';

describe('haversineKm', () => {
  test('mesma coordenada retorna 0', () => {
    const p = { lat: -23.5505, lng: -46.6333 };
    expect(haversineKm(p, p)).toBe(0);
  });

  test('SP → Campinas em linha reta ~80 km (entre 70 e 100)', () => {
    const sp = { lat: -23.5505, lng: -46.6333 };
    const campinas = { lat: -22.9099, lng: -47.0626 };
    const d = haversineKm(sp, campinas);
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(100);
  });

  test('é simétrica', () => {
    const a = { lat: -23.5, lng: -46.6 };
    const b = { lat: -22.9, lng: -47.0 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});
