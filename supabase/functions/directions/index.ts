import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { origin, destination } = await req.json();

    if (!origin || !destination) {
      return new Response(JSON.stringify({ error: "origin and destination required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&mode=driving` +
      `&language=pt-BR` +
      `&key=${apiKey}`;

    const res = await fetch(url);
    const json = await res.json();

    if (json.status !== "OK") {
      return new Response(
        JSON.stringify({ error: `Directions API: ${json.status}`, detail: json.error_message }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const leg = json.routes[0].legs[0];
    const result = {
      distanceKm: leg.distance.value / 1000,
      durationMinutes: Math.round(leg.duration.value / 60),
      routeSummary: json.routes[0].summary ?? "",
      originLat: leg.start_location.lat,
      originLng: leg.start_location.lng,
      destLat: leg.end_location.lat,
      destLng: leg.end_location.lng,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}, { hostname: "0.0.0.0", port: 9000 });
