import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";
import { generateSegments, type ManualWaypoint } from "@/services/googleDirections";
import {
  fetchSegmentWeather,
  isWeatherAvailable,
  daysUntilForecast,
  segmentDate,
  isWeatherStale,
} from "@/services/weatherService";
import {
  fetchStopSuggestions,
  type StopSuggestion,
} from "@/services/placesService";
import type { Database } from "@/types/database";

interface LodgingSuggestion {
  id: string;
  day_index: number;
  name: string;
  rating: number | null;
  price_level: number | null;
  city: string;
  checkin_date: string;
  checkout_date: string;
  latitude: number;
  longitude: number;
  is_reserved: boolean;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function priceLabel(level: number | null) {
  if (level == null) return "";
  return ["", "$", "$$", "$$$", "$$$$"][level] ?? "";
}

interface StopAlternative {
  id: string;
  place_id: string;
  segment_id: string;
  name: string;
  rating: number | null;
  total_ratings: number | null;
  is_24h: boolean | null;
  is_selected: boolean;
  latitude: number;
  longitude: number;
}

interface Waypoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order_index: number;
}

interface GeoResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

type Trip = Database["public"]["Tables"]["trips"]["Row"];
type Segment = Database["public"]["Tables"]["segments"]["Row"];

const RAIN_ALERT_THRESHOLD = 40; // matches user_preferences default
const WIND_ALERT_KMH = 50;

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtKm(km: number) {
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const ALERT_LABELS: Record<string, string> = {
  trecho_longo: "Trecho longo",
  trecho_curto: "Trecho curto",
  chuva_forte: "Chuva provável",
  vento_forte: "Vento forte",
};

function WeatherBadge({ seg }: { seg: Segment }) {
  if (!seg.weather_condition) return null;
  const stale = isWeatherStale(seg.weather_updated_at ?? null);
  return (
    <View style={styles.weatherRow}>
      <View style={styles.weatherItem}>
        <Text style={styles.weatherVal}>{seg.weather_temp_max != null ? `${seg.weather_temp_max}°C` : "—"}</Text>
        <Text style={styles.weatherLabel}>Máx</Text>
      </View>
      <View style={styles.weatherItem}>
        <Text style={[styles.weatherVal, (seg.weather_rain_pct ?? 0) >= RAIN_ALERT_THRESHOLD && styles.weatherWarn]}>
          {seg.weather_rain_pct ?? 0}%
        </Text>
        <Text style={styles.weatherLabel}>Chuva</Text>
      </View>
      <View style={styles.weatherItem}>
        <Text style={[styles.weatherVal, (seg.weather_wind_kmh ?? 0) >= WIND_ALERT_KMH && styles.weatherWarn]}>
          {seg.weather_wind_kmh ?? 0} km/h
        </Text>
        <Text style={styles.weatherLabel}>Vento</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.weatherCondition} numberOfLines={1}>{seg.weather_condition}</Text>
        {stale && <Text style={styles.staleLabel}>Desatualizado</Text>}
      </View>
    </View>
  );
}

function SegmentCard({
  seg,
  index,
  stop,
  onStopPress,
}: {
  seg: Segment;
  index: number;
  stop?: StopSuggestion;
  onStopPress?: () => void;
}) {
  const alertColor = seg.has_alert ? "#EF4444" : undefined;
  const alerts: string[] = (seg.alert_types as string[] | null) ?? [];
  return (
    <View style={[styles.segCard, seg.has_alert && styles.segCardAlert]}>
      <View style={styles.segHeader}>
        <View style={[styles.segBadge, seg.is_last_of_day && styles.segBadgeDay]}>
          <Text style={styles.segBadgeText}>{index + 1}</Text>
        </View>
        <View style={styles.segInfo}>
          <Text style={styles.segRoute} numberOfLines={1}>
            {seg.origin_name} → {seg.destination_name}
          </Text>
          {seg.route_summary ? (
            <Text style={styles.segSummary} numberOfLines={1}>{seg.route_summary}</Text>
          ) : null}
          {seg.is_last_of_day ? (
            <Text style={styles.segDayLabel}>Fim do Dia {seg.day_index}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.segStats}>
        <View style={styles.segStat}>
          <Text style={[styles.segStatVal, alertColor ? { color: alertColor } : null]}>
            {fmtKm(seg.distance_km)}
          </Text>
          <Text style={styles.segStatLabel}>Distância</Text>
        </View>
        <View style={styles.segStat}>
          <Text style={styles.segStatVal}>{fmtDuration(seg.duration_minutes)}</Text>
          <Text style={styles.segStatLabel}>Tempo</Text>
        </View>
        {stop && (
          <TouchableOpacity style={styles.segStopSuggestion} onPress={onStopPress} activeOpacity={0.7}>
            <Text style={styles.segStopName} numberOfLines={1}>
              ⛽ {stop.name}
            </Text>
            <Text style={styles.segStopMeta}>
              {stop.rating != null ? `★${stop.rating}` : ""}
              {stop.is_24h ? "  24h" : ""}
              {"  ›"}
            </Text>
          </TouchableOpacity>
        )}
        {alerts.length > 0 && (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {alerts.map((a) => (
              <View key={a} style={[styles.alertPill, a.startsWith("chuva") || a.startsWith("vento") ? styles.alertPillWeather : null]}>
                <Text style={styles.alertPillText}>⚠ {ALERT_LABELS[a] ?? a}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <WeatherBadge seg={seg} />
    </View>
  );
}

function LodgingBlock({
  tripId,
  dayIndex,
  departureDate,
  destCity,
  lodgingItem,
  onReservedToggle,
  onSearchPress,
}: {
  tripId: string;
  dayIndex: number;
  departureDate: string;
  destCity: string;
  lodgingItem?: LodgingSuggestion;
  onReservedToggle: (l: LodgingSuggestion) => void;
  onSearchPress: () => void;
}) {
  const checkin = addDays(departureDate, dayIndex - 1);
  const checkout = addDays(departureDate, dayIndex);

  if (!lodgingItem) {
    return (
      <TouchableOpacity style={styles.lodgingEmpty} onPress={onSearchPress} activeOpacity={0.7}>
        <Text style={styles.lodgingEmptyIcon}>🛏</Text>
        <Text style={styles.lodgingEmptyText}>Adicionar hospedagem — Dia {dayIndex}</Text>
        <Text style={styles.lodgingEmptyHint}>Toque para buscar opções em {destCity}</Text>
      </TouchableOpacity>
    );
  }

  const bgColor = lodgingItem.is_reserved ? "#14532D" : "#1E3A5F";
  const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(lodgingItem.city || destCity)}&checkin=${checkin}&checkout=${checkout}`;

  return (
    <View style={[styles.lodgingCard, { backgroundColor: bgColor }]}>
      <View style={styles.lodgingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lodgingDayLabel}>🛏 HOSPEDAGEM — DIA {dayIndex}</Text>
          <Text style={styles.lodgingName} numberOfLines={2}>{lodgingItem.name}</Text>
          <View style={styles.lodgingMeta}>
            {lodgingItem.rating != null && (
              <Text style={styles.lodgingMetaText}>★ {lodgingItem.rating}</Text>
            )}
            {lodgingItem.price_level != null && (
              <Text style={styles.lodgingMetaText}>{priceLabel(lodgingItem.price_level)}</Text>
            )}
            <Text style={styles.lodgingMetaText}>{lodgingItem.city}</Text>
          </View>
        </View>
        {lodgingItem.is_reserved && (
          <View style={styles.reservedBadge}>
            <Text style={styles.reservedBadgeText}>✓ Reservado</Text>
          </View>
        )}
      </View>
      <View style={styles.lodgingActions}>
        <TouchableOpacity
          style={styles.lodgingActionBtn}
          onPress={() => Linking.openURL(bookingUrl)}
        >
          <Text style={styles.lodgingActionText}>Ver no Booking</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.lodgingActionBtn, styles.lodgingActionSecondary]}
          onPress={() => onReservedToggle(lodgingItem)}
        >
          <Text style={styles.lodgingActionText}>
            {lodgingItem.is_reserved ? "Desfazer reserva" : "Marcar como reservado"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSearchPress}>
          <Text style={styles.lodgingChangeText}>Trocar →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [fetchingWeather, setFetchingWeather] = useState(false);
  const [stops, setStops] = useState<Map<string, StopSuggestion>>(new Map());
  const [lodging, setLodging] = useState<Map<number, LodgingSuggestion>>(new Map());
  const [stopModal, setStopModal] = useState<{ segId: string; alternatives: StopAlternative[] } | null>(null);
  const [selectingStop, setSelectingStop] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [addWpModal, setAddWpModal] = useState<{ afterSegIndex: number } | null>(null);
  const [wpQuery, setWpQuery] = useState("");
  const [wpResults, setWpResults] = useState<GeoResult[]>([]);
  const [wpSearching, setWpSearching] = useState(false);
  const [wpSaving, setWpSaving] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favSaving, setFavSaving] = useState<string | null>(null);
  const [removeWpConfirm, setRemoveWpConfirm] = useState<string | null>(null);

  async function load() {
    const supabase = getSupabase();
    const [{ data: tripData }, { data: segsData }] = await Promise.all([
      supabase.from("trips").select("*").eq("id", id).single(),
      supabase
        .from("segments")
        .select("*")
        .eq("trip_id", id)
        .order("order_index", { ascending: true }),
    ]);
    setTrip(tripData);
    const segs = segsData ?? [];
    setSegments(segs);

    // Load saved stop suggestions for each segment
    if (segs.length > 0) {
      const segIds = segs.map((s) => s.id);
      const { data: stopsData } = await supabase
        .from("stop_suggestions")
        .select("*")
        .in("segment_id", segIds)
        .eq("is_selected", true);
      if (stopsData && stopsData.length > 0) {
        const map = new Map<string, StopSuggestion>();
        for (const s of stopsData) {
          map.set(s.segment_id, {
            place_id: s.place_id,
            name: s.name,
            rating: s.rating,
            total_ratings: s.total_ratings,
            is_24h: s.is_24h,
            latitude: s.latitude,
            longitude: s.longitude,
          });
        }
        setStops(map);
      }
    }

    // Load manual waypoints
    const { data: wpData } = await supabase
      .from("waypoints")
      .select("id, name, latitude, longitude, order_index")
      .eq("trip_id", id)
      .order("order_index", { ascending: true });
    setWaypoints((wpData ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      latitude: Number(w.latitude),
      longitude: Number(w.longitude),
      order_index: w.order_index,
    })));

    // Load lodging suggestions
    const { data: lodgingData } = await supabase
      .from("lodging_suggestions")
      .select("*")
      .eq("trip_id", id)
      .eq("is_selected", true);
    if (lodgingData && lodgingData.length > 0) {
      const lmap = new Map<number, LodgingSuggestion>();
      for (const l of lodgingData) {
        lmap.set(l.day_index, {
          id: l.id,
          day_index: l.day_index,
          name: l.name,
          rating: l.rating,
          price_level: l.price_level,
          city: l.city,
          checkin_date: l.checkin_date,
          checkout_date: l.checkout_date,
          latitude: l.latitude,
          longitude: l.longitude,
          is_reserved: l.is_reserved ?? false,
        });
      }
      setLodging(lmap);
    } else {
      setLodging(new Map());
    }

    // Load user's favorite place_ids for star button state
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: favData } = await supabase
        .from("favorites")
        .select("place_id")
        .eq("user_id", authUser.id);
      setFavoriteIds(new Set((favData ?? []).map((f) => f.place_id)));
    }

    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [id]));

  async function toggleFavorite(alt: StopAlternative) {
    const supabase = getSupabase();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    setFavSaving(alt.place_id);
    try {
      if (favoriteIds.has(alt.place_id)) {
        await supabase.from("favorites").delete()
          .eq("user_id", authUser.id).eq("place_id", alt.place_id);
        setFavoriteIds((prev) => { const s = new Set(prev); s.delete(alt.place_id); return s; });
      } else {
        await supabase.from("favorites").upsert({
          user_id: authUser.id,
          place_id: alt.place_id,
          name: alt.name,
          place_type: "fuel",
          latitude: alt.latitude,
          longitude: alt.longitude,
          rating: alt.rating,
        }, { onConflict: "user_id,place_id" });
        setFavoriteIds((prev) => new Set([...prev, alt.place_id]));
      }
    } finally {
      setFavSaving(null);
    }
  }

  async function fetchWeather(segs: Segment[], departureDate: string) {
    if (!isWeatherAvailable(departureDate)) return;
    setFetchingWeather(true);
    const supabase = getSupabase();
    try {
      const updates = await Promise.allSettled(
        segs.map(async (seg) => {
          const date = segmentDate(departureDate, seg.day_index ?? 1);
          const weather = await fetchSegmentWeather(seg.dest_lat, seg.dest_lng, date);

          // Merge weather alerts with existing route alerts
          const routeAlerts = ((seg.alert_types as string[] | null) ?? []).filter(
            (a) => a === "trecho_longo" || a === "trecho_curto"
          );
          const weatherAlerts: string[] = [];
          if (weather.rain_pct >= RAIN_ALERT_THRESHOLD) weatherAlerts.push("chuva_forte");
          if (weather.wind_kmh >= WIND_ALERT_KMH) weatherAlerts.push("vento_forte");
          const allAlerts = [...routeAlerts, ...weatherAlerts];

          await supabase.from("segments").update({
            weather_temp_max: weather.temp_max,
            weather_rain_pct: weather.rain_pct,
            weather_condition: weather.condition,
            weather_wind_kmh: weather.wind_kmh,
            weather_updated_at: new Date().toISOString(),
            has_alert: allAlerts.length > 0,
            alert_types: allAlerts.length > 0 ? allAlerts : null,
          }).eq("id", seg.id);

          return { segId: seg.id, weatherAlerts };
        })
      );

      // Update trips.has_weather_alert
      const hasWeatherAlert = updates.some(
        (r) => r.status === "fulfilled" && r.value.weatherAlerts.length > 0
      );
      await supabase.from("trips").update({ has_weather_alert: hasWeatherAlert }).eq("id", id);

      await load();
    } catch (e: any) {
      Alert.alert("Erro ao buscar clima", e.message ?? "Tente novamente.");
    } finally {
      setFetchingWeather(false);
    }
  }

  async function fetchStops(segs: Segment[]) {
    const supabase = getSupabase();
    // Only intermediate stops (not the final destination = last segment overall)
    const intermediateSegs = segs.slice(0, -1);
    if (intermediateSegs.length === 0) return;

    const results = await Promise.allSettled(
      intermediateSegs.map(async (seg) => {
        const suggestions = await fetchStopSuggestions(seg.dest_lat, seg.dest_lng);
        if (suggestions.length === 0) return;

        // Delete old suggestions for this segment then insert fresh ones
        await supabase.from("stop_suggestions").delete().eq("segment_id", seg.id);
        await supabase.from("stop_suggestions").insert(
          suggestions.map((s, i) => ({
            segment_id: seg.id,
            place_id: s.place_id,
            name: s.name,
            rating: s.rating,
            total_ratings: s.total_ratings,
            is_24h: s.is_24h,
            latitude: s.latitude,
            longitude: s.longitude,
            is_selected: i === 0, // best option pre-selected
          }))
        );
      })
    );
  }

  async function saveTrip() {
    if (!trip) return;
    const supabase = getSupabase();
    await supabase.from("trips").update({ status: "saved" }).eq("id", trip.id);
    await load();
    Alert.alert("Roteiro salvo!", "Encontrado na aba 'Salvas' em Viagens.");
  }

  async function startTrip() {
    if (!trip) return;
    const supabase = getSupabase();
    await supabase
      .from("trips")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", trip.id);
    router.push(`/trip/${id}/active` as any);
  }

  async function openStopAlternatives(segId: string) {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("stop_suggestions")
      .select("*")
      .eq("segment_id", segId)
      .order("rating", { ascending: false });
    if (data && data.length > 0) {
      setStopModal({ segId, alternatives: data as StopAlternative[] });
    }
  }

  async function selectStopAlternative(segId: string, placeId: string) {
    setSelectingStop(placeId);
    const supabase = getSupabase();
    try {
      await supabase
        .from("stop_suggestions")
        .update({ is_selected: false })
        .eq("segment_id", segId);
      await supabase
        .from("stop_suggestions")
        .update({ is_selected: true })
        .eq("segment_id", segId)
        .eq("place_id", placeId);
      setStopModal(null);
      await load();
    } finally {
      setSelectingStop(null);
    }
  }

  async function toggleReserved(l: LodgingSuggestion) {
    const supabase = getSupabase();
    await supabase
      .from("lodging_suggestions")
      .update({ is_reserved: !l.is_reserved })
      .eq("id", l.id);
    await load();
  }

  function openLodgingSearch(dayIndex: number, destCity: string) {
    const checkin = addDays(trip!.departure_date, dayIndex - 1);
    const checkout = addDays(trip!.departure_date, dayIndex);
    router.push(
      `/trip/${id}/lodging?day=${dayIndex}&city=${encodeURIComponent(destCity)}&checkin=${checkin}&checkout=${checkout}` as any
    );
  }

  async function searchWaypoint(query: string) {
    if (!query.trim()) return;
    setWpSearching(true);
    setWpResults([]);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const json = await res.json();
      setWpResults(json.results ?? []);
    } finally {
      setWpSearching(false);
    }
  }

  async function saveWaypoint(result: GeoResult) {
    if (!addWpModal) return;
    setWpSaving(true);
    const supabase = getSupabase();
    try {
      await supabase.from("waypoints").insert({
        trip_id: id,
        name: result.name,
        latitude: result.lat,
        longitude: result.lng,
        order_index: addWpModal.afterSegIndex,
        is_mandatory: true,
      });
      setAddWpModal(null);
      setWpQuery("");
      setWpResults([]);
      await load();
    } finally {
      setWpSaving(false);
    }
  }

  async function deleteWaypoint(wpId: string) {
    const supabase = getSupabase();
    await supabase.from("waypoints").delete().eq("id", wpId);
    setRemoveWpConfirm(null);
    const { data: remaining } = await supabase
      .from("waypoints")
      .select("name, latitude, longitude, order_index")
      .eq("trip_id", id)
      .order("order_index", { ascending: true });
    const remainingWps: ManualWaypoint[] = (remaining ?? []).map((w) => ({
      name: w.name,
      lat: Number(w.latitude),
      lng: Number(w.longitude),
    }));
    await calcularRota(remainingWps);
  }

  async function calcularRota(overrideWaypoints?: ManualWaypoint[]) {
    if (!trip) return;
    setCalculating(true);
    try {
      const manualWps: ManualWaypoint[] = overrideWaypoints ?? waypoints.map((w) => ({
        name: w.name,
        lat: w.latitude,
        lng: w.longitude,
      }));
      const result = await generateSegments(
        trip.origin,
        trip.destination,
        trip.min_stop_km,
        trip.max_stop_km,
        trip.num_days,
        manualWps.length > 0 ? manualWps : undefined
      );

      const supabase = getSupabase();
      await supabase.from("segments").delete().eq("trip_id", id);
      await supabase.from("segments").insert(
        result.segments.map(({ waypoint_lat: _wlat, waypoint_lng: _wlng, ...s }) => ({ ...s, trip_id: id }))
      );

      const stopCount = Math.max(0, result.segments.length - 1);
      await supabase
        .from("trips")
        .update({
          total_distance_km: result.total_km,
          total_duration_min: result.total_duration_min,
          stop_count: stopCount,
        })
        .eq("id", id);

      await load();

      // Auto-fetch weather if trip is within forecast window
      const { data: freshSegs } = await supabase
        .from("segments")
        .select("*")
        .eq("trip_id", id)
        .order("order_index", { ascending: true });
      if (freshSegs && freshSegs.length > 0) {
        await Promise.all([
          fetchWeather(freshSegs, trip.departure_date),
          fetchStops(freshSegs),
        ]);
        await load();
      }
    } catch (e: any) {
      Alert.alert("Erro ao calcular rota", e.message ?? "Tente novamente.");
    } finally {
      setCalculating(false);
    }
  }

  const weatherUnavailableDays = trip ? daysUntilForecast(trip.departure_date) : 0;
  const weatherAvailable = trip ? isWeatherAvailable(trip.departure_date) : false;
  const hasWeatherData = segments.some((s) => s.weather_condition != null);
  const anyStale = hasWeatherData && segments.some((s) => isWeatherStale(s.weather_updated_at ?? null));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97826" size="large" />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Viagem não encontrada.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {trip.title}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Weather stale banner */}
      {anyStale && (
        <View style={styles.staleBanner}>
          <Text style={styles.staleBannerText}>
            Clima desatualizado — toque em "Atualizar Clima" para renovar
          </Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Trip summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryRoute}>
            {trip.origin} → {trip.destination}
          </Text>
          <Text style={styles.summaryDate}>{formatDate(trip.departure_date)} às {trip.departure_time}</Text>

          {trip.total_distance_km != null && (
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{trip.total_distance_km} km</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              {trip.total_duration_min != null && (
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{fmtDuration(trip.total_duration_min)}</Text>
                  <Text style={styles.statLabel}>Duração</Text>
                </View>
              )}
              <View style={styles.stat}>
                <Text style={styles.statVal}>{trip.num_days}</Text>
                <Text style={styles.statLabel}>{trip.num_days === 1 ? "Dia" : "Dias"}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Weather availability notice */}
        {segments.length > 0 && !weatherAvailable && (
          <View style={styles.weatherNoticeCard}>
            <Text style={styles.weatherNoticeTitle}>PREVISÃO DO TEMPO</Text>
            <Text style={styles.weatherNoticeText}>
              Clima disponível em {weatherUnavailableDays} {weatherUnavailableDays === 1 ? "dia" : "dias"}
            </Text>
          </View>
        )}

        {/* Segments */}
        <Text style={styles.sectionLabel}>SEGMENTOS DA ROTA</Text>

        {segments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Rota ainda não calculada.</Text>
            <Text style={styles.emptyHint}>
              Toque em "Calcular Rota" para buscar os segmentos via Google Maps.
            </Text>
          </View>
        ) : (() => {
          const maxDay = Math.max(...segments.map((s) => s.day_index ?? 1));
          return segments.map((seg, i) => {
            const dayIdx = seg.day_index ?? 1;
            const showLodging = seg.is_last_of_day && dayIdx < maxDay;
            const isLastSeg = i === segments.length - 1;
            // Find waypoints that fall after this segment (between i and i+1)
            const wpsAfter = waypoints.filter((w) => w.order_index === i);
            return (
              <View key={seg.id}>
                <SegmentCard
                  seg={seg}
                  index={i}
                  stop={stops.get(seg.id)}
                  onStopPress={() => openStopAlternatives(seg.id)}
                />
                {showLodging && (
                  <LodgingBlock
                    tripId={id}
                    dayIndex={dayIdx}
                    departureDate={trip!.departure_date}
                    destCity={seg.destination_name ?? seg.origin_name ?? ""}
                    lodgingItem={lodging.get(dayIdx)}
                    onReservedToggle={toggleReserved}
                    onSearchPress={() => openLodgingSearch(dayIdx, seg.destination_name ?? "")}
                  />
                )}
                {!isLastSeg && (
                  <View style={styles.wpDivider}>
                    {wpsAfter.map((wp) => (
                      <View key={wp.id}>
                        {removeWpConfirm === wp.id ? (
                          <View style={styles.wpRemoveConfirm}>
                            <Text style={styles.wpRemoveConfirmText}>Remover "{wp.name}"?</Text>
                            <TouchableOpacity
                              onPress={() => setRemoveWpConfirm(null)}
                              style={styles.wpRemoveCancel}
                            >
                              <Text style={styles.wpRemoveCancelText}>Não</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => deleteWaypoint(wp.id)}
                              style={styles.wpRemoveConfirmBtn}
                            >
                              <Text style={styles.wpRemoveConfirmBtnText}>Remover</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.wpTag}>
                            <Text style={styles.wpTagText}>📍 {wp.name}</Text>
                            <TouchableOpacity
                              onPress={() => setRemoveWpConfirm(wp.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.wpTagRemove}>×</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.addWpBtn}
                      onPress={() => { setAddWpModal({ afterSegIndex: i }); setWpQuery(""); setWpResults([]); }}
                    >
                      <Text style={styles.addWpBtnText}>+ Inserir parada aqui</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          });
        })()}

        <TouchableOpacity
          style={[styles.btnCalc, (calculating || fetchingWeather) && { opacity: 0.6 }]}
          onPress={calcularRota}
          disabled={calculating || fetchingWeather}
        >
          {calculating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnCalcText}>
              {segments.length === 0 ? "Calcular Rota" : "Recalcular Rota"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Refresh weather button — shown when there's data and forecast is available */}
        {segments.length > 0 && weatherAvailable && (
          <TouchableOpacity
            style={[styles.btnWeather, fetchingWeather && { opacity: 0.6 }]}
            onPress={() => fetchWeather(segments, trip.departure_date)}
            disabled={fetchingWeather || calculating}
          >
            {fetchingWeather ? (
              <ActivityIndicator color="#C97826" />
            ) : (
              <Text style={styles.btnWeatherText}>
                {hasWeatherData ? "Atualizar Clima" : "Buscar Previsão do Tempo"}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Save / Start trip */}
        {segments.length > 0 && (trip.status === "planned" || trip.status === "saved") && (
          <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 8 }}>
            {trip.status === "planned" && (
              <TouchableOpacity
                style={[styles.btnSave, (calculating || fetchingWeather) && { opacity: 0.5 }]}
                onPress={saveTrip}
                disabled={calculating || fetchingWeather}
              >
                <Text style={styles.btnSaveText}>💾 Salvar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btnStart, { flex: 1, marginHorizontal: 0, marginTop: 0 }, (calculating || fetchingWeather) && { opacity: 0.5 }]}
              onPress={startTrip}
              disabled={calculating || fetchingWeather}
            >
              <Text style={styles.btnStartText}>🏍 Iniciar Viagem</Text>
            </TouchableOpacity>
          </View>
        )}

        {trip.status === "active" && (
          <TouchableOpacity
            style={styles.btnContinue}
            onPress={() => router.push(`/trip/${id}/active` as any)}
          >
            <Text style={styles.btnContinueText}>▶ Continuar Viagem</Text>
          </TouchableOpacity>
        )}

        {/* Stop alternatives modal */}
        <Modal
          visible={stopModal != null}
          transparent
          animationType="slide"
          onRequestClose={() => setStopModal(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setStopModal(null)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Alternativas de parada</Text>
              {stopModal?.alternatives.map((alt) => (
                <TouchableOpacity
                  key={alt.place_id}
                  style={[styles.altRow, alt.is_selected && styles.altRowSelected]}
                  onPress={() => selectStopAlternative(stopModal.segId, alt.place_id)}
                  disabled={selectingStop != null}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.altName, alt.is_selected && styles.altNameSelected]} numberOfLines={1}>
                      ⛽ {alt.name}
                    </Text>
                    <Text style={styles.altMeta}>
                      {alt.rating != null ? `★${alt.rating}` : ""}
                      {alt.total_ratings != null ? ` (${alt.total_ratings})` : ""}
                      {alt.is_24h ? "  24h" : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleFavorite(alt)}
                    disabled={favSaving === alt.place_id}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4, marginRight: 8 }}
                  >
                    {favSaving === alt.place_id
                      ? <ActivityIndicator size="small" color="#C97826" />
                      : <Text style={{ fontSize: 20 }}>{favoriteIds.has(alt.place_id) ? "⭐" : "☆"}</Text>
                    }
                  </TouchableOpacity>
                  {selectingStop === alt.place_id ? (
                    <ActivityIndicator size="small" color="#C97826" />
                  ) : alt.is_selected ? (
                    <Text style={styles.altCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setStopModal(null)}>
                <Text style={styles.modalCancelText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Add waypoint modal */}
        <Modal
          visible={addWpModal != null}
          transparent
          animationType="slide"
          onRequestClose={() => setAddWpModal(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setAddWpModal(null)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Inserir parada</Text>
              <View style={styles.wpSearchRow}>
                <TextInput
                  style={styles.wpSearchInput}
                  value={wpQuery}
                  onChangeText={setWpQuery}
                  placeholder="Cidade ou endereço"
                  placeholderTextColor="#aaa"
                  onSubmitEditing={() => searchWaypoint(wpQuery)}
                  returnKeyType="search"
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.wpSearchBtn}
                  onPress={() => searchWaypoint(wpQuery)}
                  disabled={wpSearching}
                >
                  {wpSearching ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.wpSearchBtnText}>Buscar</Text>
                  )}
                </TouchableOpacity>
              </View>
              {wpResults.map((r, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.altRow, wpSaving && { opacity: 0.5 }]}
                  onPress={() => saveWaypoint(r)}
                  disabled={wpSaving}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.altName} numberOfLines={1}>📍 {r.name}</Text>
                    <Text style={styles.altMeta} numberOfLines={1}>{r.address}</Text>
                  </View>
                  {wpSaving ? <ActivityIndicator size="small" color="#C97826" /> : null}
                </TouchableOpacity>
              ))}
              {wpResults.length === 0 && !wpSearching && wpQuery.trim().length > 0 && (
                <Text style={styles.modalCancelText}>Nenhum resultado. Tente outro nome.</Text>
              )}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddWpModal(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {segments.length > 0 && trip.max_stop_km != null && (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>REGRAS DA VIAGEM</Text>
            <Text style={styles.rulesLine}>
              Paradas: {trip.min_stop_km}–{trip.max_stop_km} km entre cada uma
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1A1A",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backBtn: { fontSize: 22, color: "#fff", fontWeight: "300" },
  topBarTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },
  staleBanner: {
    backgroundColor: "#FEF3C7",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  staleBannerText: { fontSize: 13, color: "#92400E", textAlign: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  summaryCard: {
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryRoute: { fontSize: 17, fontWeight: "700", color: "#1A1A1A", marginBottom: 4 },
  summaryDate: { fontSize: 13, color: "#666", marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 28 },
  stat: { alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "700", color: "#C97826" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 2 },

  weatherNoticeCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    alignItems: "center",
  },
  weatherNoticeTitle: { fontSize: 10, fontWeight: "700", color: "#1D4ED8", letterSpacing: 0.8, marginBottom: 4 },
  weatherNoticeText: { fontSize: 14, color: "#1E40AF" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.8,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
  },

  segCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segCardAlert: {
    borderLeftWidth: 3,
    borderLeftColor: "#EF4444",
  },
  segHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  segBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#C97826",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  segBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  segInfo: { flex: 1 },
  segRoute: { fontSize: 14, fontWeight: "600", color: "#1A1A1A" },
  segSummary: { fontSize: 12, color: "#888", marginTop: 2 },
  segBadgeDay: { backgroundColor: "#1A1A1A" },
  segDayLabel: { fontSize: 10, color: "#C97826", fontWeight: "700", marginTop: 3 },
  segStats: { flexDirection: "row", gap: 20, flexWrap: "wrap", alignItems: "center", marginBottom: 8 },
  segStat: { alignItems: "center" },
  segStatVal: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  segStatLabel: { fontSize: 11, color: "#888", marginTop: 1 },
  segStopSuggestion: {
    flex: 1,
    justifyContent: "center",
  },
  segStopName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  segStopMeta: {
    fontSize: 11,
    color: "#888",
    marginTop: 1,
  },

  alertPill: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  alertPillWeather: {
    backgroundColor: "#DBEAFE",
  },
  alertPillText: { fontSize: 11, color: "#EF4444", fontWeight: "600" },

  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  weatherItem: { alignItems: "center" },
  weatherVal: { fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
  weatherWarn: { color: "#EF4444" },
  weatherLabel: { fontSize: 10, color: "#aaa", marginTop: 1 },
  weatherCondition: { fontSize: 12, color: "#555", flex: 1 },
  staleLabel: { fontSize: 10, color: "#D97706", marginTop: 2 },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  emptyText: { fontSize: 15, color: "#555", marginBottom: 6, fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#aaa", textAlign: "center" },

  btnCalc: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 18,
    alignItems: "center",
  },
  btnCalcText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  btnStart: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#C97826",
  },
  btnStartText: { color: "#C97826", fontSize: 17, fontWeight: "800" },

  btnContinue: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 18,
    alignItems: "center",
  },
  btnContinueText: { color: "#fff", fontSize: 17, fontWeight: "800" },

  btnWeather: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#C97826",
  },
  btnWeatherText: { color: "#C97826", fontSize: 15, fontWeight: "700" },

  rulesCard: {
    backgroundColor: "#FEF3E2",
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
  },
  rulesTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#C97826",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  rulesLine: { fontSize: 13, color: "#7C4A00" },

  notFound: { fontSize: 16, color: "#555", marginBottom: 12 },
  link: { color: "#C97826", fontSize: 15 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 14,
  },
  altRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    gap: 10,
  },
  altRowSelected: {
    backgroundColor: "#FEF3E2",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderBottomColor: "transparent",
  },
  altName: { fontSize: 14, fontWeight: "600", color: "#1A1A1A" },
  altNameSelected: { color: "#C97826" },
  altMeta: { fontSize: 12, color: "#888", marginTop: 2 },
  altCheck: { fontSize: 18, color: "#C97826", fontWeight: "700" },
  modalCancelBtn: {
    marginTop: 18,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
  },
  modalCancelText: { fontSize: 15, color: "#555", fontWeight: "600" },

  lodgingEmpty: {
    borderWidth: 1.5,
    borderColor: "#D0D0D0",
    borderStyle: "dashed",
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  lodgingEmptyIcon: { fontSize: 22, marginBottom: 6 },
  lodgingEmptyText: { fontSize: 14, fontWeight: "700", color: "#555", marginBottom: 2 },
  lodgingEmptyHint: { fontSize: 12, color: "#aaa" },

  lodgingCard: {
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
  },
  lodgingRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  lodgingDayLabel: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 0.8, marginBottom: 4 },
  lodgingName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  lodgingMeta: { flexDirection: "row", gap: 10, marginTop: 4, flexWrap: "wrap" },
  lodgingMetaText: { fontSize: 12, color: "rgba(255,255,255,0.75)" },
  reservedBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  reservedBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  lodgingActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  lodgingActionBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  lodgingActionSecondary: { backgroundColor: "rgba(255,255,255,0.10)" },
  lodgingActionText: { fontSize: 12, color: "#fff", fontWeight: "600" },
  lodgingChangeText: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginLeft: 4 },

  wpDivider: {
    marginHorizontal: 16,
    marginVertical: 4,
    gap: 6,
  },
  wpTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    gap: 6,
    alignSelf: "flex-start",
  },
  wpTagText: { fontSize: 13, color: "#1E40AF", fontWeight: "600" },
  wpTagRemove: { fontSize: 16, color: "#93C5FD", fontWeight: "700" },
  addWpBtn: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D0D0D0",
    borderStyle: "dashed",
    backgroundColor: "#fff",
  },
  addWpBtnText: { fontSize: 12, color: "#888" },

  wpSearchRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  wpSearchInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  wpSearchBtn: {
    backgroundColor: "#C97826",
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 42,
    justifyContent: "center",
  },
  wpSearchBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  wpRemoveConfirm: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    gap: 8,
    alignSelf: "flex-start",
  },
  wpRemoveConfirmText: { fontSize: 13, color: "#991B1B", fontWeight: "600", flex: 1 },
  wpRemoveCancel: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D0D0D0",
  },
  wpRemoveCancelText: { fontSize: 12, color: "#555", fontWeight: "600" },
  wpRemoveConfirmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#EF4444",
  },
  wpRemoveConfirmBtnText: { fontSize: 12, color: "#fff", fontWeight: "700" },

  btnSave: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#D0D0D0",
  },
  btnSaveText: { color: "#555", fontSize: 15, fontWeight: "700" },
});
