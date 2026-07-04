// Motor do Rolê (day_trip) — casca fina sobre o primitivo.
//   só ida     → dividirEmTrechos 1×
//   ida e volta → dividirEmTrechos 2× (volta recalculada independente) + concatena
import type { RoutePort, StopsPort, DividirResult, PontoNomeado, FaixaKm, Trecho } from './types';
import { dividirEmTrechos } from './dividirEmTrechos';

export interface RoleInput {
  origem: PontoNomeado;
  destino: PontoNomeado;
  faixa: FaixaKm;
  favoritos: Set<string>;
  /** Se true, planeja também a volta (destino→origem), recalculada de forma independente. */
  idaEVolta?: boolean;
}

export async function calcularRole(
  input: RoleInput,
  rota: RoutePort,
  stops: StopsPort
): Promise<DividirResult> {
  const ida = await dividirEmTrechos(
    { origem: input.origem, destino: input.destino, faixa: input.faixa, favoritos: input.favoritos },
    rota,
    stops
  );
  if (!input.idaEVolta) return ida;

  // Volta: recalculada de forma independente (pode dar estradas diferentes da ida).
  const volta = await dividirEmTrechos(
    { origem: input.destino, destino: input.origem, faixa: input.faixa, favoritos: input.favoritos },
    rota,
    stops
  );

  const trechos: Trecho[] = [
    ...ida.trechos,
    ...volta.trechos.map((t) => ({ ...t, ordem: t.ordem + ida.trechos.length })),
  ];
  return {
    trechos,
    totalKm: ida.totalKm + volta.totalKm,
    totalMin: ida.totalMin + volta.totalMin,
  };
}
