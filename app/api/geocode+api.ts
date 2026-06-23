const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function POST(request: Request): Promise<Response> {
  const { query } = await request.json();
  if (!query?.trim()) {
    return Response.json({ error: "query required" }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    return Response.json({ error: json.status }, { status: 422 });
  }

  const results = (json.results ?? []).slice(0, 5).map((r: any) => ({
    name: r.name,
    address: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
  }));

  return Response.json({ results });
}
