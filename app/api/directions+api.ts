const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function POST(request: Request): Promise<Response> {
  const { origin, destination } = await request.json();

  if (!origin || !destination) {
    return Response.json({ error: "origin and destination required" }, { status: 400 });
  }

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&mode=driving` +
    `&language=pt-BR` +
    `&key=${GOOGLE_KEY}`;

  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK") {
    return Response.json(
      { error: `Directions API: ${json.status}`, detail: json.error_message ?? "" },
      { status: 422 }
    );
  }

  const leg = json.routes[0].legs[0];
  return Response.json({
    distanceKm: leg.distance.value / 1000,
    durationMinutes: Math.round(leg.duration.value / 60),
    routeSummary: json.routes[0].summary ?? "",
    originLat: leg.start_location.lat,
    originLng: leg.start_location.lng,
    destLat: leg.end_location.lat,
    destLng: leg.end_location.lng,
  });
}
