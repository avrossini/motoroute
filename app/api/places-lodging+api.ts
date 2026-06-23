const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Forward geocode a city/address to coordinates
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pt-BR&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" || !json.results?.length) return null;
  const loc = json.results[0].geometry.location;
  const label = json.results[0].address_components?.[0]?.long_name ?? address;
  return { lat: loc.lat, lng: loc.lng, label };
}

export async function POST(request: Request): Promise<Response> {
  const { city, lat, lng } = await request.json();

  let refLat: number = lat;
  let refLng: number = lng;
  let refLabel: string = city ?? "";

  // If coordinates not provided, geocode the city
  if ((refLat == null || refLng == null) && city) {
    const geo = await geocodeAddress(city);
    if (!geo) {
      return Response.json({ error: "Não foi possível geocodificar a cidade" }, { status: 422 });
    }
    refLat = geo.lat;
    refLng = geo.lng;
    refLabel = geo.label;
  }

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${refLat},${refLng}&radius=10000&type=lodging&language=pt-BR&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    return Response.json({ error: json.status }, { status: 422 });
  }

  const results = (json.results ?? [])
    .filter((r: any) => (r.rating ?? 0) >= 3.8)
    .slice(0, 8)
    .map((r: any) => {
      const rLat: number = r.geometry.location.lat;
      const rLng: number = r.geometry.location.lng;
      const distM = Math.round(
        Math.sqrt(Math.pow((rLat - refLat) * 111000, 2) + Math.pow((rLng - refLng) * 111000 * Math.cos((refLat * Math.PI) / 180), 2))
      );
      return {
        place_id: r.place_id,
        name: r.name,
        rating: r.rating ?? null,
        total_ratings: r.user_ratings_total ?? null,
        price_level: r.price_level ?? null,
        latitude: rLat,
        longitude: rLng,
        distance_m: distM,
        vicinity: r.vicinity ?? "",
      };
    })
    .sort((a: any, b: any) => a.distance_m - b.distance_m);

  return Response.json({ results, ref_lat: refLat, ref_lng: refLng, ref_label: refLabel });
}
