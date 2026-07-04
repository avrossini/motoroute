// Decodificador de polyline codificada do Google (algoritmo padrão). Puro.
// Usado para obter a geometria FINA da rota — os steps do Directions são grossos
// demais em rodovia (um step pode ter centenas de km) para amostrar paradas.
import type { Ponto } from './types';

export function decodePolyline(encoded: string): Ponto[] {
  const pontos: Ponto[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    pontos.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pontos;
}
