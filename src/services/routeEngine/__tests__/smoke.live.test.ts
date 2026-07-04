// Smoke AO VIVO contra Google Directions/Places reais. Fica FORA do gate normal:
// só roda quando LIVE_SMOKE=1 e a chave está no ambiente. Serve para eyeball do
// primitivo com dados reais — não é teste determinístico.
//
// Rodar:
//   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=$(grep ^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY= .env.local | cut -d= -f2-) \
//   LIVE_SMOKE=1 node node_modules/jest/bin/jest.js smoke.live
import { dividirEmTrechos } from '../../../domain/route/dividirEmTrechos';
import { googleRoutePort } from '../googleRoutePort';
import { googleStopsPort } from '../googleStopsPort';

const LIVE = !!process.env.LIVE_SMOKE && !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const rodar = LIVE ? test : test.skip;

rodar(
  'SP → Curitiba, faixa [100,200] km',
  async () => {
    const r = await dividirEmTrechos(
      {
        origem: { nome: 'São Paulo, SP', lat: -23.5505, lng: -46.6333 },
        destino: { nome: 'Curitiba, PR', lat: -25.4284, lng: -49.2733 },
        faixa: { min: 100, max: 200 },
        favoritos: new Set(),
      },
      googleRoutePort,
      googleStopsPort
    );

    // eslint-disable-next-line no-console
    console.log(
      `\nTotal ${r.totalKm} km · ${Math.floor(r.totalMin / 60)}h${String(r.totalMin % 60).padStart(2, '0')} · ${r.trechos.length} trechos`
    );
    for (const t of r.trechos) {
      const alvo = t.posto
        ? `⛽ ${t.posto.nome} ★${t.posto.rating ?? '—'} (${t.posto.totalRatings ?? 0})`
        : `🏁 ${t.destino.nome}`;
      // eslint-disable-next-line no-console
      console.log(
        `  ${String(t.ordem).padStart(2)} · ${String(t.distanciaKm).padStart(6)} km · ${alvo}${t.alertas.length ? '  ⚠ ' + t.alertas.join(',') : ''}`
      );
    }

    // Invariantes mínimas com dados reais.
    expect(r.trechos.length).toBeGreaterThan(1);
    expect(r.trechos[0].origem.nome).toBe('São Paulo, SP');
    expect(r.trechos[r.trechos.length - 1].destino.nome).toBe('Curitiba, PR');
    for (let i = 0; i < r.trechos.length - 1; i++) {
      const t = r.trechos[i];
      if (!t.alertas.includes('sem_posto')) expect(t.posto?.placeId).toBeTruthy();
    }
  },
  60000
);
