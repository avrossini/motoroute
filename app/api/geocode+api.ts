import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  const { query } = await request.json();
  if (!query?.trim()) {
    return Response.json({ error: "query required" }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${GOOGLE_KEY}`;
  let res: Response, json: any;
  try {
    res = await fetch(url);
    json = await res.json();
  } catch (e) {
    await logError(request, { endpoint: "geocode", error: e, context: { query } });
    await logApiUsage(request, { provider: "google", api_type: "geocoding", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: "Geocode fetch failed" }, { status: 502 });
  }

  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    // Loga o motivo do Google (error_message) para diagnostico; nao expoe ao cliente.
    await logApiUsage(request, {
      provider: "google", api_type: "geocoding", status: "error", duration_ms: Date.now() - start,
      error_code: json.status, metadata: { endpoint: "geocode", error_message: json.error_message ?? null },
    });
    return Response.json({ error: json.status }, { status: 422 });
  }

  await logApiUsage(request, { provider: "google", api_type: "geocoding", status: "success", duration_ms: Date.now() - start });
  const results = (json.results ?? []).slice(0, 5).map((r: any) => ({
    name: r.name,
    address: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
  }));

  return Response.json({ results });
}
