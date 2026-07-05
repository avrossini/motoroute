// Wrapper de frontend do motor da Expedição — chama /api/expedicao.
import type { DividirEmDiasResult, ParadaObrigatoria } from "@/domain/route/types";

export interface ExpedicaoParams {
  origem: { lat: number; lng: number; nome: string };
  destino: { lat: number; lng: number; nome: string };
  /** Dias de DESLOCAMENTO (num_days − dias parados). */
  nDias: number;
  /** Paradas obrigatórias do usuário (a rota passa por elas; cada uma cai num dia). */
  paradasObrigatorias?: ParadaObrigatoria[];
}

export async function calcularExpedicaoRemota(p: ExpedicaoParams): Promise<DividirEmDiasResult> {
  const res = await fetch("/api/expedicao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
