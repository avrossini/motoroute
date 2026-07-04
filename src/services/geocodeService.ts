// Reverse-geocode server-side: nome da cidade de um ponto. Usado para nomear os
// trechos pela CIDADE do posto (o nome do posto fica no card ⛽), mais útil para
// o viajante do que o nome do estabelecimento. Ver docs/route-engine.md.
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** Reverse-geocode → nome da cidade (locality/município) do ponto. '' se não achar. */
export async function cidadeDoPonto(lat: number, lng: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    const json: any = await res.json();
    if (json.status === "OK" && Array.isArray(json.results) && json.results.length > 0) {
      // locality = cidade/vila; administrative_area_level_2 = município (BR)
      const prioridade = ["locality", "administrative_area_level_2", "administrative_area_level_3"];
      for (const tipo of prioridade) {
        for (const result of json.results) {
          const comp = result.address_components?.find((c: any) => c.types?.includes(tipo));
          if (comp) return comp.long_name;
        }
      }
    }
  } catch {
    // silencioso — cai no fallback
  }
  return "";
}
