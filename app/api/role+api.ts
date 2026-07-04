// API fina do Rolê (day_trip): pluga os adapters reais no motor de domínio.
import { calcularRole } from "@/domain/route/calcularRole";
import { googleRoutePort } from "@/services/routeEngine/googleRoutePort";
import { googleStopsPort } from "@/services/routeEngine/googleStopsPort";
import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  const { origem, destino, minStopKm, maxStopKm, favoritos, idaEVolta } = await request.json();

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
      },
      googleRoutePort,
      googleStopsPort
    );
    await logApiUsage(request, { provider: "google", api_type: "role", status: "success", duration_ms: Date.now() - start });
    return Response.json(result);
  } catch (e: any) {
    await logError(request, { endpoint: "role", error: e, context: { origem, destino } });
    await logApiUsage(request, { provider: "google", api_type: "role", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: e?.message ?? "erro ao calcular rolê" }, { status: 422 });
  }
}
