import type { Posto, FaixaKm } from '../types';
import { resolverSemPosto } from '../cascata';
import type { PostoComKm } from '../scoring';

let seq = 0;
function posto(rating: number, totalRatings: number, placeId?: string): Posto {
  return { placeId: placeId ?? `p${seq++}`, nome: 'Posto', rating, totalRatings, is24h: null, lat: -23, lng: -46 };
}
const comKm = (p: Posto, km: number): PostoComKm => ({ posto: p, km });
const FAIXA: FaixaKm = { min: 100, max: 200 };
const SEM_FAV = new Set<string>();

describe('resolverSemPosto — cascata sem posto na faixa', () => {
  test('recua quando há posto antes do mínimo', () => {
    const p = posto(4.5, 50, 'ANTES');
    const r = resolverSemPosto([comKm(p, 80)], 0, FAIXA, SEM_FAV); // rel 80 < min 100
    expect(r.tipo).toBe('recuar');
    if (r.tipo === 'recuar') expect(r.escolha.posto.placeId).toBe('ANTES');
  });

  test('estende quando não há antes do mínimo, só além do máximo', () => {
    const p = posto(4.5, 50, 'ALEM');
    const r = resolverSemPosto([comKm(p, 250)], 0, FAIXA, SEM_FAV); // rel 250 > max 200
    expect(r.tipo).toBe('estender');
    if (r.tipo === 'estender') expect(r.escolha.posto.placeId).toBe('ALEM');
  });

  test('prefere recuar a estender quando ambos existem', () => {
    const antes = posto(4.5, 50, 'ANTES');
    const alem = posto(4.9, 900, 'ALEM');
    const r = resolverSemPosto([comKm(alem, 250), comKm(antes, 80)], 0, FAIXA, SEM_FAV);
    expect(r.tipo).toBe('recuar');
  });

  test('vazio quando não há candidato fora da faixa', () => {
    const dentro = posto(4.5, 50, 'DENTRO');
    const r = resolverSemPosto([comKm(dentro, 150)], 0, FAIXA, SEM_FAV); // rel 150 ∈ [100,200]
    expect(r.tipo).toBe('vazio');
  });

  test('vazio quando lista vazia', () => {
    expect(resolverSemPosto([], 0, FAIXA, SEM_FAV).tipo).toBe('vazio');
  });
});
