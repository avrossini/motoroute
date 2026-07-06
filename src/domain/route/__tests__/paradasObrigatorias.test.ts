// Paradas obrigatórias (business-logic §11/§261/§476): a rota passa por elas, cada
// uma é bucketada ao seu dia (Expedição) e cravada como fronteira de trecho (Rolê),
// com precedência sobre a regra de km (sem trecho_curto/longo na fronteira obrigatória).
import { dividirEmDias } from '../dividirEmDias';
import { dividirEmTrechos } from '../dividirEmTrechos';
import { calcularRole } from '../calcularRole';
import {
  rotaReta,
  FakeRoute,
  FakeStops,
  FakeCities,
  inputDiasComParadas,
  inputComParadas,
} from '../__testkit';

const nomesDoDia = (d: { paradasObrigatorias?: { nome: string }[] }) =>
  (d.paradasObrigatorias ?? []).map((p) => p.nome);

describe('dividirEmDias — paradas obrigatórias bucketadas por dia', () => {
  const cities = () =>
    new FakeCities([
      { km: 195, nome: 'A' },
      { km: 200, nome: 'B' }, // pernoite dia 1 (alvo 200)
      { km: 395, nome: 'C' },
      { km: 400, nome: 'D' }, // pernoite dia 2 (alvo 400)
    ]);

  test('cada parada cai no dia cujo span a contém', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const r = await dividirEmDias(
      inputDiasComParadas(600, 3, [
        { km: 150, nome: 'P1' }, // dia 1 [0,200]
        { km: 300, nome: 'P2' }, // dia 2 (200,400]
      ]),
      rota,
      cities()
    );
    expect(r.dias).toHaveLength(3);
    expect(nomesDoDia(r.dias[0])).toEqual(['P1']);
    expect(nomesDoDia(r.dias[1])).toEqual(['P2']);
    expect(r.dias[2].paradasObrigatorias).toBeUndefined();
    // a divisão em dias não muda por paradas na rota (mesmas cidades)
    expect(r.dias.slice(0, 2).map((d) => d.cidade?.nome)).toEqual(['B', 'D']);
  });

  test('dia com parada FORA da rota inclui o desvio no km (esqueleto = gerado)', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const r = await dividirEmDias(
      inputDiasComParadas(600, 3, [{ km: 300, nome: 'Desvio', offKm: 50 }]),
      rota,
      cities()
    );
    expect(r.dias).toHaveLength(3);
    expect(nomesDoDia(r.dias[1])).toEqual(['Desvio']); // parada cai no dia 2
    // dia 2 = B(200)→Desvio(300, 50 km fora)→D(400): 100 + 100 + 2×50 de desvio = 300
    expect(r.dias[1].kmDia).toBe(300);
    expect(r.dias[0].kmDia).toBe(200); // O→B, sem desvio
    expect(r.dias[2].kmDia).toBe(200); // D→Destino, sem desvio
    expect(r.totalKm).toBe(700);
  });

  test('parada no último dia é bucketada ao dia N e o destino final é preservado', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const r = await dividirEmDias(inputDiasComParadas(600, 3, [{ km: 500, nome: 'PLast' }]), rota, cities());
    expect(nomesDoDia(r.dias[2])).toEqual(['PLast']);
    expect(r.dias[2].destino.nome).toBe('Destino');
    expect(r.dias[2].cidade).toBeNull();
  });

  test('parada exatamente na fronteira pertence ao dia anterior (determinístico)', async () => {
    const rota = new FakeRoute(rotaReta(600));
    const r = await dividirEmDias(inputDiasComParadas(600, 3, [{ km: 200, nome: 'PB' }]), rota, cities());
    expect(nomesDoDia(r.dias[0])).toEqual(['PB']); // km 200 == fim do dia 1 → dia 1
    expect(r.dias[1].paradasObrigatorias).toBeUndefined();
  });

  test('N=1 com parada: dia único, sem buscar cidade, parada no dia 1', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const cs = new FakeCities([{ km: 150, nome: 'X' }]);
    const r = await dividirEmDias(inputDiasComParadas(300, 1, [{ km: 150, nome: 'Meio' }]), rota, cs);
    expect(r.dias).toHaveLength(1);
    expect(r.dias[0].cidade).toBeNull();
    expect(cs.chamadas).toBe(0);
    expect(nomesDoDia(r.dias[0])).toEqual(['Meio']);
  });
});

describe('dividirEmTrechos — parada obrigatória como fronteira de trecho', () => {
  test('crava a parada (posto=null, nome do usuário) e a isenta da regra 100-200', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([{ km: 210, rating: 4.6, reviews: 200, placeId: 'P210' }]);
    const r = await dividirEmTrechos(
      inputComParadas(300, 100, 200, [{ km: 60, nome: 'OBRIG' }]),
      rota,
      stops
    );
    // trecho 0 termina na parada obrigatória, curto (60 km) mas SEM alerta
    expect(r.trechos[0].destino.nome).toBe('OBRIG');
    expect(r.trechos[0].posto).toBeNull();
    expect(r.trechos[0].distanciaKm).toBe(60);
    expect(r.trechos[0].alertas).toEqual([]); // precedência sobre o mínimo de 100
    // o próximo trecho ainda escolhe um posto real
    expect(r.trechos[1].posto?.placeId).toBe('P210');
    // encadeamento e soma preservados
    expect(r.trechos[1].origem.nome).toBe('OBRIG');
    expect(Math.round(r.trechos.reduce((s, t) => s + t.distanciaKm, 0))).toBe(r.totalKm);
    expect(r.trechos[r.trechos.length - 1].destino.nome).toBe('Destino');
  });

  test('parada praticamente na origem/destino não vira fronteira (sem trecho de ~0 km)', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([{ km: 150, rating: 4.6, reviews: 200, placeId: 'P150' }]);
    const r = await dividirEmTrechos(
      inputComParadas(300, 100, 200, [
        { km: 1, nome: 'QuaseOrigem' }, // a 1 km da origem → coincidente, não crava
        { km: 299, nome: 'QuaseDestino' }, // a 1 km do destino → coincidente, não crava
      ]),
      rota,
      stops
    );
    const nomes = r.trechos.map((t) => t.destino.nome);
    expect(nomes).not.toContain('QuaseOrigem');
    expect(nomes).not.toContain('QuaseDestino');
    expect(r.trechos.every((t) => t.distanciaKm >= 2)).toBe(true);
    expect(r.trechos[r.trechos.length - 1].destino.nome).toBe('Destino');
  });
});

describe('calcularRole — passa as paradas obrigatórias para a ida', () => {
  test('a parada do dia vira fronteira de trecho no Rolê', async () => {
    const rota = new FakeRoute(rotaReta(300));
    const stops = new FakeStops([{ km: 210, rating: 4.6, reviews: 200, placeId: 'P210' }]);
    const r = await calcularRole(
      { ...inputComParadas(300, 100, 200, [{ km: 60, nome: 'OBRIG' }]), idaEVolta: false },
      rota,
      stops
    );
    expect(r.trechos[0].destino.nome).toBe('OBRIG');
    expect(r.voltaInicio).toBeNull();
  });
});
