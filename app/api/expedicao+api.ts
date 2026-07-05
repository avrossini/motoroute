// API fina da Expedição (multi_day): pluga os adapters reais no dividirEmDias.
// Divide origem→destino em N dias, cada pernoite uma CIDADE. NÃO gera os trechos
// internos (esses são o Rolê, rodado sob demanda por dia). Ver docs/route-engine.md §6.
import { dividirEmDias } from "@/domain/route/dividirEmDias";
import { googleRoutePort } from "@/services/routeEngine/googleRoutePort";
import { googleCitiesPort } from "@/services/routeEngine/googleCitiesPort";
import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  const { origem, destino, nDias, paradasObrigatorias } = await request.json();

  if (!origem || !destino || nDias == null) {
    return Response.json(
      { error: "origem, destino e nDias são obrigatórios" },
      { status: 400 }
    );
  }

  try {
    const result = await dividirEmDias(
      {
        origem,
        destino,
        nDias,
        paradasObrigatorias: paradasObrigatorias ?? undefined,
      },
      googleRoutePort,
      googleCitiesPort
    );

    await logApiUsage(request, { provider: "google", api_type: "expedicao", status: "success", duration_ms: Date.now() - start });
    return Response.json(result);
  } catch (e: any) {
    await logError(request, { endpoint: "expedicao", error: e, context: { origem, destino, nDias } });
    await logApiUsage(request, { provider: "google", api_type: "expedicao", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: e?.message ?? "erro ao calcular expedição" }, { status: 422 });
  }
}
