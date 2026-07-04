import type { Ponto, RawStep } from '../types';
import { construirCaminho, kmTotalCaminho, amostrarPontoNoAlvo, kmRodoviarioAte, rodoviaPrincipal } from '../routeWalk';
import { haversineKm } from '../geo';

// Pontos ao longo do paralelo -20, onde 1 km ao longo ≈ 1 km em linha reta.
const LAT = -20;
// Calibrado ao mesmo raio (6371) do haversineKm → 1 unidade = 1 km real, sem drift.
const KM_POR_GRAU = (6371 * Math.PI * Math.cos((LAT * Math.PI) / 180)) / 180;
const pontoNoKm = (km: number): Ponto => ({ lat: LAT, lng: -45 - km / KM_POR_GRAU });

describe('construirCaminho / kmTotalCaminho', () => {
  const caminho = construirCaminho([pontoNoKm(0), pontoNoKm(100), pontoNoKm(200)]);
  test('acumula km entre os pontos', () => {
    expect(caminho[0].cumKm).toBe(0);
    expect(caminho[1].cumKm).toBeCloseTo(100, 1);
    expect(caminho[2].cumKm).toBeCloseTo(200, 1);
  });
  test('kmTotalCaminho é o cumKm do último ponto', () => {
    expect(kmTotalCaminho(caminho)).toBeCloseTo(200, 1);
  });
  test('caminho vazio → 0', () => {
    expect(kmTotalCaminho([])).toBe(0);
  });
});

describe('amostrarPontoNoAlvo', () => {
  // caminho fino: 1 ponto por km até 400 km
  const caminho = construirCaminho(Array.from({ length: 401 }, (_, k) => pontoNoKm(k)));
  test('amostra perto do km alvo (granularidade fina, não presa a steps)', () => {
    const p = amostrarPontoNoAlvo(caminho, 150);
    expect(haversineKm(p, pontoNoKm(150))).toBeLessThan(1.5); // dentro de ~1 ponto do alvo
  });
  test('alvo além do total retorna o último ponto', () => {
    const p = amostrarPontoNoAlvo(caminho, 999);
    expect(haversineKm(p, pontoNoKm(400))).toBeLessThan(1.5);
  });
});

describe('kmRodoviarioAte', () => {
  const caminho = construirCaminho(Array.from({ length: 401 }, (_, k) => pontoNoKm(k)));
  test('projeta o posto ao ponto mais próximo do caminho', () => {
    expect(kmRodoviarioAte(caminho, pontoNoKm(150), 0)).toBeCloseTo(150, 0);
  });
  test('considera só pontos à frente de desdeKm (nunca volta a 150)', () => {
    const km = kmRodoviarioAte(caminho, pontoNoKm(150), 250);
    expect(km).toBeGreaterThanOrEqual(249);
    expect(km).toBeLessThanOrEqual(252);
  });
});

describe('rodoviaPrincipal', () => {
  test('escolhe a rodovia com mais metros', () => {
    const steps: RawStep[] = [
      { distanceMeters: 5000, durationSeconds: 200, end: pontoNoKm(5), htmlInstructions: 'on <b>BR-116</b>' },
      { distanceMeters: 120000, durationSeconds: 5400, end: pontoNoKm(125), htmlInstructions: 'Continue on <b>BR-376</b>' },
      { distanceMeters: 3000, durationSeconds: 120, end: pontoNoKm(128), htmlInstructions: 'Take <b>SP-280</b>' },
    ];
    expect(rodoviaPrincipal(steps)).toBe('BR-376');
  });
  test('sem rodovia reconhecível → string vazia', () => {
    const steps: RawStep[] = [{ distanceMeters: 1000, durationSeconds: 60, end: pontoNoKm(1), htmlInstructions: 'Head <b>north</b>' }];
    expect(rodoviaPrincipal(steps)).toBe('');
  });
});
