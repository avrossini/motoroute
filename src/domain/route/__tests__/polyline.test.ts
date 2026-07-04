import { decodePolyline } from '../polyline';

describe('decodePolyline', () => {
  test('decodifica o exemplo canônico do Google', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0].lat).toBeCloseTo(38.5, 5);
    expect(pts[0].lng).toBeCloseTo(-120.2, 5);
    expect(pts[1].lat).toBeCloseTo(40.7, 5);
    expect(pts[1].lng).toBeCloseTo(-120.95, 5);
    expect(pts[2].lat).toBeCloseTo(43.252, 5);
    expect(pts[2].lng).toBeCloseTo(-126.453, 5);
  });

  test('string vazia → nenhum ponto', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
