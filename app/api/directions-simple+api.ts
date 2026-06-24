const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const oLat = url.searchParams.get("origin_lat");
  const oLng = url.searchParams.get("origin_lng");
  const dLat = url.searchParams.get("dest_lat");
  const dLng = url.searchParams.get("dest_lng");

  if (!oLat || !oLng || !dLat || !dLng) {
    return Response.json({ error: "origin_lat, origin_lng, dest_lat, dest_lng required" }, { status: 400 });
  }

  const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${oLat},${oLng}&destination=${dLat},${dLng}&language=pt-BR&key=${GOOGLE_KEY}`;
  const res = await fetch(directionsUrl);
  const json = await res.json();

  if (json.status !== "OK") {
    return Response.json({ error: json.status }, { status: 422 });
  }

  const leg = json.routes[0]?.legs[0];
  const distance_km: number = (leg?.distance?.value ?? 0) / 1000;
  const duration_min: number = Math.round((leg?.duration?.value ?? 0) / 60);

  return Response.json({ distance_km, duration_min });
}
