// Adapter real do StopsPort: envelopa o Google Places nearbysearch (mesma
// lógica do places-stop) e normaliza para Posto[].
import type { StopsPort, Posto } from '../../domain/route/types';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

/** Mapeia o JSON cru do Places nearbysearch para Posto[]. Puro (testável offline). */
export function fromGooglePlaces(json: any): Posto[] {
  if (json?.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Places: ${json.status}`);
  }
  return (json?.results ?? []).map(
    (r: any): Posto => ({
      placeId: r.place_id,
      nome: r.name,
      rating: r.rating ?? null,
      totalRatings: r.user_ratings_total ?? null,
      is24h: r.opening_hours?.open_now ?? null,
      lat: r.geometry?.location?.lat,
      lng: r.geometry?.location?.lng,
    })
  );
}

export const googleStopsPort: StopsPort = {
  async searchStops(lat, lng, raioM) {
    const url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lng}&radius=${raioM}&type=gas_station&language=pt-BR&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    return fromGooglePlaces(await res.json());
  },
};
