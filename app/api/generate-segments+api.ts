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

interface SegmentPoint {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distKm: number;
  durationMin: number;
  startStepIndex: number;
  endStepIndex: number;
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

/**
 * Selects up to maxWaypoints step endpoints spaced evenly along the route.
 * Returns intermediate waypoints only (origin and destination excluded).
 */
function pickWaypointsFromSteps(
  steps: any[],
  totalKm: number,
  targetKm: number,
  maxWaypoints = 24
): { lat: number; lng: number; stepIndex: number }[] {
  const numSegments = Math.min(Math.max(1, Math.round(totalKm / targetKm)), maxWaypoints + 1);
  if (numSegments <= 1) return [];

  const spacing = totalKm / numSegments;
  const waypoints: { lat: number; lng: number; stepIndex: number }[] = [];
  let cumKm = 0;
  let nextCut = spacing;

  for (let i = 0; i < steps.length; i++) {
    const stepKm = steps[i].distance.value / 1000;
    cumKm += stepKm;

    if (cumKm >= nextCut && waypoints.length < numSegments - 1) {
      waypoints.push({
        lat: steps[i].end_location.lat,
        lng: steps[i].end_location.lng,
        stepIndex: i,
      });
      nextCut = (waypoints.length + 1) * spacing;
    }
  }

  return waypoints;
}

/**
 * Builds sub-segments from a leg's steps when the leg exceeds maxStopKm.
 * All cut points snap to step.end_location (guaranteed on-road coordinates).
 */
function buildSegmentsFromSteps(
  steps: any[],
  totalKm: number,
  targetKm: number,
  legStartLat: number,
  legStartLng: number
): SegmentPoint[] {
  const numSegments = Math.max(1, Math.round(totalKm / targetKm));
  const spacing = totalKm / numSegments;
  const segmentPoints: SegmentPoint[] = [];

  let cumKm = 0;
  let segStartLat = legStartLat;
  let segStartLng = legStartLng;
  let segDistKm = 0;
  let segDurationMin = 0;
  let segStartStepIndex = 0;
  let nextCut = spacing;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepKm = step.distance.value / 1000;
    const stepMin = step.duration.value / 60;

    segDistKm += stepKm;
    segDurationMin += stepMin;
    cumKm += stepKm;

    if (cumKm >= nextCut && segmentPoints.length < numSegments - 1) {
      segmentPoints.push({
        startLat: segStartLat,
        startLng: segStartLng,
        endLat: step.end_location.lat,
        endLng: step.end_location.lng,
        distKm: segDistKm,
        durationMin: segDurationMin,
        startStepIndex: segStartStepIndex,
        endStepIndex: i,
      });
      segStartLat = step.end_location.lat;
      segStartLng = step.end_location.lng;
      segDistKm = 0;
      segDurationMin = 0;
      segStartStepIndex = i + 1;
      nextCut = (segmentPoints.length + 1) * spacing;
    }
  }

  const lastStep = steps[steps.length - 1];
  segmentPoints.push({
    startLat: segStartLat,
    startLng: segStartLng,
    endLat: lastStep.end_location.lat,
    endLng: lastStep.end_location.lng,
    distKm: segDistKm,
    durationMin: segDurationMin,
    startStepIndex: segStartStepIndex,
    endStepIndex: steps.length - 1,
  });

  return segmentPoints;
}

function extractMainRoad(steps: any[]): string {
  const roadKm = new Map<string, number>();
  for (const step of steps) {
    const html: string = step.html_instructions ?? "";
    for (const m of html.matchAll(/<b>([^<]+)<\/b>/g)) {
      const name = m[1].trim();
      if (/^[A-Z]{2,}-\d{2,}/.test(name)) {
        roadKm.set(name, (roadKm.get(name) ?? 0) + (step.distance?.value ?? 0));
      }
    }
  }
  let best = ""; let bestMeters = 0;
  for (const [road, meters] of roadKm) {
    if (meters > bestMeters) { best = road; bestMeters = meters; }
  }
  return best;
}

function isTechLabel(name: string): boolean {
  if (/^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}/i.test(name)) return true;
  if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(name)) return true;
  return false;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === "OK" && json.results.length > 0) {
      const priority = [
        "locality", "sublocality",
        "administrative_area_level_4", "administrative_area_level_3",
        "administrative_area_level_2", "administrative_area_level_1",
      ];
      for (const result of json.results) {
        for (const type of priority) {
          const comp = result.address_components?.find((c: any) => c.types.includes(type));
          if (comp) return comp.long_name;
        }
      }
      const candidate = json.results[0].formatted_address.split(",")[0].trim();
      return isTechLabel(candidate) ? "Local a confirmar" : candidate;
    }
  } catch {
    // fall through
  }
  return "Local a confirmar";
}

/**
 * Like reverseGeocode but also returns whether the result is a locality (city).
 * isLocality = true when the best matching component is a locality or sublocality.
 */
async function reverseGeocodeWithType(
  lat: number,
  lng: number
): Promise<{ name: string; isLocality: boolean }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === "OK" && json.results.length > 0) {
      const localityTypes = ["locality", "sublocality"];
      const fallbackTypes = [
        "administrative_area_level_4", "administrative_area_level_3",
        "administrative_area_level_2", "administrative_area_level_1",
      ];
      for (const result of json.results) {
        for (const type of localityTypes) {
          const comp = result.address_components?.find((c: any) => c.types.includes(type));
          if (comp) return { name: comp.long_name, isLocality: true };
        }
      }
      for (const result of json.results) {
        for (const type of fallbackTypes) {
          const comp = result.address_components?.find((c: any) => c.types.includes(type));
          if (comp) return { name: comp.long_name, isLocality: false };
        }
      }
      const candidate = json.results[0].formatted_address.split(",")[0].trim();
      return { name: isTechLabel(candidate) ? "Local a confirmar" : candidate, isLocality: false };
    }
  } catch {
    // fall through
  }
  return { name: "Local a confirmar", isLocality: false };
}

/**
 * Given a list of steps and a starting step index, searches nearby step endpoints
 * (within searchRadius steps in both directions) for one that geocodes as a locality.
 * Returns the closest city found, or the original point as fallback.
 */
async function snapToCity(
  steps: any[],
  currentStepIndex: number,
  searchRadius = 15
): Promise<{ lat: number; lng: number; name: string; foundLocality: boolean; adjusted: boolean }> {
  const candidates: { stepIndex: number; distance: number }[] = [];
  for (let d = 1; d <= searchRadius; d++) {
    if (currentStepIndex - d >= 0) candidates.push({ stepIndex: currentStepIndex - d, distance: d });
    if (currentStepIndex + d < steps.length - 1) candidates.push({ stepIndex: currentStepIndex + d, distance: d });
  }
  // Sort by distance from current (nearest first)
  candidates.sort((a, b) => a.distance - b.distance);

  for (const { stepIndex } of candidates) {
    const step = steps[stepIndex];
    const { lat, lng } = step.end_location;
    const { name, isLocality } = await reverseGeocodeWithType(lat, lng);
    if (isLocality) return { lat, lng, name, foundLocality: true, adjusted: stepIndex !== currentStepIndex };
  }

  // Fallback: return original point
  const orig = steps[currentStepIndex].end_location;
  const { name } = await reverseGeocodeWithType(orig.lat, orig.lng);
  return { lat: orig.lat, lng: orig.lng, name, foundLocality: false, adjusted: false };
}

export async function POST(request: Request): Promise<Response> {
  const { origin, destination, minStopKm, maxStopKm, numDays, manualWaypoints, trip_type } = await request.json();

  if (!origin || !destination) {
    return Response.json({ error: "origin and destination required" }, { status: 400 });
  }

  const isMultiDay = trip_type === "multi_day";

  // ── Manual waypoints path ──────────────────────────────────────────────────
  if (manualWaypoints && manualWaypoints.length > 0) {
    const wps: LatLng[] = manualWaypoints.map((w: any) => ({ lat: w.lat, lng: w.lng }));
    const wpRoute = await getRoute(origin, destination, wps);
    if (wpRoute.status !== "OK") {
      return Response.json({ error: `Directions API: ${wpRoute.status}` }, { status: 422 });
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

    const avg_daily_km = isMultiDay && numDays > 1 ? Math.round(totalKm / numDays) : null;

    return Response.json({
      segments,
      total_km: Math.round(totalKm),
      total_duration_min: segments.reduce((sum, s) => sum + s.duration_minutes, 0),
      avg_daily_km,
    });
  }

  // ── Step 1: get full route ─────────────────────────────────────────────────
  const fullRoute = await getRoute(origin, destination);
  if (fullRoute.status !== "OK") {
    return Response.json({ error: `Directions API: ${fullRoute.status}` }, { status: 422 });
  }

  const leg0 = fullRoute.routes[0].legs[0];
  const totalKm = leg0.distance.value / 1000;
  const routeSummary = fullRoute.routes[0].summary ?? "";
  const allSteps = leg0.steps;
  const targetKm = (minStopKm + maxStopKm) / 2;

  // Single-segment route
  if (totalKm <= maxStopKm) {
    const alerts = totalKm < minStopKm ? ["trecho_curto"] : [];
    return Response.json({
      segments: [{
        order_index: 0, day_index: 1, is_last_of_day: true,
        origin_name: origin, destination_name: destination,
        origin_lat: leg0.start_location.lat, origin_lng: leg0.start_location.lng,
        dest_lat: leg0.end_location.lat, dest_lng: leg0.end_location.lng,
        distance_km: Math.round(totalKm * 10) / 10,
        duration_minutes: Math.round(leg0.duration.value / 60),
        route_summary: routeSummary,
        has_alert: alerts.length > 0, alert_types: alerts.length > 0 ? alerts : null,
        waypoint_lat: null, waypoint_lng: null,
      }] as SegmentData[],
      total_km: Math.round(totalKm),
    });
  }

  const numWaypointsNeeded = Math.round(totalKm / targetKm) - 1;
  const isLongTrip = numWaypointsNeeded > 24;

  // ── Step 2: pick waypoints (capped at 24 for long trips) ──────────────────
  const pickedWaypoints = pickWaypointsFromSteps(allSteps, totalKm, targetKm, 24);

  // Tracks pernoite alert types by flatSeg index (populated in Steps 3 and 7)
  const dayEndAlerts = new Map<number, string[]>();

  // ── Step 3: for multi_day short trips, snap day-end waypoints to cities ───
  if (isMultiDay && !isLongTrip) {
    const segsPerDay = Math.ceil((pickedWaypoints.length + 1) / numDays);
    // Day-end waypoint indices: segsPerDay-1, 2*segsPerDay-1, ...
    for (let wi = segsPerDay - 1; wi < pickedWaypoints.length; wi += segsPerDay) {
      const wp = pickedWaypoints[wi];
      const { isLocality } = await reverseGeocodeWithType(wp.lat, wp.lng);
      if (!isLocality) {
        const city = await snapToCity(allSteps, wp.stepIndex);
        pickedWaypoints[wi] = { lat: city.lat, lng: city.lng, stepIndex: wp.stepIndex };
        if (!city.foundLocality) {
          dayEndAlerts.set(wi, [...(dayEndAlerts.get(wi) ?? []), "pernoite_sem_cidade"]);
        } else if (city.adjusted) {
          dayEndAlerts.set(wi, [...(dayEndAlerts.get(wi) ?? []), "pernoite_ajustado"]);
        }
      }
    }
  }

  // ── Step 4: second API call with (capped) waypoints ───────────────────────
  const wpsForApi: LatLng[] = pickedWaypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
  const route2 = await getRoute(origin, destination, wpsForApi);
  if (route2.status !== "OK") {
    return Response.json({ error: `Directions API (waypoints): ${route2.status}` }, { status: 422 });
  }

  const route2Summary = route2.routes[0].summary ?? routeSummary;
  const legs2 = route2.routes[0].legs as any[];

  // ── Step 5: for long trips, subdivide oversized legs ──────────────────────
  // Build flat list of SegmentPoints from legs (subdividing long ones)
  interface FlatSeg {
    startLat: number; startLng: number;
    endLat: number; endLng: number;
    distKm: number; durationMin: number;
    legSteps: any[];
    startStepIndex: number;
    endStepIndex: number;
  }

  const flatSegs: FlatSeg[] = [];

  for (const leg of legs2) {
    const legKm = leg.distance.value / 1000;
    const legSteps: any[] = leg.steps;

    if (isLongTrip && legKm > maxStopKm) {
      const subSegs = buildSegmentsFromSteps(
        legSteps, legKm, targetKm,
        leg.start_location.lat, leg.start_location.lng
      );
      for (const s of subSegs) {
        flatSegs.push({ ...s, legSteps, endStepIndex: s.endStepIndex });
      }
    } else {
      flatSegs.push({
        startLat: leg.start_location.lat,
        startLng: leg.start_location.lng,
        endLat: leg.end_location.lat,
        endLng: leg.end_location.lng,
        distKm: legKm,
        durationMin: leg.duration.value / 60,
        legSteps,
        startStepIndex: 0,
        endStepIndex: legSteps.length - 1,
      });
    }
  }

  // ── Step 6: reverse geocode intermediate points (batched) ─────────────────
  const intermediateIdxs = flatSegs.slice(0, -1).map((_, i) => i);
  const waypointNames: string[] = new Array(flatSegs.length - 1);
  const GEOCODE_BATCH = 8;

  for (let i = 0; i < intermediateIdxs.length; i += GEOCODE_BATCH) {
    const batch = await Promise.all(
      intermediateIdxs.slice(i, i + GEOCODE_BATCH).map((idx) =>
        reverseGeocode(flatSegs[idx].endLat, flatSegs[idx].endLng)
      )
    );
    batch.forEach((name, bi) => { waypointNames[i + bi] = name; });
  }

  // ── Step 7: for multi_day long trips, snap day-end segments to cities ─────
  const segsPerDay = Math.ceil(flatSegs.length / numDays);

  if (isMultiDay) {
    for (let i = segsPerDay - 1; i < flatSegs.length - 1; i += segsPerDay) {
      const seg = flatSegs[i];
      const { isLocality } = await reverseGeocodeWithType(seg.endLat, seg.endLng);
      if (!isLocality) {
        const city = await snapToCity(seg.legSteps, seg.endStepIndex);
        // Update this segment's endpoint and the next segment's start
        flatSegs[i].endLat = city.lat;
        flatSegs[i].endLng = city.lng;
        if (i + 1 < flatSegs.length) {
          flatSegs[i + 1].startLat = city.lat;
          flatSegs[i + 1].startLng = city.lng;
        }
        waypointNames[i] = city.name;
        if (!city.foundLocality) {
          dayEndAlerts.set(i, [...(dayEndAlerts.get(i) ?? []), "pernoite_sem_cidade"]);
        } else if (city.adjusted) {
          dayEndAlerts.set(i, [...(dayEndAlerts.get(i) ?? []), "pernoite_ajustado"]);
        }
      }
    }
  }

  // ── Step 8: build SegmentData array ───────────────────────────────────────
  const segments: SegmentData[] = flatSegs.map((seg, i) => {
    const isLast = i === flatSegs.length - 1;
    const alerts: string[] = [];
    if (seg.distKm > maxStopKm) alerts.push("trecho_longo");
    if (!isLast && seg.distKm < minStopKm) alerts.push("trecho_curto");

    const dayIndex = Math.min(Math.floor(i / segsPerDay) + 1, numDays);
    const isLastOfDay = (i + 1) % segsPerDay === 0 || isLast;

    if (isLastOfDay && !isLast) {
      alerts.push(...(dayEndAlerts.get(i) ?? []));
    }

    const originName = i === 0 ? origin : (waypointNames[i - 1] ?? `Parada ${i}`);
    const destName = isLast ? destination : (waypointNames[i] ?? `Parada ${i + 1}`);

    return {
      order_index: i,
      day_index: dayIndex,
      is_last_of_day: isLastOfDay,
      origin_name: originName,
      destination_name: destName,
      origin_lat: seg.startLat,
      origin_lng: seg.startLng,
      dest_lat: seg.endLat,
      dest_lng: seg.endLng,
      distance_km: Math.round(seg.distKm * 10) / 10,
      duration_minutes: Math.round(seg.durationMin),
      route_summary: extractMainRoad(seg.legSteps.slice(seg.startStepIndex, seg.endStepIndex + 1)) || route2Summary,
      has_alert: alerts.length > 0,
      alert_types: alerts.length > 0 ? alerts : null,
      waypoint_lat: wpsForApi[i]?.lat ?? null,
      waypoint_lng: wpsForApi[i]?.lng ?? null,
    };
  });

  const avg_daily_km = isMultiDay && numDays > 1 ? Math.round(totalKm / numDays) : null;

  return Response.json({
    segments,
    total_km: Math.round(totalKm),
    total_duration_min: segments.reduce((sum, s) => sum + s.duration_minutes, 0),
    avg_daily_km,
  });
}
