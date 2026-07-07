import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

interface PlaceSearchResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  total_ratings: number | null;
  is_24h: boolean | null;
  types: string[];
}

// Busca de texto (Places Text Search) para a inserção MANUAL de parada no Rolê.
//   mode 'fuel' (padrão) → prioriza postos (type=gas_station).
//   mode 'poi'           → busca livre, removendo resultados que sejam posto de combustível.
// Endpoint separado do /api/geocode de propósito: geocode devolve dados mínimos e é consumido
// por outras telas (nova/lodging); aqui precisamos de place_id + types + rating.
export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  const { query, mode } = await request.json();
  if (!query?.trim()) {
    return Response.json({ error: "query required" }, { status: 400 });
  }

  const typeParam = mode === "poi" ? "" : "&type=gas_station";
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}${typeParam}&language=pt-BR&key=${GOOGLE_KEY}`;

  let res: Response, json: any;
  try {
    res = await fetch(url);
    json = await res.json();
  } catch (e) {
    await logError(request, { endpoint: "places-search", error: e, context: { query, mode } });
    await logApiUsage(request, { provider: "google", api_type: "places_text", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: "Places search failed" }, { status: 502 });
  }

  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    await logApiUsage(request, { provider: "google", api_type: "places_text", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: json.status }, { status: 422 });
  }

  await logApiUsage(request, { provider: "google", api_type: "places_text", status: "success", duration_ms: Date.now() - start });

  let raw: any[] = json.results ?? [];
  // Modo POI: o usuário quer um ponto de interesse, não um posto — remover gas_station.
  if (mode === "poi") {
    raw = raw.filter((r: any) => !(r.types ?? []).includes("gas_station"));
  }

  const results: PlaceSearchResult[] = raw.slice(0, 5).map((r: any) => ({
    place_id: r.place_id,
    name: r.name,
    address: r.formatted_address ?? "",
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    rating: r.rating ?? null,
    total_ratings: r.user_ratings_total ?? null,
    is_24h: r.opening_hours?.open_now ?? null,
    types: r.types ?? [],
  }));

  return Response.json({ results });
}
