const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

async function directions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ km: number; min: number }> {
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${originLat},${originLng}` +
    `&destination=${destLat},${destLng}` +
    `&mode=driving&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" || !json.routes[0]) throw new Error(`Directions: ${json.status}`);
  const leg = json.routes[0].legs[0];
  return {
    km: Math.round(leg.distance.value / 100) / 10,
    min: Math.round(leg.duration.value / 60),
  };
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();

  // Phase 3a — preview for local insertion (splits one segment into two)
  if (body.action === "preview") {
    const { originLat, originLng, destLat, destLng, pointLat, pointLng, originalKm, originalMin } = body;
    const [segA, segB] = await Promise.all([
      directions(originLat, originLng, pointLat, pointLng),
      directions(pointLat, pointLng, destLat, destLng),
    ]);
    return Response.json({
      segAKm: segA.km,
      segAMin: segA.min,
      segBKm: segB.km,
      segBMin: segB.min,
      deltaKm: Math.round((segA.km + segB.km - (originalKm as number)) * 10) / 10,
      deltaMin: segA.min + segB.min - (originalMin as number),
    });
  }

  // Phase 3b — preview for global restructure (full route with new waypoint)
  if (body.action === "preview_global") {
    const { origin, destination, waypointsLatLng } = body as {
      origin: string;
      destination: string;
      waypointsLatLng: { lat: number; lng: number }[];
    };
    const wps = waypointsLatLng.map((w) => `${w.lat},${w.lng}`).join("|");
    let url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&mode=driving&key=${GOOGLE_KEY}`;
    if (wps) url += `&waypoints=${encodeURIComponent(wps)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "OK" || !json.routes[0]) {
      return Response.json({ error: json.status }, { status: 422 });
    }
    const legs = json.routes[0].legs;
    const totalKm = Math.round(legs.reduce((s: number, l: any) => s + l.distance.value / 1000, 0));
    const totalMin = legs.reduce((s: number, l: any) => s + Math.round(l.duration.value / 60), 0);
    return Response.json({ totalKm, totalMin });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
