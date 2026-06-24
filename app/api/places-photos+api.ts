const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const placeId = url.searchParams.get("place_id");
  if (!placeId) {
    return Response.json({ error: "place_id required" }, { status: 400 });
  }

  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&language=pt-BR&key=${GOOGLE_KEY}`;
  const res = await fetch(detailsUrl);
  const json = await res.json();

  if (json.status !== "OK") {
    return Response.json({ photos: [] });
  }

  const refs: string[] = (json.result?.photos ?? [])
    .slice(0, 8)
    .map((p: any) => p.photo_reference as string);

  const photos = refs.map(
    (ref) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${GOOGLE_KEY}`
  );

  return Response.json({ photos });
}
