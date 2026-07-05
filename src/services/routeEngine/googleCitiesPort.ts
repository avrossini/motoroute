// Adapter real do CitiesPort: acha cidades (locality) perto de um ponto da rota.
// `type=locality` NÃO é tipo válido de Places Nearby Search — a via confiável é
// reverse-geocode (como o generate-segments nomeia fins de dia). Para dar opções
// ao núcleo (escolher a melhor), amostra um pequeno anel e reverse-geocoda cada.
import type { CitiesPort, Cidade } from "../../domain/route/types";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const KM_POR_GRAU_LAT = 111.19;

/** Extrai a melhor Cidade (locality/município) de uma resposta de reverse-geocode. Puro. */
export function fromGoogleGeocode(json: any): Cidade | null {
  if (json?.status !== "OK" || !Array.isArray(json.results) || json.results.length === 0) return null;
  const prioridade = ["locality", "sublocality", "administrative_area_level_2", "administrative_area_level_3"];
  for (const tipo of prioridade) {
    const result = json.results.find((r: any) => r.types?.includes(tipo));
    if (result) {
      const comp = result.address_components?.find((c: any) => c.types?.includes(tipo));
      const loc = result.geometry?.location;
      if (comp && loc) {
        return { placeId: result.place_id ?? null, nome: comp.long_name, lat: loc.lat, lng: loc.lng };
      }
    }
  }
  return null;
}

/** Centro + 4 pontos cardeais no raio — para reverse-geocodar e colher localities distintas. */
function anel(lat: number, lng: number, raioKm: number): { lat: number; lng: number }[] {
  const dLat = raioKm / KM_POR_GRAU_LAT;
  const dLng = raioKm / (KM_POR_GRAU_LAT * Math.cos((lat * Math.PI) / 180));
  return [
    { lat, lng },
    { lat: lat + dLat, lng },
    { lat: lat - dLat, lng },
    { lat, lng: lng + dLng },
    { lat, lng: lng - dLng },
  ];
}

async function reverse(lat: number, lng: number): Promise<Cidade | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    return fromGoogleGeocode(await res.json());
  } catch {
    return null;
  }
}

export const googleCitiesPort: CitiesPort = {
  async searchCities(lat, lng, raioM) {
    const pontos = anel(lat, lng, raioM / 1000);
    const achadas = await Promise.all(pontos.map((p) => reverse(p.lat, p.lng)));
    const porNome = new Map<string, Cidade>();
    for (const c of achadas) if (c && !porNome.has(c.nome)) porNome.set(c.nome, c);
    return [...porNome.values()];
  },
};
