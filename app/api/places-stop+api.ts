import { ExpoRequest, ExpoResponse } from "expo-router/server";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function POST(request: ExpoRequest): Promise<ExpoResponse> {
  const { lat, lng } = await request.json();
  if (lat == null || lng == null) {
    return ExpoResponse.json({ error: "lat, lng required" }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=gas_station&language=pt-BR&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    return ExpoResponse.json({ error: json.status }, { status: 422 });
  }

  const results = (json.results ?? [])
    .filter((r: any) => (r.rating ?? 0) >= 4.0)
    .slice(0, 5)
    .map((r: any) => ({
      place_id: r.place_id,
      name: r.name,
      rating: r.rating ?? null,
      total_ratings: r.user_ratings_total ?? null,
      is_24h: r.opening_hours?.open_now ?? null,
      latitude: r.geometry.location.lat,
      longitude: r.geometry.location.lng,
    }));

  return ExpoResponse.json({ results });
}
