const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAX_RADIUS_KM = 50;

interface PlaceResult {
  place_id: string;
  name: string;
  rating: number | null;
  total_ratings: number | null;
  is_24h: boolean | null;
  latitude: number;
  longitude: number;
}

async function searchNearby(lat: number, lng: number, radiusM: number): Promise<PlaceResult[]> {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=gas_station&language=pt-BR&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(json.status);
  }
  return (json.results ?? []).map((r: any) => ({
    place_id: r.place_id,
    name: r.name,
    rating: r.rating ?? null,
    total_ratings: r.user_ratings_total ?? null,
    is_24h: r.opening_hours?.open_now ?? null,
    latitude: r.geometry.location.lat,
    longitude: r.geometry.location.lng,
  }));
}

function sortByRating(places: PlaceResult[]): PlaceResult[] {
  return [...places].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

export async function POST(request: Request): Promise<Response> {
  const { lat, lng } = await request.json();
  if (lat == null || lng == null) {
    return Response.json({ error: "lat, lng required" }, { status: 400 });
  }

  try {
    // Tier 1 + Tier 2: single 5km fetch, split by rating
    const nearby5km = await searchNearby(lat, lng, 5000);

    // Tier 1 — rating >= 4.0
    const tier1 = sortByRating(nearby5km.filter((p) => p.rating != null && p.rating >= 4.0));
    if (tier1.length > 0) {
      return Response.json({ results: tier1.slice(0, 5), low_rating: false, radius_km: 5 });
    }

    // Tier 2 — any rating within 5km
    const tier2 = sortByRating(nearby5km);
    if (tier2.length > 0) {
      return Response.json({ results: tier2.slice(0, 5), low_rating: true, radius_km: 5 });
    }

    // Tier 3 — expand radius 5km at a time
    for (let km = 10; km <= MAX_RADIUS_KM; km += 5) {
      const candidates = await searchNearby(lat, lng, km * 1000);
      if (candidates.length > 0) {
        const sorted = sortByRating(candidates);
        const bestRating = sorted[0].rating ?? 0;
        return Response.json({
          results: sorted.slice(0, 5),
          low_rating: bestRating < 4.0,
          radius_km: km,
        });
      }
    }

    return Response.json({ results: [], low_rating: false, radius_km: MAX_RADIUS_KM });
  } catch (err: any) {
    return Response.json({ error: err.message ?? "unknown" }, { status: 422 });
  }
}
