import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  let body: any;
  try { body = await request.json(); } catch (e) {
    await logError(request, { endpoint: "directions", error: e });
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { origin, destination } = body;

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

  let res: Response, json: any;
  try {
    res = await fetch(url);
    json = await res.json();
  } catch (e) {
    await logError(request, { endpoint: "directions", error: e, context: { origin, destination } });
    await logApiUsage(request, { provider: "google", api_type: "directions", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: "Directions fetch failed" }, { status: 502 });
  }

  if (json.status !== "OK") {
    await logApiUsage(request, { provider: "google", api_type: "directions", status: "error", duration_ms: Date.now() - start });
    return Response.json(
      { error: `Directions API: ${json.status}`, detail: json.error_message ?? "" },
      { status: 422 }
    );
  }

  await logApiUsage(request, { provider: "google", api_type: "directions", status: "success", duration_ms: Date.now() - start });
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
