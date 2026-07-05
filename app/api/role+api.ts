// API fina do Rolê (day_trip): pluga os adapters reais no motor de domínio.
import { calcularRole } from "@/domain/route/calcularRole";
import { googleRoutePort } from "@/services/routeEngine/googleRoutePort";
import { googleStopsPort } from "@/services/routeEngine/googleStopsPort";
import { cidadeDoPonto } from "@/services/geocodeService";
import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  const { origem, destino, minStopKm, maxStopKm, favoritos, idaEVolta, paradasObrigatorias } =
    await request.json();

  if (!origem || !destino || minStopKm == null || maxStopKm == null) {
    return Response.json(
      { error: "origem, destino, minStopKm e maxStopKm são obrigatórios" },
      { status: 400 }
    );
  }

  try {
    const result = await calcularRole(
      {
        origem,
        destino,
        faixa: { min: minStopKm, max: maxStopKm },
        favoritos: new Set<string>(favoritos ?? []),
        idaEVolta: !!idaEVolta,
        paradasObrigatorias: paradasObrigatorias ?? undefined,
      },
      googleRoutePort,
      googleStopsPort
    );

    // Nome do trecho = CIDADE do posto (o nome do posto fica no card ⛽).
    const cidadePorPlace = new Map<string, string>();
    const postosUnicos = new Map<string, { lat: number; lng: number }>();
    for (const t of result.trechos) {
      if (t.posto) postosUnicos.set(t.posto.placeId, { lat: t.posto.lat, lng: t.posto.lng });
    }
    await Promise.all(
      [...postosUnicos.entries()].map(async ([placeId, p]) => {
        const cidade = await cidadeDoPonto(p.lat, p.lng);
        if (cidade) cidadePorPlace.set(placeId, cidade);
      })
    );
    for (let i = 0; i < result.trechos.length; i++) {
      const t = result.trechos[i];
      if (!t.posto) continue;
      const cidade = cidadePorPlace.get(t.posto.placeId);
      if (!cidade) continue;
      t.destino = { ...t.destino, nome: cidade };
      const prox = result.trechos[i + 1];
      if (prox) prox.origem = { ...prox.origem, nome: cidade };
    }

    await logApiUsage(request, { provider: "google", api_type: "role", status: "success", duration_ms: Date.now() - start });
    return Response.json(result);
  } catch (e: any) {
    await logError(request, { endpoint: "role", error: e, context: { origem, destino } });
    await logApiUsage(request, { provider: "google", api_type: "role", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: e?.message ?? "erro ao calcular rolê" }, { status: 422 });
  }
}
