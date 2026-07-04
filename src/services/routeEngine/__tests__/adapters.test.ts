import { fromGoogleDirections } from '../googleRoutePort';
import { fromGooglePlaces } from '../googleStopsPort';

describe('fromGoogleDirections', () => {
  test('mapeia status, summary, legs e steps', () => {
    const json = {
      status: 'OK',
      routes: [
        {
          summary: 'BR-116',
          overview_polyline: { points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }, // 3 pontos (exemplo do Google)
          legs: [
            {
              distance: { value: 120000 },
              duration: { value: 5400 },
              start_location: { lat: -23, lng: -46 },
              end_location: { lat: -24, lng: -47 },
              steps: [
                { distance: { value: 120000 }, duration: { value: 5400 }, end_location: { lat: -24, lng: -47 }, html_instructions: 'on <b>BR-116</b>' },
              ],
            },
          ],
        },
      ],
    };
    const r = fromGoogleDirections(json);
    expect(r.status).toBe('OK');
    expect(r.summary).toBe('BR-116');
    expect(r.legs[0].distanceMeters).toBe(120000);
    expect(r.legs[0].durationSeconds).toBe(5400);
    expect(r.legs[0].steps[0].htmlInstructions).toContain('BR-116');
    expect(r.pontos).toHaveLength(3); // overview_polyline decodificada
  });

  test('status != OK devolve legs vazias', () => {
    expect(fromGoogleDirections({ status: 'ZERO_RESULTS' }).legs).toEqual([]);
  });
});

describe('fromGooglePlaces', () => {
  test('normaliza campos e trata ausências', () => {
    const json = {
      status: 'OK',
      results: [
        { place_id: 'p1', name: 'Posto A', rating: 4.5, user_ratings_total: 200, opening_hours: { open_now: true }, geometry: { location: { lat: -23, lng: -46 } } },
        { place_id: 'p2', name: 'Posto B', geometry: { location: { lat: -24, lng: -47 } } },
      ],
    };
    const ps = fromGooglePlaces(json);
    expect(ps[0]).toMatchObject({ placeId: 'p1', nome: 'Posto A', rating: 4.5, totalRatings: 200, is24h: true, lat: -23, lng: -46 });
    expect(ps[1]).toMatchObject({ placeId: 'p2', rating: null, totalRatings: null, is24h: null });
  });

  test('ZERO_RESULTS devolve lista vazia', () => {
    expect(fromGooglePlaces({ status: 'ZERO_RESULTS', results: [] })).toEqual([]);
  });

  test('status de erro lança', () => {
    expect(() => fromGooglePlaces({ status: 'REQUEST_DENIED' })).toThrow('REQUEST_DENIED');
  });
});
