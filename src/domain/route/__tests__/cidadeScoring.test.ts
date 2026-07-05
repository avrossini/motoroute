import type { Cidade } from '../types';
import { escolherCidade, type CidadeComKm } from '../cidadeScoring';

const cidade = (nome: string): Cidade => ({ placeId: nome, nome, lat: -20, lng: -45 });
const c = (nome: string, km: number, desvioRota: number): CidadeComKm => ({ cidade: cidade(nome), km, desvioRota });

describe('escolherCidade', () => {
  test('lista vazia retorna null', () => {
    expect(escolherCidade([], 200)).toBeNull();
  });

  test('desvio igual → mais perto do alvo vence', () => {
    const r = escolherCidade([c('longe', 240, 0), c('perto', 205, 0)], 200);
    expect(r!.cidade.nome).toBe('perto');
  });

  test('desvio da rota penaliza (peso 2): na-rota vence uma no alvo porém desviada', () => {
    // desviada: |200-200| + 2*30 = 60 ; narota: |215-200| + 2*0 = 15 → narota
    const r = escolherCidade([c('desviada', 200, 30), c('narota', 215, 0)], 200);
    expect(r!.cidade.nome).toBe('narota');
  });
});
