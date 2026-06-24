import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, useWindowDimensions } from "react-native";
import { getSupabase } from "@/services/supabase";

interface Waypoint {
  lat: number | null;
  lng: number | null;
  name: string;
  distanceKm: number;
  durationMin: number;
  weatherCondition: string | null;
  weatherTemp: number | null;
  dayIndex: number | null;
}

interface MapData {
  origin: { lat: number | null; lng: number | null; name: string } | null;
  destination: { lat: number | null; lng: number | null; name: string } | null;
  waypoints: Waypoint[];
}

interface Props {
  tripId: string;
  tripOrigin: string;
  tripDestination: string;
  onSwitchToList: () => void;
}

declare global {
  interface Window {
    google: any;
    _tripMapCallback: () => void;
  }
}

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function weatherIcon(condition: string | null): string {
  if (!condition) return "";
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return "⛈";
  if (c.includes("snow") || c.includes("sleet") || c.includes("blizzard")) return "🌨";
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return "🌫";
  if (c.includes("heavy rain") || c.includes("torrential")) return "🌧";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "🌦";
  if (c.includes("overcast")) return "☁️";
  if (c.includes("partly")) return "⛅";
  if (c.includes("sunny") || c.includes("clear")) return "☀️";
  return "🌡";
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export default function TripMap({ tripId, tripOrigin, tripDestination, onSwitchToList }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

  // Load Google Maps JS API once
  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return; }
    window._tripMapCallback = () => setMapsReady(true);
    if (!document.querySelector(`script[src*="maps.googleapis.com"]`)) {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&callback=_tripMapCallback&language=pt-BR`;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, []);

  // Fetch waypoint data
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/map-waypoints?trip_id=${tripId}`, { headers });
        const json = await res.json();
        if (!res.ok || json.error || !json.waypoints) {
          setLoadError(true);
          setMapData(null);
        } else {
          setMapData(json);
        }
      } catch {
        setLoadError(true);
        setMapData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tripId]);

  // Initialize map when both Maps API and data are ready
  useEffect(() => {
    if (!mapsReady || !mapData || !mapDivRef.current) return;
    if (mapRef.current) return; // already initialized

    const google = window.google;
    const map = new google.maps.Map(mapDivRef.current, {
      zoom: 9,
      center: { lat: -22.98, lng: -47.10 },
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
      styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
    });
    mapRef.current = map;

    // Build stops array: origin + waypoints + destination
    const stops: Array<{ lat: number; lng: number; name: string; type: "origin" | "stop" | "dest"; km?: number; dur?: number; weather?: string | null; temp?: number | null }> = [];

    if (mapData.origin?.lat != null && mapData.origin?.lng != null) {
      stops.push({ lat: mapData.origin.lat, lng: mapData.origin.lng, name: mapData.origin.name, type: "origin" });
    }
    for (const wp of mapData.waypoints) {
      if (wp.lat != null && wp.lng != null) {
        stops.push({ lat: wp.lat, lng: wp.lng, name: wp.name, type: "stop", km: wp.distanceKm, dur: wp.durationMin, weather: wp.weatherCondition, temp: wp.weatherTemp });
      }
    }
    if (mapData.destination?.lat != null && mapData.destination?.lng != null) {
      stops.push({ lat: mapData.destination.lat, lng: mapData.destination.lng, name: mapData.destination.name, type: "dest" });
    }

    if (stops.length < 2) return;

    // Draw route
    const ds = new google.maps.DirectionsService();
    const dr = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#C97826", strokeWeight: 5, strokeOpacity: 0.85 },
    });

    const waypts = stops.slice(1, -1).map((s) => ({
      location: new google.maps.LatLng(s.lat, s.lng),
      stopover: true,
    }));

    // Google DirectionsService allows max 25 waypoints on paid plan
    // For large trips, trim to 23 intermediate stops
    const trimmedWaypts = waypts.slice(0, 23);

    ds.route({
      origin: new google.maps.LatLng(stops[0].lat, stops[0].lng),
      destination: new google.maps.LatLng(stops[stops.length - 1].lat, stops[stops.length - 1].lng),
      waypoints: trimmedWaypts,
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result: any, status: string) => {
      if (status === "OK") dr.setDirections(result);
    });

    // Fit bounds to all stop points
    const bounds = new google.maps.LatLngBounds();
    stops.forEach((s) => bounds.extend(new google.maps.LatLng(s.lat, s.lng)));
    map.fitBounds(bounds, { top: 40, bottom: 80, left: 20, right: 20 });

    // Add markers
    const newMarkers: any[] = [];
    const newIW: any[] = [];

    stops.forEach((stop, i) => {
      const isOrigin = stop.type === "origin";
      const isDest = stop.type === "dest";
      const stopNum = stops.slice(0, i).filter((s) => s.type === "stop").length + 1;
      const label = isOrigin ? "A" : isDest ? "Z" : String(stopNum);
      const bgColor = isOrigin ? "#16A34A" : isDest ? "#DC2626" : "#C97826";

      const marker = new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map,
        label: { text: label, color: "#fff", fontWeight: "700", fontSize: "11px" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: bgColor,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        title: stop.name,
        zIndex: isOrigin || isDest ? 10 : 5,
      });

      const iwContent = buildIWContent(stop, label);
      const iw = new google.maps.InfoWindow({ content: iwContent, pixelOffset: new google.maps.Size(0, -20) });

      marker.addListener("click", () => {
        setSelectedIdx(i);
      });

      newMarkers.push(marker);
      newIW.push(iw);
    });

    markersRef.current = newMarkers;
    infoWindowsRef.current = newIW;
  }, [mapsReady, mapData]);

  // Handle selection — open InfoWindow + scroll chip into view
  useEffect(() => {
    if (!mapRef.current || !markersRef.current.length) return;

    // Close all
    infoWindowsRef.current.forEach((iw) => iw.close());

    if (selectedIdx === null) return;

    const marker = markersRef.current[selectedIdx];
    const iw = infoWindowsRef.current[selectedIdx];
    if (marker && iw) {
      mapRef.current.panTo(marker.getPosition());
      iw.open(mapRef.current, marker);
    }
  }, [selectedIdx]);

  function buildIWContent(stop: any, label: string) {
    const isOrigin = stop.type === "origin";
    const isDest = stop.type === "dest";
    if (isOrigin) return `<div style="font-family:sans-serif;font-size:13px;font-weight:700;padding:4px 2px">🟢 ${stop.name}<br><span style="font-size:11px;color:#888;font-weight:400">Ponto de partida</span></div>`;
    if (isDest) return `<div style="font-family:sans-serif;font-size:13px;font-weight:700;padding:4px 2px">🔴 ${stop.name}<br><span style="font-size:11px;color:#888;font-weight:400">Destino final</span></div>`;
    const icon = stop.weather ? weatherIcon(stop.weather) : "";
    const temp = stop.temp != null ? ` ${Math.round(stop.temp)}°C` : "";
    const meta = stop.km != null ? `${Math.round(stop.km)}km · ${fmtDuration(stop.dur ?? 0)}` : "";
    const wtxt = icon ? `${icon}${temp}` : "";
    return `<div style="font-family:sans-serif;font-size:13px;font-weight:700;padding:4px 2px">🟠 ${stop.name}<br><span style="font-size:11px;color:#888;font-weight:400">${meta}${wtxt ? " · " + wtxt : ""}</span></div>`;
  }

  // Build the full stops list for the strip (same logic as map init)
  const allStops = (() => {
    if (!mapData) return [];
    const arr: Array<{ name: string; type: "origin" | "stop" | "dest"; km?: number; dur?: number; weather?: string | null; temp?: number | null }> = [];
    if (mapData.origin) arr.push({ name: mapData.origin.name, type: "origin" });
    for (const wp of (mapData.waypoints ?? [])) arr.push({ name: wp.name, type: "stop", km: wp.distanceKm, dur: wp.durationMin, weather: wp.weatherCondition, temp: wp.weatherTemp });
    if (mapData.destination) arr.push({ name: mapData.destination.name, type: "dest" });
    return arr;
  })();

  const selectedStop = selectedIdx !== null ? allStops[selectedIdx] : null;

  return (
    <View style={styles.container}>
      {/* Toggle strip */}
      <View style={styles.toggle}>
        <TouchableOpacity style={styles.toggleBtn} onPress={onSwitchToList}>
          <Text style={styles.toggleBtnText}>📋 Lista</Text>
        </TouchableOpacity>
        <View style={[styles.toggleBtn, styles.toggleBtnActive]}>
          <Text style={styles.toggleBtnActiveText}>🗺️ Mapa</Text>
        </View>
      </View>

      {/* Map area — explicit height + position:relative so strip/sheet overlay as absolute children */}
      <View style={[styles.mapWrapper, { height: windowHeight - 160 }]}>
        {/* @ts-ignore — div is web-only; always in DOM so ref is set before effects run */}
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
        {(loading || !mapsReady) && !loadError && (
          <View style={styles.mapLoading}>
            <ActivityIndicator color="#C97826" size="large" />
            <Text style={styles.mapLoadingText}>Carregando mapa…</Text>
          </View>
        )}
        {loadError && (
          <View style={styles.mapLoading}>
            <Text style={styles.mapLoadingText}>⚠️ Erro ao carregar mapa</Text>
            <Text style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Verifique sua conexão e tente novamente</Text>
          </View>
        )}

        {/* Stop strip — wrapper View is absolute, ScrollView fills it */}
        {allStops.length > 0 && (
          <View style={styles.stripWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.strip}
              contentContainerStyle={styles.stripContent}
            >
              {allStops.map((stop, i) => {
                const isOrigin = stop.type === "origin";
                const isDest = stop.type === "dest";
                const icon = isOrigin ? "🟢" : isDest ? "🔴" : "🟠";
                const label = isOrigin ? "partida" : isDest ? "destino" : `${Math.round(stop.km ?? 0)}km`;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, selectedIdx === i && styles.chipActive]}
                    onPress={() => setSelectedIdx(selectedIdx === i ? null : i)}
                  >
                    <Text style={styles.chipIcon}>{icon}</Text>
                    <Text style={styles.chipName} numberOfLines={1}>{stop.name}</Text>
                    <Text style={styles.chipSub}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Bottom sheet — wrapper View is absolute, covers strip when open */}
        {selectedStop && (
          <View style={styles.sheetWrapper}>
            <View style={styles.sheet}>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setSelectedIdx(null)}>
                <Text style={styles.sheetCloseText}>✕</Text>
              </TouchableOpacity>
              <View style={styles.sheetDrag} />
              <Text style={styles.sheetTitle}>{selectedStop.name}</Text>
              <Text style={styles.sheetSub}>
                {selectedStop.type === "origin" ? "Ponto de partida" : selectedStop.type === "dest" ? "Destino final" : `Parada ${allStops.slice(0, selectedIdx!).filter((s) => s.type === "stop").length + 1}`}
              </Text>
              {selectedStop.type === "stop" && (
                <>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Trecho</Text>
                    <Text style={styles.sheetVal}>{Math.round(selectedStop.km ?? 0)}km</Text>
                  </View>
                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetLabel}>Tempo estimado</Text>
                    <Text style={styles.sheetVal}>{fmtDuration(selectedStop.dur ?? 0)}</Text>
                  </View>
                  {selectedStop.weather && (
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetLabel}>Clima</Text>
                      <View style={styles.sheetBadge}>
                        <Text style={styles.sheetBadgeText}>
                          {weatherIcon(selectedStop.weather)} {selectedStop.temp != null ? `${Math.round(selectedStop.temp)}°C` : selectedStop.weather}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
              <TouchableOpacity style={styles.sheetListBtn} onPress={onSwitchToList}>
                <Text style={styles.sheetListBtnText}>📋 Ver na Lista</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },

  toggle: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: "#EFEFEF",
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  toggleBtnActiveText: { fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  toggleBtnText: { fontSize: 13, fontWeight: "600", color: "#888" },

  mapWrapper: { position: "relative", overflow: "hidden" },
  mapLoading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#F5F5F5" },
  mapLoadingText: { fontSize: 14, color: "#888" },

  stripWrapper: { position: "absolute", bottom: 0, left: 0, right: 0 },
  strip: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E8E8E8" },
  stripContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 72,
  },
  chipActive: { borderColor: "#C97826", backgroundColor: "#FEF3E2" },
  chipIcon: { fontSize: 13, marginBottom: 2 },
  chipName: { fontSize: 11, fontWeight: "700", color: "#1A1A1A", maxWidth: 72 },
  chipSub: { fontSize: 10, color: "#888", marginTop: 1 },

  sheetWrapper: { position: "absolute", bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  sheetClose: { position: "absolute", top: 16, right: 16, padding: 4 },
  sheetCloseText: { fontSize: 18, color: "#bbb" },
  sheetDrag: { width: 40, height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#1A1A1A", marginBottom: 4 },
  sheetSub: { fontSize: 12, color: "#888", marginBottom: 14 },
  sheetRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sheetLabel: { flex: 1, fontSize: 13, color: "#555" },
  sheetVal: { fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  sheetBadge: { backgroundColor: "#FEF3E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sheetBadgeText: { fontSize: 11, color: "#C97826", fontWeight: "700" },
  sheetListBtn: { backgroundColor: "#1A1A1A", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  sheetListBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
