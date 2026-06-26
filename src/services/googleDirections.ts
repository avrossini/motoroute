export interface DirectionsResult {
  distanceKm: number;
  durationMinutes: number;
  routeSummary: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

export interface SegmentData {
  order_index: number;
  day_index: number;
  is_last_of_day: boolean;
  origin_name: string;
  destination_name: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  distance_km: number;
  duration_minutes: number;
  route_summary: string;
  has_alert: boolean;
  alert_types: string[] | null;
}

export interface GenerateSegmentsResult {
  segments: SegmentData[];
  total_km: number;
  total_duration_min: number;
  avg_daily_km?: number | null;
}

export interface ManualWaypoint {
  name: string;
  lat: number;
  lng: number;
}

export async function generateSegments(
  origin: string,
  destination: string,
  minStopKm: number,
  maxStopKm: number,
  numDays: number,
  manualWaypoints?: ManualWaypoint[],
  trip_type?: string
): Promise<GenerateSegmentsResult> {
  const res = await fetch("/api/generate-segments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, minStopKm, maxStopKm, numDays, manualWaypoints, trip_type }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
