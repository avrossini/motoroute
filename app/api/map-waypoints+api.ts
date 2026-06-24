const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
// In Docker the expo container can't reach localhost:54321 — use internal service name instead
const SUPABASE_REST =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace("localhost:54321", "kong:8000");

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tripId = url.searchParams.get("trip_id");

  if (!tripId) {
    return Response.json({ error: "trip_id required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization") ?? `Bearer ${SUPABASE_ANON}`;

  const select = "order_index,origin_name,destination_name,origin_lat,origin_lng,dest_lat,dest_lng,distance_km,duration_minutes,weather_condition,weather_temp_max,is_last_of_day,day_index";
  const restUrl = `${SUPABASE_REST}/rest/v1/segments?trip_id=eq.${encodeURIComponent(tripId)}&select=${select}&order=order_index.asc`;

  const res = await fetch(restUrl, {
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: text }, { status: res.status });
  }

  const segs: any[] = await res.json();

  if (!segs || segs.length === 0) {
    return Response.json({ origin: null, destination: null, waypoints: [] });
  }

  const first = segs[0];
  const last = segs[segs.length - 1];

  const origin = {
    lat: first.origin_lat,
    lng: first.origin_lng,
    name: first.origin_name ?? "",
  };

  const destination = {
    lat: last.dest_lat,
    lng: last.dest_lng,
    name: last.destination_name ?? "",
  };

  // All segments except the last one provide their destination as a waypoint
  const waypoints = segs
    .slice(0, -1)
    .map((s) => ({
      lat: s.dest_lat,
      lng: s.dest_lng,
      name: s.destination_name ?? "",
      distanceKm: s.distance_km,
      durationMin: s.duration_minutes,
      weatherCondition: s.weather_condition ?? null,
      weatherTemp: s.weather_temp_max ?? null,
      dayIndex: s.day_index,
    }));

  return Response.json({ origin, destination, waypoints });
}
