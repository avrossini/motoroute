import { ExpoRequest, ExpoResponse } from "expo-router/server";

const WEATHER_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY ?? "";

export async function POST(request: ExpoRequest): Promise<ExpoResponse> {
  const { lat, lng, date } = await request.json();
  if (lat == null || lng == null || !date) {
    return ExpoResponse.json({ error: "lat, lng, date required" }, { status: 400 });
  }

  const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${lat},${lng}&days=1&dt=${date}&aqi=no&alerts=no`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.error) {
    return ExpoResponse.json({ error: json.error.message }, { status: 422 });
  }

  const day = json.forecast?.forecastday?.[0]?.day;
  if (!day) {
    return ExpoResponse.json({ error: "No forecast data returned" }, { status: 422 });
  }

  return ExpoResponse.json({
    temp_max: Math.round(day.maxtemp_c * 10) / 10,
    rain_pct: day.daily_chance_of_rain ?? 0,
    condition: day.condition?.text ?? "",
    wind_kmh: Math.round(day.maxwind_kph ?? 0),
  });
}
