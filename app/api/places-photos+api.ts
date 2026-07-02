import { logApiUsage } from "@/lib/logApiUsage";
import { logError } from "@/lib/logError";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function GET(request: Request): Promise<Response> {
  const start = Date.now();
  const url = new URL(request.url);
  const placeId = url.searchParams.get("place_id");
  if (!placeId) {
    return Response.json({ error: "place_id required" }, { status: 400 });
  }

  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&language=pt-BR&key=${GOOGLE_KEY}`;
  let res: Response, json: any;
  try {
    res = await fetch(detailsUrl);
    json = await res.json();
  } catch (e) {
    await logError(request, { endpoint: "places-photos", error: e, context: { place_id: placeId } });
    await logApiUsage(request, { provider: "google", api_type: "places_photo", status: "error", duration_ms: Date.now() - start });
    return Response.json({ photos: [] });
  }

  if (json.status !== "OK") {
    await logApiUsage(request, { provider: "google", api_type: "places_photo", status: "error", duration_ms: Date.now() - start });
    return Response.json({ photos: [] });
  }

  const refs: string[] = (json.result?.photos ?? [])
    .slice(0, 8)
    .map((p: any) => p.photo_reference as string);

  const photos = refs.map(
    (ref) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${GOOGLE_KEY}`
  );

  await logApiUsage(request, { provider: "google", api_type: "places_photo", status: "success", duration_ms: Date.now() - start });
  return Response.json({ photos });
}
