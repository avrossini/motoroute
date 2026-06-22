import { ExpoRequest, ExpoResponse } from "expo-router/server";

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

interface LatLng { lat: number; lng: number }

interface SegmentData {
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
  waypoint_lat: number | null;
  waypoint_lng: number | null;
}

async function getRoute(origin: string | LatLng, destination: string | LatLng, waypoints: LatLng[] = []) {
  const o = typeof origin === "string" ? encodeURIComponent(origin) : `${origin.lat},${origin.lng}`;
  const d = typeof destination === "string" ? encodeURIComponent(destination) : `${destination.lat},${destination.lng}`;
  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${o}&destination=${d}&mode=driving&language=pt-BR&key=${GOOGLE_KEY}`;
  if (waypoints.length > 0) {
    const wps = waypoints.map((w) => `${w.lat},${w.lng}`).join("|");
    url += `&waypoints=${encodeURIComponent(wps)}`;
  }
  const res = await fetch(url);
  return res.json();
}

/** Picks intermediate waypoint coordinates evenly spaced across the route.
 *  Interpolates within long steps so first/last legs aren't disproportionate. */
function pickWaypointsFromSteps(
  steps: any[],
  totalKm: number,
  targetKm: number
): LatLng[] {
  const numSegments = Math.max(1, Math.round(totalKm / targetKm));
  if (numSegments <= 1) return [];

  const spacing = totalKm / numSegments;
  const waypoints: LatLng[] = [];
  let cumKm = 0;
  let nextTarget = spacing;

  for (const step of steps) {
    const stepKm = step.distance.value / 1000;
    const start: LatLng = step.start_location;
    const end: LatLng = step.end_location;

    // A single step may span multiple target points — handle each
    while (cumKm + stepKm >= nextTarget && waypoints.length < numSegments - 1) {
      const fraction = (nextTarget - cumKm) / stepKm;
      waypoints.push({
        lat: start.lat + fraction * (end.lat - start.lat),
        lng: start.lng + fraction * (end.lng - start.lng),
      });
      nextTarget = (waypoints.length + 1) * spacing;
    }
    cumKm += stepKm;
  }
  return waypoints;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&result_type=locality|administrative_area_level_2&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status === "OK" && json.results.length > 0) {
    // Prefer "locality" (city), fall back to first result
    const locality = json.results.find((r: any) =>
      r.types.includes("locality") || r.types.includes("administrative_area_level_2")
    );
    const result = locality ?? json.results[0];
    // Return short name: first address component that is locality or admin_area_2
    const comp = result.address_components.find((c: any) =>
      c.types.includes("locality") || c.types.includes("administrative_area_level_2")
    );
    return comp?.long_name ?? result.formatted_address.split(",")[0];
  }
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function POST(request: ExpoRequest): Promise<ExpoResponse> {
  const { origin, destination, minStopKm, maxStopKm, numDays, manualWaypoints } = await request.json();

  if (!origin || !destination) {
    return ExpoResponse.json({ error: "origin and destination required" }, { status: 400 });
  }

  // When manual waypoints are provided, build route through them directly
  if (manualWaypoints && manualWaypoints.length > 0) {
    const wps: LatLng[] = manualWaypoints.map((w: any) => ({ lat: w.lat, lng: w.lng }));
    const wpRoute = await getRoute(origin, destination, wps);
    if (wpRoute.status !== "OK") {
      return ExpoResponse.json({ error: `Directions API: ${wpRoute.status}` }, { status: 422 });
    }
    const route = wpRoute.routes[0];
    const legs = route.legs;
    const totalKm = legs.reduce((sum: number, l: any) => sum + l.distance.value / 1000, 0);
    const wpNames: string[] = [origin, ...manualWaypoints.map((w: any) => w.name as string), destination];
    const segsPerDay = Math.ceil(legs.length / numDays);

    const segments: SegmentData[] = legs.map((leg: any, i: number) => {
      const distKm = leg.distance.value / 1000;
      const durationMin = Math.round(leg.duration.value / 60);
      const alerts: string[] = [];
      const isLast = i === legs.length - 1;
      if (distKm > maxStopKm) alerts.push("trecho_longo");
      if (!isLast && distKm < minStopKm) alerts.push("trecho_curto");
      const dayIndex = Math.min(Math.floor(i / segsPerDay) + 1, numDays);
      const isLastOfDay = (i + 1) % segsPerDay === 0 || isLast;
      return {
        order_index: i,
        day_index: dayIndex,
        is_last_of_day: isLastOfDay,
        origin_name: wpNames[i],
        destination_name: wpNames[i + 1],
        origin_lat: leg.start_location.lat,
        origin_lng: leg.start_location.lng,
        dest_lat: leg.end_location.lat,
        dest_lng: leg.end_location.lng,
        distance_km: Math.round(distKm * 10) / 10,
        duration_minutes: durationMin,
        route_summary: route.summary ?? "",
        has_alert: alerts.length > 0,
        alert_types: alerts.length > 0 ? alerts : null,
        waypoint_lat: wps[i]?.lat ?? null,
        waypoint_lng: wps[i]?.lng ?? null,
      };
    });

    return ExpoResponse.json({
      segments,
      total_km: Math.round(totalKm),
      total_duration_min: segments.reduce((sum, s) => sum + s.duration_minutes, 0),
    });
  }

  const targetKm = (minStopKm + maxStopKm) / 2; // 150 km

  // Step 1: get full route to find total distance and steps
  const fullRoute = await getRoute(origin, destination);
  if (fullRoute.status !== "OK") {
    return ExpoResponse.json({ error: `Directions API: ${fullRoute.status}` }, { status: 422 });
  }

  const leg0 = fullRoute.routes[0].legs[0];
  const totalKm = leg0.distance.value / 1000;

  // If route fits in one segment, return it directly
  if (totalKm <= maxStopKm) {
    const alerts = totalKm < minStopKm ? ["trecho_curto"] : [];
    return ExpoResponse.json({
      segments: [{
        order_index: 0,
        day_index: 1,
        is_last_of_day: true,
        origin_name: origin,
        destination_name: destination,
        origin_lat: leg0.start_location.lat,
        origin_lng: leg0.start_location.lng,
        dest_lat: leg0.end_location.lat,
        dest_lng: leg0.end_location.lng,
        distance_km: Math.round(totalKm * 10) / 10,
        duration_minutes: Math.round(leg0.duration.value / 60),
        route_summary: fullRoute.routes[0].summary ?? "",
        has_alert: alerts.length > 0,
        alert_types: alerts.length > 0 ? alerts : null,
        waypoint_lat: null,
        waypoint_lng: null,
      }] as SegmentData[],
      total_km: Math.round(totalKm),
    });
  }

  // Step 2: pick intermediate waypoints from the steps
  const intermediateWaypoints = pickWaypointsFromSteps(leg0.steps, totalKm, targetKm);

  // Step 3: get segmented route with waypoints
  const waypointRoute = intermediateWaypoints.length > 0
    ? await getRoute(origin, destination, intermediateWaypoints)
    : fullRoute;

  if (waypointRoute.status !== "OK") {
    return ExpoResponse.json({ error: `Directions API (waypoints): ${waypointRoute.status}` }, { status: 422 });
  }

  const route = waypointRoute.routes[0];
  const legs = route.legs; // one leg per segment

  // Reverse geocode all intermediate waypoint coordinates in parallel
  const waypointNames = await Promise.all(
    intermediateWaypoints.map((wp) => reverseGeocode(wp.lat, wp.lng))
  );

  const segments: SegmentData[] = legs.map((leg: any, i: number) => {
    const distKm = leg.distance.value / 1000;
    const durationMin = Math.round(leg.duration.value / 60);

    const alerts: string[] = [];
    const isLast = i === legs.length - 1;

    if (distKm > maxStopKm) alerts.push("trecho_longo");
    if (!isLast && distKm < minStopKm) alerts.push("trecho_curto");

    const segsPerDay = Math.ceil(legs.length / numDays);
    const dayIndex = Math.floor(i / segsPerDay) + 1;
    const isLastOfDay = (i + 1) % segsPerDay === 0 || isLast;

    const originName = i === 0 ? origin : (waypointNames[i - 1] ?? `Parada ${i}`);
    const destName = isLast ? destination : (waypointNames[i] ?? `Parada ${i + 1}`);

    return {
      order_index: i,
      day_index: Math.min(dayIndex, numDays),
      is_last_of_day: isLastOfDay,
      origin_name: originName,
      destination_name: destName,
      origin_lat: leg.start_location.lat,
      origin_lng: leg.start_location.lng,
      dest_lat: leg.end_location.lat,
      dest_lng: leg.end_location.lng,
      distance_km: Math.round(distKm * 10) / 10,
      duration_minutes: durationMin,
      route_summary: route.summary ?? "",
      has_alert: alerts.length > 0,
      alert_types: alerts.length > 0 ? alerts : null,
      waypoint_lat: intermediateWaypoints[i]?.lat ?? null,
      waypoint_lng: intermediateWaypoints[i]?.lng ?? null,
    };
  });

  return ExpoResponse.json({
    segments,
    total_km: Math.round(totalKm),
    total_duration_min: segments.reduce((sum, s) => sum + s.duration_minutes, 0),
  });
}
