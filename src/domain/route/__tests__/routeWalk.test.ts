import type { RawLeg, RawStep } from '../types';
import { acumularSteps, kmTotal, amostrarPontoNoAlvo, kmRodoviarioAte } from '../routeWalk';

function step(distanceMeters: number, lat: number, lng: number): RawStep {
  return { distanceMeters, durationSeconds: (distanceMeters / 1000 / 80) * 3600, end: { lat, lng }, htmlInstructions: '' };
}

// 4 steps de 100 km cada, ao longo do paralelo -23.0 indo para oeste.
const leg: RawLeg = {
  distanceMeters: 400000,
  durationSeconds: 18000,
  start: { lat: -23.0, lng: -46.0 },
  end: { lat: -23.0, lng: -48.0 },
  steps: [
    step(100000, -23.0, -46.5), // cumKm 100
    step(100000, -23.0, -47.0), // cumKm 200
    step(100000, -23.0, -47.5), // cumKm 300
    step(100000, -23.0, -48.0), // cumKm 400
  ],
};

describe('acumularSteps / kmTotal', () => {
  const steps = acumularSteps(leg);
  test('acumula km corretamente', () => {
    expect(steps.map((s) => s.cumKm)).toEqual([100, 200, 300, 400]);
  });
  test('kmTotal é o cumKm do último step', () => {
    expect(kmTotal(steps)).toBe(400);
  });
  test('kmTotal de rota vazia é 0', () => {
    expect(kmTotal([])).toBe(0);
  });
});

describe('amostrarPontoNoAlvo', () => {
  const steps = acumularSteps(leg);
  test('retorna o end do 1º step que cruza o alvo', () => {
    expect(amostrarPontoNoAlvo(steps, 150)).toEqual({ lat: -23.0, lng: -47.0 }); // step1 (cumKm 200)
  });
  test('alvo exatamente no corte pega aquele step', () => {
    expect(amostrarPontoNoAlvo(steps, 100)).toEqual({ lat: -23.0, lng: -46.5 }); // step0
  });
  test('alvo além do total retorna o último ponto', () => {
    expect(amostrarPontoNoAlvo(steps, 999)).toEqual({ lat: -23.0, lng: -48.0 });
  });
});

describe('kmRodoviarioAte', () => {
  const steps = acumularSteps(leg);
  test('projeta o posto ao step-end mais próximo', () => {
    const posto = { lat: -23.0, lng: -47.02 }; // pertinho do fim do step1
    expect(kmRodoviarioAte(steps, posto, 0)).toBe(200);
  });
  test('considera só steps à frente de desdeKm', () => {
    const posto = { lat: -23.0, lng: -47.02 }; // mais perto do step1 (200), mas...
    // com desdeKm=250, step1 é ignorado; o mais próximo à frente é o step2 (300)
    expect(kmRodoviarioAte(steps, posto, 250)).toBe(300);
  });
});
