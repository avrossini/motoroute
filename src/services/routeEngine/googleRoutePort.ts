// Adapter real do RoutePort: envelopa o Google Directions (mesma URL do
// generate-segments) e normaliza para a forma que o núcleo consome.
import type { RoutePort, RawDirections, RawLeg, RawStep, Ponto } from '../../domain/route/types';
import { decodePolyline } from '../../domain/route/polyline';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const coord = (p: Ponto | string): string =>
  typeof p === 'string' ? encodeURIComponent(p) : `${p.lat},${p.lng}`;

/** Mapeia o JSON cru do Google Directions para RawDirections. Puro (testável offline). */
export function fromGoogleDirections(json: any): RawDirections {
  if (json?.status !== 'OK') {
    return { status: json?.status ?? 'ERRO', summary: '', pontos: [], legs: [] };
  }
  const route = json.routes?.[0] ?? {};
  const legs: RawLeg[] = (route.legs ?? []).map(
    (leg: any): RawLeg => ({
      distanceMeters: leg.distance?.value ?? 0,
      durationSeconds: leg.duration?.value ?? 0,
      start: { lat: leg.start_location?.lat, lng: leg.start_location?.lng },
      end: { lat: leg.end_location?.lat, lng: leg.end_location?.lng },
      steps: (leg.steps ?? []).map(
        (s: any): RawStep => ({
          distanceMeters: s.distance?.value ?? 0,
          durationSeconds: s.duration?.value ?? 0,
          end: { lat: s.end_location?.lat, lng: s.end_location?.lng },
          htmlInstructions: s.html_instructions ?? '',
        })
      ),
    })
  );
  return {
    status: 'OK',
    summary: route.summary ?? '',
    pontos: decodePolyline(route.overview_polyline?.points ?? ''),
    legs,
  };
}

export const googleRoutePort: RoutePort = {
  async getRoute(origem, destino, waypoints = []) {
    let url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${coord(origem)}&destination=${coord(destino)}` +
      `&mode=driving&language=pt-BR&key=${GOOGLE_KEY}`;
    if (waypoints.length > 0) {
      const wps = waypoints.map((w) => `${w.lat},${w.lng}`).join('|');
      url += `&waypoints=${encodeURIComponent(wps)}`;
    }
    const res = await fetch(url);
    return fromGoogleDirections(await res.json());
  },
};
