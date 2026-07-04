// Stub native — o mapa nativo ainda não está implementado (ver TripMap.native).
// No modal de alternativas, no mobile, simplesmente não renderiza o mapa.
interface AltPonto {
  place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_selected?: boolean;
}

export default function StopAltMap(_props: { alternatives: AltPonto[] }) {
  return null;
}
