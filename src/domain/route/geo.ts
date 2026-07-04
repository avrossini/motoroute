// Geometria pura. Não existe helper de distância no projeto hoje — este é novo.
import type { Ponto } from './types';

const RAIO_TERRA_KM = 6371;

const rad = (graus: number): number => (graus * Math.PI) / 180;

/** Distância em linha reta (great-circle) entre dois pontos, em km. */
export function haversineKm(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
