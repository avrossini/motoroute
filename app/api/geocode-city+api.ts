import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Busca de CIDADE (Geocoding API) para o destino de fim de dia da Expedição, que
// por regra precisa ser uma cidade. Diferente do /api/geocode (Text Search solto),
// aqui usamos a Geocoding API porque ela expõe `types` + `address_components`, o que
// permite (1) filtrar só resultados de cidade e (2) derivar o nome canônico do
// município. Restrito ao Brasil (o app é Brasil-only). Ver docs/route-engine.md.
const CITY_TYPES = ["locality", "administrative_area_level_2"];
// Mesma prioridade de cidadeDoPonto (locality = cidade/vila; adm_2 = município BR).
const NAME_PRIORITY = ["locality", "administrative_area_level_2", "administrative_area_level_3"];

function nomeCanonico(components: any[]): string | null {
  for (const tipo of NAME_PRIORITY) {
    const comp = components?.find((c: any) => c.types?.includes(tipo));
    if (comp) return comp.long_name;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  const { query } = await request.json();
  if (!query?.trim()) {
    return Response.json({ error: "query required" }, { status: 400 });
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}` +
    `&language=pt-BR&region=br&components=country:BR&key=${GOOGLE_KEY}`;

  let res: Response, json: any;
  try {
    res = await fetch(url);
    json = await res.json();
  } catch (e) {
    await logError(request, { endpoint: "geocode-city", error: e, context: { query } });
    await logApiUsage(request, { provider: "google", api_type: "geocoding", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: "Geocode fetch failed" }, { status: 502 });
  }

  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    await logApiUsage(request, { provider: "google", api_type: "geocoding", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: json.status }, { status: 422 });
  }

  await logApiUsage(request, { provider: "google", api_type: "geocoding", status: "success", duration_ms: Date.now() - start });

  // Só resultados que SÃO cidade (garante a regra da Expedição).
  const cidades = (json.results ?? []).filter((r: any) =>
    (r.types ?? []).some((t: string) => CITY_TYPES.includes(t))
  );

  const results = cidades
    .map((r: any) => {
      const name = nomeCanonico(r.address_components ?? []);
      if (!name) return null;
      return {
        name,
        address: r.formatted_address ?? "",
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        place_id: r.place_id ?? null,
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  return Response.json({ results });
}
