export interface WeatherData {
  temp_max: number;
  rain_pct: number;
  condition: string;
  wind_kmh: number;
}

export async function fetchSegmentWeather(
  lat: number,
  lng: number,
  date: string
): Promise<WeatherData> {
  const res = await fetch("/api/weather", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, date }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Returns true if the departure date is within the 7-day forecast window */
export function isWeatherAvailable(departureDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tripDate = new Date(departureDate + "T00:00:00");
  const diffDays = Math.ceil((tripDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 7;
}

/** How many days until the forecast window opens (0 if already available) */
export function daysUntilForecast(departureDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tripDate = new Date(departureDate + "T00:00:00");
  const diffDays = Math.ceil((tripDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays - 7);
}

/** Returns YYYY-MM-DD for departure_date + (dayIndex - 1) days */
export function segmentDate(departureDate: string, dayIndex: number): string {
  const d = new Date(departureDate + "T00:00:00");
  d.setDate(d.getDate() + dayIndex - 1);
  return d.toISOString().slice(0, 10);
}

/** Returns true if weather data is stale (> 6 hours old) */
export function isWeatherStale(weatherUpdatedAt: string | null): boolean {
  if (!weatherUpdatedAt) return true;
  const updated = new Date(weatherUpdatedAt).getTime();
  return Date.now() - updated > 6 * 60 * 60 * 1000;
}
