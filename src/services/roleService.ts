// Wrapper de frontend do motor do Rolê — chama /api/role.
import type { RoleResult } from "@/domain/route/calcularRole";
import type { ParadaObrigatoria } from "@/domain/route/types";

export interface RoleParams {
  origem: { lat: number; lng: number; nome: string };
  destino: { lat: number; lng: number; nome: string };
  minStopKm: number;
  maxStopKm: number;
  favoritos: string[];
  idaEVolta?: boolean;
  /** Paradas obrigatórias na ida (a Expedição passa as paradas do dia ao gerar trechos). */
  paradasObrigatorias?: ParadaObrigatoria[];
}

export async function calcularRoleRemoto(p: RoleParams): Promise<RoleResult> {
  const res = await fetch("/api/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
