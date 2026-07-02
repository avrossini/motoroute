import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

const WEATHER_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY ?? "";

export async function POST(request: Request): Promise<Response> {
  const start = Date.now();
  const { lat, lng, date } = await request.json();
  if (lat == null || lng == null || !date) {
    return Response.json({ error: "lat, lng, date required" }, { status: 400 });
  }

  const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${lat},${lng}&days=1&dt=${date}&aqi=no&alerts=no`;
  let res: Response, json: any;
  try {
    res = await fetch(url);
    json = await res.json();
  } catch (e) {
    await logError(request, { endpoint: "weather", error: e, context: { lat, lng, date } });
    await logApiUsage(request, { provider: "weatherapi", api_type: "weather", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: "Weather fetch failed" }, { status: 502 });
  }

  if (json.error) {
    await logApiUsage(request, { provider: "weatherapi", api_type: "weather", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: json.error.message }, { status: 422 });
  }

  const day = json.forecast?.forecastday?.[0]?.day;
  if (!day) {
    await logApiUsage(request, { provider: "weatherapi", api_type: "weather", status: "error", duration_ms: Date.now() - start });
    return Response.json({ error: "No forecast data returned" }, { status: 422 });
  }

  await logApiUsage(request, { provider: "weatherapi", api_type: "weather", status: "success", duration_ms: Date.now() - start });
  return Response.json({
    temp_max: Math.round(day.maxtemp_c * 10) / 10,
    rain_pct: day.daily_chance_of_rain ?? 0,
    condition: day.condition?.text ?? "",
    wind_kmh: Math.round(day.maxwind_kph ?? 0),
  });
}
