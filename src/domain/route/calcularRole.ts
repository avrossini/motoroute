// Motor do Rolê (day_trip) — casca fina sobre o primitivo.
//   só ida     → dividirEmTrechos 1×
//   ida e volta → dividirEmTrechos 2× (volta recalculada independente) + concatena
import type { RoutePort, StopsPort, DividirResult, PontoNomeado, FaixaKm, Trecho, ParadaObrigatoria } from './types';
import { dividirEmTrechos } from './dividirEmTrechos';

export interface RoleInput {
  origem: PontoNomeado;
  destino: PontoNomeado;
  faixa: FaixaKm;
  favoritos: Set<string>;
  /** Se true, planeja também a volta (destino→origem), recalculada de forma independente. */
  idaEVolta?: boolean;
  /** Paradas obrigatórias na ida (a Expedição passa as paradas do dia). */
  paradasObrigatorias?: ParadaObrigatoria[];
}

export interface RoleResult extends DividirResult {
  /** Índice do 1º trecho da volta na lista; null quando é só ida. */
  voltaInicio: number | null;
}

export async function calcularRole(
  input: RoleInput,
  rota: RoutePort,
  stops: StopsPort
): Promise<RoleResult> {
  const ida = await dividirEmTrechos(
    {
      origem: input.origem,
      destino: input.destino,
      faixa: input.faixa,
      favoritos: input.favoritos,
      paradasObrigatorias: input.paradasObrigatorias,
    },
    rota,
    stops
  );
  if (!input.idaEVolta) return { ...ida, voltaInicio: null };

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
    voltaInicio: ida.trechos.length,
  };
}
