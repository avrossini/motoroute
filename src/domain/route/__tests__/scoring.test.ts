import type { Posto } from '../types';
import { escolherPosto, type PostoComKm } from '../scoring';

let seq = 0;
function posto(rating: number | null, totalRatings: number | null, placeId?: string): Posto {
  return {
    placeId: placeId ?? `p${seq++}`,
    nome: 'Posto',
    rating,
    totalRatings,
    is24h: null,
    lat: -23,
    lng: -46,
  };
}
const comKm = (p: Posto, km: number): PostoComKm => ({ posto: p, km });
const SEM_FAV = new Set<string>();

describe('escolherPosto — cascata de qualidade', () => {
  test('lista vazia retorna null', () => {
    expect(escolherPosto([], 200, SEM_FAV)).toBeNull();
  });

  test('favorito vence mesmo abaixo do piso de rating', () => {
    const fav = posto(3.5, 100, 'FAV');
    const bom = posto(4.8, 500);
    const r = escolherPosto([comKm(bom, 200), comKm(fav, 200)], 200, new Set(['FAV']));
    expect(r!.posto.placeId).toBe('FAV');
    expect(r!.avaliacaoBaixa).toBe(false);
  });

  test('qualificado (rating≥4 e reviews≥5) vence não-qualificado de nota alta com poucas reviews', () => {
    const solido = posto(4.6, 200, 'SOLIDO');
    const infladinho = posto(4.9, 3, 'INFLADO'); // reviews < 5 → não qualifica
    const r = escolherPosto([comKm(infladinho, 200), comKm(solido, 200)], 200, SEM_FAV);
    expect(r!.posto.placeId).toBe('SOLIDO');
    expect(r!.avaliacaoBaixa).toBe(false);
  });

  test('nenhum qualificado → melhor disponível com avaliacaoBaixa=true', () => {
    const a = posto(3.8, 100, 'A');
    const b = posto(3.9, 200, 'B');
    const r = escolherPosto([comKm(a, 200), comKm(b, 200)], 200, SEM_FAV);
    expect(r!.posto.placeId).toBe('B'); // maior rating
    expect(r!.avaliacaoBaixa).toBe(true);
  });

  test('empate de rating desempata pela proximidade do alvo', () => {
    const perto = posto(4.5, 100, 'PERTO');
    const longe = posto(4.5, 100, 'LONGE');
    const r = escolherPosto([comKm(longe, 190), comKm(perto, 203)], 200, SEM_FAV);
    expect(r!.posto.placeId).toBe('PERTO'); // |203-200|=3 < |190-200|=10
  });
});
