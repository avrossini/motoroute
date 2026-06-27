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
  Image,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Platform } from "react-native";
import { useState, useCallback, useRef, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";
import { openNavigation } from "@/platform/navigation";
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
  type StopSuggestionsResult,
} from "@/services/placesService";
import type { Database } from "@/types/database";
import TripMap from "@/components/TripMap";

interface LodgingSuggestion {
  id: string;
  day_index: number;
  source: string;
  name: string;
  address: string | null;
  rating: number | null;
  price_level: number | null;
  city: string;
  checkin_date: string;
  checkout_date: string;
  latitude: number | null;
  longitude: number | null;
  is_reserved: boolean;
  guest_count: number;
  booking_url: string | null;
  parking_status: string;
  breakfast_status: string;
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

const RAIN_ALERT_THRESHOLD = 40;
const WIND_ALERT_KMH = 50;

const ALERT_LABELS: Record<string, string> = {
  trecho_longo: "Trecho longo",
  trecho_curto: "Trecho curto",
  chuva_forte: "Chuva provável",
  vento_forte: "Vento forte",
};

const ALERT_CHIP_BG: Record<string, string> = {
  chuva_forte: "#EBF4FF",
  vento_forte: "#FFF3E0",
  trecho_longo: "#FEF3C7",
  trecho_curto: "#FEF3C7",
};
const ALERT_CHIP_COLOR: Record<string, string> = {
  chuva_forte: "#1565C0",
  vento_forte: "#E65100",
  trecho_longo: "#B45309",
  trecho_curto: "#B45309",
};

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

function weatherIcon(condition: string | null): string {
  if (!condition) return "🌡";
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return "⛈";
  if (c.includes("blizzard") || c.includes("snow") || c.includes("sleet")) return "🌨";
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return "🌫";
  if (c.includes("heavy rain") || c.includes("torrential")) return "🌧";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "🌦";
  if (c.includes("overcast")) return "☁️";
  if (c.includes("partly")) return "⛅";
  if (c.includes("sunny") || c.includes("clear")) return "☀️";
  return "🌡";
}

/** Perpendicular distance (km) from point P to the line segment A→B, clamped to endpoints. */
function perpendicularDistanceKm(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const R = 6371;
  const DEG = Math.PI / 180;
  const latRef = (aLat + bLat) / 2;
  const scale = Math.cos(latRef * DEG);
  const px = (pLng - aLng) * DEG * scale * R;
  const py = (pLat - aLat) * DEG * R;
  const bx = (bLng - aLng) * DEG * scale * R;
  const by = (bLat - aLat) * DEG * R;
  const lenSq = bx * bx + by * by;
  if (lenSq < 1e-10) return Math.sqrt(px * px + py * py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  const dx = px - t * bx;
  const dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function WeatherPanel({ seg, departureDate }: { seg: Segment; departureDate: string }) {
  const segDate = segmentDate(departureDate, seg.day_index ?? 1);
  const available = isWeatherAvailable(segDate);

  if (!available) {
    const days = daysUntilForecast(segDate);
    return (
      <View style={styles.weatherPanel}>
        <Text style={{ fontSize: 20 }}>🔒</Text>
        <Text style={styles.weatherLocked}>Prev. em</Text>
        <View style={styles.weatherCountdown}>
          <Text style={styles.weatherCountdownText}>{days}d</Text>
        </View>
      </View>
    );
  }

  if (!seg.weather_condition) {
    return (
      <View style={[styles.weatherPanel, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 16 }}>—</Text>
        <Text style={styles.weatherLocked}>Sem dados</Text>
      </View>
    );
  }

  return (
    <View style={styles.weatherPanel}>
      <Text style={{ fontSize: 28, lineHeight: 32 }}>{weatherIcon(seg.weather_condition)}</Text>
      <Text style={styles.weatherPanelTemp}>
        {seg.weather_temp_max != null ? `${seg.weather_temp_max}°` : "—"}
      </Text>
      <Text style={styles.weatherPanelSub}>
        🌧 {seg.weather_rain_pct ?? 0}%{"\n"}
        💨 {seg.weather_wind_kmh ?? 0}km/h
      </Text>
    </View>
  );
}

function DayHeader({
  dayIndex,
  date,
  originName,
  destinName,
  totalKm,
}: {
  dayIndex: number;
  date: string;
  originName: string;
  destinName: string;
  totalKm: number;
}) {
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  });
  return (
    <View style={styles.dayHeader}>
      <View style={{ flex: 1 }}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>DIA {dayIndex}</Text>
        </View>
        <Text style={styles.dayRoute} numberOfLines={1}>
          {originName} → {destinName}
        </Text>
        <Text style={styles.dayDate}>{dateLabel}</Text>
      </View>
      <Text style={styles.dayKm}>{Math.round(totalKm)}km</Text>
    </View>
  );
}

function SegmentCard({
  seg,
  stop,
  departureDate,
  departureTime,
  onStopPress,
  onAddPress,
  onNavigatePress,
}: {
  seg: Segment;
  stop?: StopSuggestion;
  departureDate: string;
  departureTime: string;
  onStopPress?: () => void;
  onAddPress?: () => void;
  onNavigatePress?: () => void;
}) {
  const alerts: string[] = (seg.alert_types as string[] | null) ?? [];

  return (
    <View style={[styles.segCard, seg.has_alert && styles.segCardAlert]}>
      <View style={styles.segBody}>
        <View style={styles.segContent}>
          <View style={styles.segTop}>
            <Text style={styles.segRoute} numberOfLines={1}>
              {seg.origin_name} → {seg.destination_name}
            </Text>
            <View style={styles.segTopRight}>
              <Text style={styles.segTime}>{departureTime}</Text>
              {onAddPress && (
                <TouchableOpacity style={styles.addWpInCardBtn} onPress={onAddPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={styles.addWpInCardBtnText}>＋</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {seg.route_summary ? (
            <Text style={styles.segSummary} numberOfLines={1}>{seg.route_summary}</Text>
          ) : null}
          <View style={styles.segBadges}>
            <View style={styles.badgeKm}>
              <Text style={styles.badgeKmText}>{fmtKm(seg.distance_km)}</Text>
            </View>
            <View style={styles.badgeTime}>
              <Text style={styles.badgeTimeText}>{fmtDuration(seg.duration_minutes)}</Text>
            </View>
            {seg.is_last_of_day && (
              <Text style={styles.segDayEndLabel}>Fim Dia {seg.day_index}</Text>
            )}
          </View>
          {stop && (
            <TouchableOpacity style={styles.segStopCard} onPress={onStopPress} activeOpacity={0.7}>
              <Text style={styles.segStopIcon}>⛽</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.segStopName} numberOfLines={1}>{stop.name}</Text>
                <Text style={styles.segStopMeta}>
                  {stop.rating != null ? `★${stop.rating}` : "Sem avaliação"}
                  {stop.total_ratings != null ? ` (${stop.total_ratings})` : ""}
                  {stop.is_24h ? "  24h" : ""}
                </Text>
                {(stop.rating == null || stop.rating < 4.0) && (
                  <Text style={styles.segStopLowRating}>⚠ Avaliação baixa — confirme antes de ir</Text>
                )}
              </View>
              <Text style={styles.segStopAlt}>Ver alt. ›</Text>
            </TouchableOpacity>
          )}
          {onNavigatePress && (
            <TouchableOpacity style={styles.navigateBtn} onPress={onNavigatePress}>
              <Text style={styles.navigateBtnText}>Navegar →</Text>
            </TouchableOpacity>
          )}
        </View>
        <WeatherPanel seg={seg} departureDate={departureDate} />
      </View>
      {alerts.length > 0 && (
        <View style={styles.segAlerts}>
          {alerts.map((a) => (
            <View
              key={a}
              style={[styles.alertChip, { backgroundColor: ALERT_CHIP_BG[a] ?? "#FEE2E2" }]}
            >
              <Text style={[styles.alertChipText, { color: ALERT_CHIP_COLOR[a] ?? "#EF4444" }]}>
                ⚠ {ALERT_LABELS[a] ?? a}
              </Text>
            </View>
          ))}
        </View>
      )}
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

  function openExternalLink(url: string) {
    if (Platform.OS === "web") (window as any).open(url, "_blank");
    else Linking.openURL(url);
  }

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
        {lodgingItem.booking_url != null && (
          <TouchableOpacity
            style={styles.lodgingActionBtn}
            onPress={() => openExternalLink(lodgingItem.booking_url!)}
          >
            <Text style={styles.lodgingActionText}>🌐 Ver link externo</Text>
          </TouchableOpacity>
        )}
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
  const { id, autoCalc } = useLocalSearchParams<{ id: string; autoCalc?: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
  const [mergeModal, setMergeModal] = useState<{ segA: Segment; segB: Segment } | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    mergedKm: number; mergedMin: number; deltaKm: number; deltaMin: number;
  } | null>(null);
  const [mergeExecuting, setMergeExecuting] = useState(false);
  const [activeView, setActiveView] = useState<"list" | "map">("list");
  const [fetchingWeather, setFetchingWeather] = useState(false);
  const [stops, setStops] = useState<Map<string, StopSuggestion>>(new Map());
  const [lodging, setLodging] = useState<Map<number, LodgingSuggestion>>(new Map());
  const [stopModal, setStopModal] = useState<{
    segId: string;
    alternatives: StopAlternative[];
    originLat: number;
    originLng: number;
    currentKm: number;
  } | null>(null);
  const [altDeltas, setAltDeltas] = useState<Map<string, number | null>>(new Map());
  const [loadingDeltas, setLoadingDeltas] = useState(false);
  const [photoGallery, setPhotoGallery] = useState<{ name: string; photos: string[]; loading: boolean } | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const photoScrollRef = useCallback((rnNode: any) => {
    if (!rnNode || Platform.OS !== "web") return;
    // Find the scrollable DOM node — try both the RN wrapper and its firstChild
    const candidates: HTMLElement[] = [];
    const outer: HTMLElement | null = rnNode.getScrollableNode?.() ?? (rnNode._nativeTag ? null : rnNode);
    if (outer) candidates.push(outer);
    if (outer?.firstChild) candidates.push(outer.firstChild as HTMLElement);
    const node = candidates.find((n) => getComputedStyle(n).overflowX === "scroll" || getComputedStyle(n).overflowX === "auto") ?? candidates[0];
    if (!node) return;
    let isDragging = false, startX = 0, scrollLeft = 0;
    const onDown = (e: MouseEvent) => { isDragging = true; startX = e.pageX; scrollLeft = node.scrollLeft; node.style.cursor = "grabbing"; node.style.userSelect = "none"; };
    const onUp = () => { isDragging = false; node.style.cursor = "grab"; node.style.userSelect = ""; };
    const onMove = (e: MouseEvent) => { if (!isDragging) return; e.preventDefault(); node.scrollLeft = scrollLeft - (e.pageX - startX); };
    node.style.cursor = "grab";
    node.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
  }, []);
  const [selectingStop, setSelectingStop] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [addWpModal, setAddWpModal] = useState<{ segIndex: number; segment: (typeof segments)[0] } | null>(null);
  const [wpQuery, setWpQuery] = useState("");
  const [wpResults, setWpResults] = useState<GeoResult[]>([]);
  const [wpSearching, setWpSearching] = useState(false);
  const [wpSaving, setWpSaving] = useState(false);
  const [wpPending, setWpPending] = useState<{ result: GeoResult; segIndex: number; splitSeg: (typeof segments)[0] } | null>(null);
  const [wpImpact, setWpImpact] = useState<{
    deviationKm: number;
    deltaKm: number;
    deltaMin: number;
    newSegments: Array<{
      originName: string; destName: string; km: number; min: number;
      originLat?: number | null; originLng?: number | null;
      destLat?: number | null; destLng?: number | null;
    }>;
  } | null>(null);
  const [wpPreviewLoading, setWpPreviewLoading] = useState(false);
  const [wpExecuting, setWpExecuting] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favSaving, setFavSaving] = useState<string | null>(null);
  const [removeWpConfirm, setRemoveWpConfirm] = useState<string | null>(null);
  const [navApp, setNavApp] = useState<'google_maps' | 'waze' | null>(null);

  async function load() {
    const supabase = getSupabase();
    const [{ data: tripData }, { data: segsData }, { data: prefsData }] = await Promise.all([
      supabase.from("trips").select("*").eq("id", id).single(),
      supabase
        .from("segments")
        .select("*")
        .eq("trip_id", id)
        .order("order_index", { ascending: true }),
      supabase.from("user_preferences").select("default_navigation_app").maybeSingle(),
    ]);
    setTrip(tripData);
    setNavApp((prefsData?.default_navigation_app as 'google_maps' | 'waze' | null) ?? null);
    const segs = segsData ?? [];
    setSegments(segs);

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
          source: (l as any).source ?? "auto",
          name: l.name,
          address: (l as any).address ?? null,
          rating: l.rating,
          price_level: l.price_level,
          city: l.city,
          checkin_date: l.checkin_date,
          checkout_date: l.checkout_date,
          latitude: l.latitude,
          longitude: l.longitude,
          is_reserved: l.is_reserved ?? false,
          guest_count: (l as any).guest_count ?? 1,
          booking_url: (l as any).booking_url ?? null,
          parking_status: (l as any).parking_status ?? "unknown",
          breakfast_status: (l as any).breakfast_status ?? "unknown",
        });
      }
      setLodging(lmap);
    } else {
      setLodging(new Map());
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: favData } = await supabase
        .from("favorites")
        .select("place_id")
        .eq("user_id", authUser.id);
      setFavoriteIds(new Set((favData ?? []).map((f) => f.place_id)));
    }

    setLoading(false);
    return tripData;
  }

  useFocusEffect(useCallback(() => {
    load().then((tripData) => {
      if (autoCalc === "true" && tripData) calcularRota(undefined, tripData);
    });
  }, [id]));

  function handleNavigate(seg: Segment) {
    const doNavigate = (app: 'google_maps' | 'waze') => {
      openNavigation(seg.dest_lat, seg.dest_lng, app);
    };

    if (navApp) {
      doNavigate(navApp);
      return;
    }

    Alert.alert(
      "App de navegação",
      "Qual app você prefere usar para navegar?",
      [
        {
          text: "Google Maps",
          onPress: async () => {
            doNavigate('google_maps');
            await saveNavApp('google_maps');
            Alert.alert("Dica", "Para alterar o app de navegação, acesse Perfil → Preferências Padrão.");
          },
        },
        {
          text: "Waze",
          onPress: async () => {
            doNavigate('waze');
            await saveNavApp('waze');
            Alert.alert("Dica", "Para alterar o app de navegação, acesse Perfil → Preferências Padrão.");
          },
        },
        { text: "Cancelar", style: "cancel" },
      ]
    );
  }

  async function saveNavApp(app: 'google_maps' | 'waze') {
    setNavApp(app);
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("user_preferences")
      .update({ default_navigation_app: app })
      .eq("user_id", user.id);
  }

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
    const intermediateSegs = segs.slice(0, -1);
    if (intermediateSegs.length === 0) return;

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data: favData } = authUser
      ? await supabase.from("favorites").select("place_id").eq("user_id", authUser.id)
      : { data: null };
    const favSet = new Set((favData ?? []).map((f: any) => f.place_id));

    const BATCH = 8;
    for (let i = 0; i < intermediateSegs.length; i += BATCH) {
      await Promise.allSettled(
        intermediateSegs.slice(i, i + BATCH).map(async (seg) => {
          const { results } = await fetchStopSuggestions(seg.dest_lat, seg.dest_lng);
          if (results.length === 0) return;

          // Prefer favorited station; otherwise pick highest-rated (already sorted desc)
          const favorited = results.find((s) => favSet.has(s.place_id));
          const selectedId = (favorited ?? results[0]).place_id;

          await supabase.from("stop_suggestions").delete().eq("segment_id", seg.id);
          await supabase.from("stop_suggestions").insert(
            results.map((s) => ({
              segment_id: seg.id,
              place_id: s.place_id,
              name: s.name,
              rating: s.rating,
              total_ratings: s.total_ratings,
              is_24h: s.is_24h,
              latitude: s.latitude,
              longitude: s.longitude,
              is_selected: s.place_id === selectedId,
            }))
          );
        })
      );
    }
  }

  async function confirmDeleteTrip() {
    if (!trip) return;
    setDeleting(true);
    const supabase = getSupabase();
    await supabase.from("trips").delete().eq("id", trip.id);
    setDeleting(false);
    setShowDeleteConfirm(false);
    router.replace("/");
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
    const [{ data: alts }, { data: seg }] = await Promise.all([
      supabase.from("stop_suggestions").select("*").eq("segment_id", segId).order("rating", { ascending: false }),
      supabase.from("segments").select("origin_lat,origin_lng,distance_km").eq("id", segId).single(),
    ]);
    if (!alts || alts.length === 0 || !seg) return;
    setAltDeltas(new Map());
    setStopModal({
      segId,
      alternatives: alts as StopAlternative[],
      originLat: Number(seg.origin_lat),
      originLng: Number(seg.origin_lng),
      currentKm: Number(seg.distance_km),
    });
    loadStopDeltas(alts as StopAlternative[], Number(seg.origin_lat), Number(seg.origin_lng), Number(seg.distance_km));
  }

  async function loadStopDeltas(alts: StopAlternative[], originLat: number, originLng: number, currentKm: number) {
    setLoadingDeltas(true);
    const results = await Promise.all(
      alts.map(async (alt) => {
        try {
          const res = await fetch(
            `/api/directions-simple?origin_lat=${originLat}&origin_lng=${originLng}&dest_lat=${alt.latitude}&dest_lng=${alt.longitude}`
          );
          if (!res.ok) return { placeId: alt.place_id, delta: null };
          const { distance_km } = await res.json();
          return { placeId: alt.place_id, delta: Number(distance_km) - currentKm };
        } catch {
          return { placeId: alt.place_id, delta: null };
        }
      })
    );
    const map = new Map<string, number | null>(results.map((r) => [r.placeId, r.delta]));
    setAltDeltas(map);
    setLoadingDeltas(false);
  }

  async function openPhotoGallery(alt: StopAlternative) {
    setPhotoGallery({ name: alt.name, photos: [], loading: true });
    try {
      const res = await fetch(`/api/places-photos?place_id=${encodeURIComponent(alt.place_id)}`, { cache: "no-store" });
      const { photos } = await res.json();
      setPhotoGallery({ name: alt.name, photos: photos ?? [], loading: false });
    } catch {
      setPhotoGallery({ name: alt.name, photos: [], loading: false });
    }
  }

  async function selectStopAlternative(segId: string, placeId: string) {
    setSelectingStop(placeId);
    const supabase = getSupabase();
    try {
      // 1. Mark the chosen alternative as selected
      await supabase.from("stop_suggestions").update({ is_selected: false }).eq("segment_id", segId);
      await supabase.from("stop_suggestions").update({ is_selected: true }).eq("segment_id", segId).eq("place_id", placeId);

      // 2. Get current segment + chosen alternative coords
      const alt = stopModal?.alternatives.find((a) => a.place_id === placeId);
      const { data: seg } = await supabase
        .from("segments")
        .select("origin_lat,origin_lng,dest_lat,dest_lng,order_index,day_index,trip_id")
        .eq("id", segId)
        .single();

      if (alt && seg) {
        // 3. Recalculate current segment: origin → new stop
        const [r1] = await Promise.all([
          fetch(`/api/directions-simple?origin_lat=${seg.origin_lat}&origin_lng=${seg.origin_lng}&dest_lat=${alt.latitude}&dest_lng=${alt.longitude}`).then((r) => r.json()),
        ]);
        if (r1.distance_km != null) {
          await supabase
            .from("segments")
            .update({ dest_lat: alt.latitude, dest_lng: alt.longitude, distance_km: r1.distance_km, duration_minutes: r1.duration_min })
            .eq("id", segId);
        }

        // 4. Find next segment and recalculate it: new stop → its destination
        const { data: nextSeg } = await supabase
          .from("segments")
          .select("id,dest_lat,dest_lng")
          .eq("trip_id", seg.trip_id)
          .eq("day_index", seg.day_index)
          .eq("order_index", (seg.order_index as number) + 1)
          .maybeSingle();

        if (nextSeg) {
          const r2 = await fetch(
            `/api/directions-simple?origin_lat=${alt.latitude}&origin_lng=${alt.longitude}&dest_lat=${nextSeg.dest_lat}&dest_lng=${nextSeg.dest_lng}`
          ).then((r) => r.json());
          if (r2.distance_km != null) {
            await supabase
              .from("segments")
              .update({ origin_lat: alt.latitude, origin_lng: alt.longitude, distance_km: r2.distance_km, duration_minutes: r2.duration_min })
              .eq("id", nextSeg.id);
          }
        }

        // 5. Update trip totals cache
        const { data: allSegs } = await supabase
          .from("segments")
          .select("distance_km,duration_minutes")
          .eq("trip_id", seg.trip_id);
        if (allSegs) {
          const totalKm = allSegs.reduce((s, r) => s + Number(r.distance_km), 0);
          const totalMin = allSegs.reduce((s, r) => s + Number(r.duration_minutes), 0);
          await supabase.from("trips").update({ total_distance_km: totalKm, total_duration_min: totalMin }).eq("id", seg.trip_id);
        }
      }

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

  async function selectForPreview(result: GeoResult) {
    if (!addWpModal || !trip) return;
    const { segIndex, segment: splitSeg } = addWpModal;
    setAddWpModal(null);
    setWpQuery("");
    setWpResults([]);
    setWpPending({ result, segIndex, splitSeg });
    setWpImpact(null);
    setWpPreviewLoading(true);

    try {
      // Obter distâncias dos dois sub-trechos via API
      const previewRes = await fetch("/api/insert-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          originLat: splitSeg.origin_lat,
          originLng: splitSeg.origin_lng,
          destLat: splitSeg.dest_lat,
          destLng: splitSeg.dest_lng,
          pointLat: result.lat,
          pointLng: result.lng,
          originalKm: splitSeg.distance_km,
          originalMin: splitSeg.duration_minutes,
        }),
      });
      const { segAKm, segAMin, segBKm, segBMin, deltaKm, deltaMin } = await previewRes.json();

      // Desvio apenas para mensagem de aviso — não determina mais o fluxo
      const deviationKm = perpendicularDistanceKm(
        result.lat, result.lng,
        splitSeg.origin_lat!, splitSeg.origin_lng!,
        splitSeg.dest_lat!, splitSeg.dest_lng!,
      );

      const maxKm = trip.max_stop_km ?? 200;
      const minKm = trip.min_stop_km ?? 100;

      type NewSeg = {
        originName: string; destName: string; km: number; min: number;
        originLat?: number | null; originLng?: number | null;
        destLat?: number | null; destLng?: number | null;
      };

      // Se um sub-trecho exceder max_stop_km, subdividi-lo via generateSegments
      async function maybeSubdivide(
        originName: string, destName: string, km: number, min: number,
        oLat?: number | null, oLng?: number | null,
        dLat?: number | null, dLng?: number | null,
      ): Promise<NewSeg[]> {
        if (km <= maxKm) return [{ originName, destName, km, min, originLat: oLat, originLng: oLng, destLat: dLat, destLng: dLng }];
        const sub = await generateSegments(originName, destName, minKm, maxKm, 1);
        return sub.segments.map((s) => ({
          originName: s.origin_name,
          destName: s.destination_name,
          km: s.distance_km,
          min: s.duration_minutes,
          originLat: s.origin_lat,
          originLng: s.origin_lng,
          destLat: s.dest_lat,
          destLng: s.dest_lng,
        }));
      }

      const [subA, subB] = await Promise.all([
        maybeSubdivide(
          splitSeg.origin_name ?? "", result.name, segAKm, segAMin,
          splitSeg.origin_lat, splitSeg.origin_lng, result.lat, result.lng,
        ),
        maybeSubdivide(
          result.name, splitSeg.destination_name ?? "", segBKm, segBMin,
          result.lat, result.lng, splitSeg.dest_lat, splitSeg.dest_lng,
        ),
      ]);

      setWpImpact({
        deviationKm,
        deltaKm,
        deltaMin,
        newSegments: [...subA, ...subB],
      });
    } catch (e: any) {
      Alert.alert("Erro ao calcular impacto", e.message ?? "Tente novamente.");
      setWpPending(null);
    } finally {
      setWpPreviewLoading(false);
    }
  }

  async function executeInsert() {
    if (!wpPending || !wpImpact || !trip) return;
    setWpExecuting(true);
    const supabase = getSupabase();
    const { splitSeg } = wpPending;
    const newSegs = wpImpact.newSegments;
    const origOrderIndex = splitSeg.order_index ?? 0;
    const origDayIndex = splitSeg.day_index ?? 1;
    const origIsLastOfDay = splitSeg.is_last_of_day;
    const maxKm = trip.max_stop_km ?? 200;
    const minKm = trip.min_stop_km ?? 100;

    try {
      // 1. Shift order_index of segments after split to open space for new segments
      const laterSegs = segments.filter((s) => (s.order_index ?? 0) > origOrderIndex);
      await Promise.all(
        laterSegs.map((s) =>
          supabase.from("segments")
            .update({ order_index: (s.order_index ?? 0) + newSegs.length - 1 })
            .eq("id", s.id)
        )
      );

      // 2. Delete the original segment
      await supabase.from("segments").delete().eq("id", splitSeg.id);

      // 3. Insert all new segments
      const toInsert = newSegs.map((s, i) => {
        const isLast = i === newSegs.length - 1;
        const alerts: string[] = [];
        if (s.km > maxKm) alerts.push("trecho_longo");
        if (s.km < minKm && !isLast) alerts.push("trecho_curto");
        return {
          trip_id: id,
          order_index: origOrderIndex + i,
          day_index: origDayIndex,
          is_last_of_day: isLast ? origIsLastOfDay : false,
          origin_name: s.originName,
          destination_name: s.destName,
          distance_km: s.km,
          duration_minutes: s.min,
          route_summary: null as null,
          has_alert: alerts.length > 0,
          alert_types: alerts.length > 0 ? alerts : null as null,
          origin_lat: s.originLat ?? null,
          origin_lng: s.originLng ?? null,
          dest_lat: s.destLat ?? null,
          dest_lng: s.destLng ?? null,
        };
      });

      const { data: inserted } = await supabase.from("segments").insert(toInsert).select("*");

      // 4. Fetch fresh full segment list for accurate stop/weather fetching
      const { data: freshAllSegs } = await supabase
        .from("segments").select("*").eq("trip_id", id).order("order_index", { ascending: true });

      // 5. Update trip totals
      const totalKm = Math.round((freshAllSegs ?? []).reduce((acc, s) => acc + (s.distance_km ?? 0), 0));
      const totalMin = (freshAllSegs ?? []).reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0);
      await supabase.from("trips").update({
        total_distance_km: totalKm,
        total_duration_min: totalMin,
        stop_count: Math.max(0, (freshAllSegs ?? []).length - 1),
      }).eq("id", id);

      // 6. Fetch postos e clima usando lista completa (fetchStops usa slice(0,-1) internamente)
      if (freshAllSegs && freshAllSegs.length > 0) {
        await fetchStops(freshAllSegs as any);
        if (trip && isWeatherAvailable(trip.departure_date)) {
          await fetchWeather(freshAllSegs as any, trip.departure_date);
          // fetchWeather já chama load() internamente
        } else {
          await load();
        }
      } else {
        await load();
      }

      setWpPending(null);
      setWpImpact(null);
    } catch (e: any) {
      Alert.alert("Erro ao inserir parada", e.message ?? "Tente novamente.");
    } finally {
      setWpExecuting(false);
    }
  }

  async function openMergeModal(segA: Segment, segB: Segment) {
    setMergeModal({ segA, segB });
    setMergePreview(null);
    if (!segA.origin_lat || !segA.origin_lng || !segB.dest_lat || !segB.dest_lng) return;
    try {
      const res = await fetch(
        `/api/directions-simple?origin_lat=${segA.origin_lat}&origin_lng=${segA.origin_lng}&dest_lat=${segB.dest_lat}&dest_lng=${segB.dest_lng}`
      );
      const { distance_km, duration_min } = await res.json();
      setMergePreview({
        mergedKm: distance_km,
        mergedMin: duration_min,
        deltaKm: distance_km - ((segA.distance_km ?? 0) + (segB.distance_km ?? 0)),
        deltaMin: duration_min - ((segA.duration_minutes ?? 0) + (segB.duration_minutes ?? 0)),
      });
    } catch {
      setMergePreview(null);
    }
  }

  async function executeMerge() {
    if (!mergeModal || !mergePreview || !trip) return;
    const { segA, segB } = mergeModal;
    setMergeExecuting(true);
    try {
      const supabase = getSupabase();
      const mergedKm = mergePreview.mergedKm;
      const alerts = mergedKm > trip.max_stop_km ? ["trecho_longo"] : [];

      await supabase.from("segments").insert({
        trip_id: id,
        order_index: segA.order_index,
        day_index: segA.day_index,
        is_last_of_day: segB.is_last_of_day,
        origin_name: segA.origin_name,
        destination_name: segB.destination_name,
        distance_km: mergedKm,
        duration_minutes: mergePreview.mergedMin,
        has_alert: alerts.length > 0,
        alert_types: alerts.length > 0 ? alerts : null,
        origin_lat: segA.origin_lat,
        origin_lng: segA.origin_lng,
        dest_lat: segB.dest_lat,
        dest_lng: segB.dest_lng,
      });

      await supabase.from("segments").delete().in("id", [segA.id, segB.id]);

      const laterSegs = segments.filter((s) => (s.order_index ?? 0) > (segB.order_index ?? 0));
      await Promise.all(
        laterSegs.map((s) =>
          supabase.from("segments").update({ order_index: (s.order_index ?? 0) - 1 }).eq("id", s.id)
        )
      );

      const { data: freshAllSegs } = await supabase
        .from("segments").select("*").eq("trip_id", id).order("order_index", { ascending: true });
      const totalKm = Math.round((freshAllSegs ?? []).reduce((a, s) => a + (s.distance_km ?? 0), 0));
      const totalMin = (freshAllSegs ?? []).reduce((a, s) => a + (s.duration_minutes ?? 0), 0);
      await supabase.from("trips").update({
        total_distance_km: totalKm,
        total_duration_min: totalMin,
        stop_count: Math.max(0, (freshAllSegs ?? []).length - 1),
      }).eq("id", id);

      if (freshAllSegs && freshAllSegs.length > 0) {
        await fetchStops(freshAllSegs as any);
        if (isWeatherAvailable(trip.departure_date)) {
          await fetchWeather(freshAllSegs as any, trip.departure_date);
        } else {
          await load();
        }
      } else {
        await load();
      }
    } catch (e: any) {
      Alert.alert("Erro ao remover parada", e.message ?? "Tente novamente.");
    } finally {
      setMergeExecuting(false);
      setMergeModal(null);
      setMergePreview(null);
    }
  }

  async function deleteWaypoint(wpId: string) {
    const supabase = getSupabase();
    await supabase.from("waypoints").delete().eq("id", wpId);
    setRemoveWpConfirm(null);
    const { data: remaining } = await supabase
      .from("waypoints")
      .select("id, name, latitude, longitude, order_index")
      .eq("trip_id", id)
      .order("order_index", { ascending: true });
    const remainingRows = remaining ?? [];
    setWaypoints(remainingRows.map((w) => ({
      id: w.id,
      name: w.name,
      latitude: Number(w.latitude),
      longitude: Number(w.longitude),
      order_index: w.order_index,
    })));
    const remainingWps: ManualWaypoint[] = remainingRows.map((w) => ({
      name: w.name,
      lat: Number(w.latitude),
      lng: Number(w.longitude),
    }));
    await calcularRota(remainingWps);
    await load();
  }

  async function calcularRota(overrideWaypoints?: ManualWaypoint[], tripOverride?: typeof trip) {
    const activeTripVal = tripOverride ?? trip;
    if (!activeTripVal) return;
    setCalculating(true);
    try {
      const manualWps: ManualWaypoint[] = overrideWaypoints ?? waypoints.map((w) => ({
        name: w.name,
        lat: w.latitude,
        lng: w.longitude,
      }));
      const result = await generateSegments(
        activeTripVal.origin,
        activeTripVal.destination,
        activeTripVal.min_stop_km,
        activeTripVal.max_stop_km,
        activeTripVal.num_days,
        manualWps.length > 0 ? manualWps : undefined,
        activeTripVal.trip_type
      );

      if (result.avg_daily_km && result.avg_daily_km > 500) {
        const isExtremo = (result.avg_daily_km ?? 0) > 650;
        Alert.alert(
          isExtremo ? "Expedição muito puxada" : "Ritmo intenso",
          `Esta expedição terá média de ${result.avg_daily_km} km por dia. Para uma viagem de moto, considere adicionar mais dias ou revisar o ritmo.`,
          [{ text: "Entendi" }]
        );
      }

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

      const { data: freshSegs } = await supabase
        .from("segments")
        .select("*")
        .eq("trip_id", id)
        .order("order_index", { ascending: true });
      if (freshSegs && freshSegs.length > 0) {
        await Promise.all([
          fetchWeather(freshSegs, activeTripVal.departure_date),
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

  const weatherAvailable = trip ? isWeatherAvailable(trip.departure_date) : false;
  const hasWeatherData = segments.some((s) => s.weather_condition != null);
  const anyStale = hasWeatherData && segments.some((s) => isWeatherStale(s.weather_updated_at ?? null));
  const hasWeatherAlert = trip?.has_weather_alert ?? false;

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
        <TouchableOpacity onPress={() => router.replace("/")}>
          <Text style={styles.link}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Pre-compute departure times per segment (D10)
  const segmentTimes = new Map<string, string>();
  const baseTime = (trip.departure_time as string | null) ?? "07:00";
  const maxDay = segments.length > 0 ? Math.max(...segments.map((s) => s.day_index ?? 1)) : 1;
  for (let d = 1; d <= maxDay; d++) {
    const daySegs = segments.filter((s) => (s.day_index ?? 1) === d);
    let t = baseTime;
    daySegs.forEach((seg, i) => {
      segmentTimes.set(seg.id, t);
      if (i < daySegs.length - 1) {
        t = addMinutesToTime(t, seg.duration_minutes);
      }
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.replace("/")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {trip.title}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {anyStale && (
        <View style={styles.staleBanner}>
          <Text style={styles.staleBannerText}>
            Clima desatualizado — toque em "Atualizar Clima" para renovar
          </Text>
        </View>
      )}

      {activeView === "map" && trip && (
        <TripMap
          tripId={id}
          tripOrigin={trip.origin}
          tripDestination={trip.destination}
          onSwitchToList={() => setActiveView("list")}
        />
      )}

      {activeView === "list" && (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Summary card */}
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
              {trip.stop_count != null && (
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{trip.stop_count}</Text>
                  <Text style={styles.statLabel}>Paradas</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Lista / Mapa toggle (D4) */}
        {segments.length > 0 && (
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, activeView === "list" && styles.toggleBtnActive]}
              onPress={() => setActiveView("list")}
            >
              <Text style={activeView === "list" ? styles.toggleBtnActiveText : styles.toggleBtnText}>📋 Lista</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, activeView === "map" && styles.toggleBtnActive]}
              onPress={() => setActiveView("map")}
            >
              <Text style={activeView === "map" ? styles.toggleBtnActiveText : styles.toggleBtnText}>🗺️ Mapa</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Global weather alert banner (D6) */}
        {hasWeatherAlert && segments.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertBannerIcon}>⚠️</Text>
            <Text style={styles.alertBannerText}>
              Alertas climáticos em{" "}
              {segments
                .filter((s) =>
                  (s.alert_types as string[] | null)?.some(
                    (a) => a.startsWith("chuva") || a.startsWith("vento")
                  )
                )
                .map((s) => `Dia ${s.day_index}`)
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .join(", ")}
            </Text>
          </View>
        )}

        {/* Segments grouped by day (D1) */}
        {segments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Rota ainda não calculada.</Text>
            <Text style={styles.emptyHint}>
              Toque em "Calcular Rota" para buscar os segmentos via Google Maps.
            </Text>
          </View>
        ) : (
          Array.from({ length: maxDay }, (_, i) => i + 1).map((dayIdx) => {
            const daySegs = segments.filter((s) => (s.day_index ?? 1) === dayIdx);
            if (daySegs.length === 0) return null;

            const firstSeg = daySegs[0];
            const lastSeg = daySegs[daySegs.length - 1];
            const dayTotalKm = daySegs.reduce((sum, s) => sum + s.distance_km, 0);
            const dayDate = segmentDate(trip.departure_date, dayIdx);

            return (
              <View key={dayIdx} style={styles.dayCard}>
                <DayHeader
                  dayIndex={dayIdx}
                  date={dayDate}
                  originName={firstSeg.origin_name ?? ""}
                  destinName={lastSeg.destination_name ?? ""}
                  totalKm={dayTotalKm}
                />
                {/* day alert banner — shown when daily distance exceeds 500 km */}
                {dayTotalKm > 500 && (
                  <View style={styles.dayAlertBanner}>
                    <Text style={styles.dayAlertText}>
                      {dayTotalKm > 650
                        ? `⚠️ Dia intenso: ${Math.round(dayTotalKm)} km — acima do recomendado`
                        : `ℹ️ Dia puxado: ${Math.round(dayTotalKm)} km`}
                    </Text>
                  </View>
                )}
                <View style={styles.dayBody}>
                  {daySegs.map((seg, segIdx) => {
                    const globalIdx = segments.indexOf(seg);
                    const isLastSeg = globalIdx === segments.length - 1;
                    const showLodging = seg.is_last_of_day && dayIdx < maxDay;
                    const wpsAfter = waypoints.filter((w) => w.order_index === globalIdx);
                    const depTime = segmentTimes.get(seg.id) ?? baseTime;

                    return (
                      <View key={seg.id}>
                        <SegmentCard
                          seg={seg}
                          stop={stops.get(seg.id)}
                          departureDate={trip.departure_date}
                          departureTime={depTime}
                          onStopPress={() => openStopAlternatives(seg.id)}
                          onAddPress={() => {
                            setAddWpModal({ segIndex: globalIdx, segment: seg });
                            setWpQuery("");
                            setWpResults([]);
                          }}
                          onNavigatePress={() => handleNavigate(seg)}
                        />
                        {wpsAfter.length > 0 && (
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
                          </View>
                        )}
                        {segIdx < daySegs.length - 1 && (
                          <TouchableOpacity
                            style={styles.mergeStopBtn}
                            onPress={() => openMergeModal(seg, daySegs[segIdx + 1])}
                          >
                            <View style={styles.mergeStopLine} />
                            <Text style={styles.mergeStopText}>✕ Remover parada</Text>
                            <View style={styles.mergeStopLine} />
                          </TouchableOpacity>
                        )}
                        {showLodging && (
                          <>
                            {seg.alert_types?.includes("pernoite_sem_cidade") && (
                              <Text style={styles.pernoiteWarning}>
                                ⚠️ Fim de dia em ponto sem cidade confirmada — verifique o local de pernoite
                              </Text>
                            )}
                            {seg.alert_types?.includes("pernoite_ajustado") && (
                              <Text style={styles.pernoiteInfo}>
                                ℹ️ Dia ajustado para terminar em cidade com melhor estrutura
                              </Text>
                            )}
                            <LodgingBlock
                              tripId={id}
                              dayIndex={dayIdx}
                              departureDate={trip.departure_date}
                              destCity={seg.destination_name ?? seg.origin_name ?? ""}
                              lodgingItem={lodging.get(dayIdx)}
                              onReservedToggle={toggleReserved}
                              onSearchPress={() => openLodgingSearch(dayIdx, seg.destination_name ?? "")}
                            />
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}

        {/* Action buttons (D8) */}
        <TouchableOpacity
          style={[styles.btnCalc, (calculating || fetchingWeather) && { opacity: 0.6 }]}
          onPress={() => {
            if (segments.length === 0) { calcularRota(); return; }
            setShowRecalcConfirm(true);
          }}
          disabled={calculating || fetchingWeather}
        >
          {calculating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnCalcText}>
              {segments.length === 0 ? "Calcular Rota" : "↻ Recalcular Rota"}
            </Text>
          )}
        </TouchableOpacity>

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

        {segments.length > 0 && (trip.status === "planned" || trip.status === "saved") && (
          <View style={styles.btnRow}>
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
              style={[styles.btnStart, { flex: 1 }, (calculating || fetchingWeather) && { opacity: 0.5 }]}
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

        {trip.status !== "completed" && (
          <TouchableOpacity
            style={[styles.btnDelete, deleting && { opacity: 0.5 }]}
            onPress={() => setShowDeleteConfirm(true)}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnDeleteText}>Excluir viagem</Text>
            )}
          </TouchableOpacity>
        )}

        {segments.length > 0 && trip.max_stop_km != null && (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>REGRAS DA VIAGEM</Text>
            <Text style={styles.rulesLine}>
              Paradas: {trip.min_stop_km}–{trip.max_stop_km} km entre cada uma
            </Text>
          </View>
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
              {stopModal?.alternatives.map((alt) => {
                const delta = altDeltas.get(alt.place_id);
                const deltaLabel = loadingDeltas
                  ? "..."
                  : delta == null
                  ? ""
                  : delta === 0
                  ? "= mesmo km"
                  : delta > 0
                  ? `+${delta.toFixed(1)} km`
                  : `${delta.toFixed(1)} km`;
                const deltaColor = delta == null || delta === 0 ? "#888" : delta > 0 ? "#D97706" : "#16A34A";
                return (
                  <View key={alt.place_id} style={[styles.altRow, alt.is_selected && styles.altRowSelected]}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => selectStopAlternative(stopModal.segId, alt.place_id)}
                      disabled={selectingStop != null}
                    >
                      <Text style={[styles.altName, alt.is_selected && styles.altNameSelected]} numberOfLines={1}>
                        ⛽ {alt.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <Text style={styles.altMeta}>
                          {alt.rating != null ? `★${alt.rating}` : ""}
                          {alt.total_ratings != null ? ` (${alt.total_ratings})` : ""}
                          {alt.is_24h ? "  24h" : ""}
                        </Text>
                        {deltaLabel !== "" && (
                          <Text style={[styles.altDelta, { color: deltaColor }]}>{deltaLabel}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openPhotoGallery(alt)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.altPhotoBtn}
                    >
                      <Text style={styles.altPhotoBtnText}>📷</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleFavorite(alt)}
                      disabled={favSaving === alt.place_id}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4, marginRight: 4 }}
                    >
                      {favSaving === alt.place_id
                        ? <ActivityIndicator size="small" color="#C97826" />
                        : <Text style={{ fontSize: 18 }}>{favoriteIds.has(alt.place_id) ? "⭐" : "☆"}</Text>
                      }
                    </TouchableOpacity>
                    {selectingStop === alt.place_id ? (
                      <ActivityIndicator size="small" color="#C97826" />
                    ) : alt.is_selected ? (
                      <Text style={styles.altCheck}>✓</Text>
                    ) : null}
                  </View>
                );
              })}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setStopModal(null)}>
                <Text style={styles.modalCancelText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Photo gallery modal */}
        <Modal
          visible={photoGallery != null}
          transparent
          animationType="fade"
          onRequestClose={() => setPhotoGallery(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setPhotoGallery(null)}>
            <Pressable style={[styles.modalSheet, { paddingBottom: 28 }]} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle} numberOfLines={1}>📷 {photoGallery?.name}</Text>
              {photoGallery?.loading ? (
                <View style={styles.photoPlaceholder}>
                  <ActivityIndicator size="large" color="#C97826" />
                </View>
              ) : photoGallery?.photos.length === 0 ? (
                <View style={styles.photoPlaceholder}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🏪</Text>
                  <Text style={{ color: "#aaa", fontSize: 13 }}>Sem fotos disponíveis</Text>
                </View>
              ) : (
                <ScrollView ref={photoScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} style={styles.photoScroll}>
                  {photoGallery?.photos.map((uri, i) => (
                    <TouchableOpacity key={i} onPress={() => setExpandedPhoto(uri)} activeOpacity={0.85}>
                      <Image source={{ uri }} style={styles.photoImg} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity style={[styles.modalCancelBtn, { marginTop: 12 }]} onPress={() => setPhotoGallery(null)}>
                <Text style={styles.modalCancelText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Expanded photo fullscreen */}
        <Modal
          visible={expandedPhoto != null}
          transparent
          animationType="fade"
          onRequestClose={() => setExpandedPhoto(null)}
        >
          <Pressable style={styles.photoFullscreenOverlay} onPress={() => setExpandedPhoto(null)}>
            <Image source={{ uri: expandedPhoto ?? "" }} style={styles.photoFullscreenImg} resizeMode="contain" />
            <TouchableOpacity style={styles.photoFullscreenClose} onPress={() => setExpandedPhoto(null)}>
              <Text style={styles.photoFullscreenCloseText}>✕</Text>
            </TouchableOpacity>
          </Pressable>
        </Modal>

        {/* Delete confirmation modal */}
        <Modal
          visible={showDeleteConfirm}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteConfirm(false)}
        >
          <Pressable style={styles.deleteOverlay} onPress={() => !deleting && setShowDeleteConfirm(false)}>
            <Pressable style={styles.deleteSheet} onPress={() => {}}>
              <Text style={styles.deleteTitle}>Excluir viagem</Text>
              <Text style={styles.deleteMsg}>
                Tem certeza que deseja excluir "{trip?.title}"? Esta ação não pode ser desfeita.
              </Text>
              <View style={styles.deleteActions}>
                <TouchableOpacity
                  style={styles.deleteCancelBtn}
                  onPress={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                >
                  <Text style={styles.deleteCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteConfirmBtn, deleting && { opacity: 0.5 }]}
                  onPress={confirmDeleteTrip}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.deleteConfirmText}>Excluir</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Merge segments modal */}
        <Modal
          visible={mergeModal != null}
          transparent
          animationType="fade"
          onRequestClose={() => { if (!mergeExecuting) { setMergeModal(null); setMergePreview(null); } }}
        >
          <Pressable style={styles.deleteOverlay} onPress={() => { if (!mergeExecuting) { setMergeModal(null); setMergePreview(null); } }}>
            <Pressable style={styles.deleteSheet} onPress={() => {}}>
              <Text style={styles.deleteTitle}>
                Remover parada: {mergeModal?.segA.destination_name}
              </Text>

              {mergePreview === null ? (
                <View style={{ paddingVertical: 24, alignItems: "center" }}>
                  <ActivityIndicator color="#C97826" />
                  <Text style={{ fontSize: 12, color: "#999", marginTop: 8 }}>Calculando rota...</Text>
                </View>
              ) : (
                <>
                  {/* Before */}
                  <View style={{ gap: 4, marginBottom: 12 }}>
                    <View style={styles.mergeRow}>
                      <Text style={styles.mergeRowLabel} numberOfLines={1}>
                        {mergeModal?.segA.origin_name} → {mergeModal?.segA.destination_name}
                      </Text>
                      <Text style={styles.mergeRowMeta}>
                        {Math.round(mergeModal?.segA.distance_km ?? 0)}km · {fmtDuration(mergeModal?.segA.duration_minutes ?? 0)}
                      </Text>
                    </View>
                    <View style={styles.mergeRow}>
                      <Text style={styles.mergeRowLabel} numberOfLines={1}>
                        {mergeModal?.segB.origin_name} → {mergeModal?.segB.destination_name}
                      </Text>
                      <Text style={styles.mergeRowMeta}>
                        {Math.round(mergeModal?.segB.distance_km ?? 0)}km · {fmtDuration(mergeModal?.segB.duration_minutes ?? 0)}
                      </Text>
                    </View>
                  </View>

                  {/* Arrow */}
                  <Text style={{ textAlign: "center", color: "#C97826", fontSize: 16, marginBottom: 10 }}>↓ Resultado</Text>

                  {/* After */}
                  <View style={[styles.mergeRow, { backgroundColor: "#FEF3E2", borderRadius: 8, padding: 10, marginBottom: 10 }]}>
                    <Text style={[styles.mergeRowLabel, { color: "#C97826", fontWeight: "700" }]} numberOfLines={1}>
                      {mergeModal?.segA.origin_name} → {mergeModal?.segB.destination_name}
                    </Text>
                    <Text style={[styles.mergeRowMeta, { color: "#C97826" }]}>
                      {Math.round(mergePreview.mergedKm)}km · {fmtDuration(mergePreview.mergedMin)}
                    </Text>
                  </View>

                  {/* Delta */}
                  <Text style={{ fontSize: 11, color: "#999", marginBottom: 10, textAlign: "center" }}>
                    {mergePreview.deltaKm > 0 ? `+${Math.round(mergePreview.deltaKm)}` : Math.round(mergePreview.deltaKm)}km ·{" "}
                    {mergePreview.deltaMin > 0 ? `+${mergePreview.deltaMin}` : mergePreview.deltaMin}min em relação ao total atual
                  </Text>

                  {/* Warning or hint */}
                  {mergeModal && mergePreview.mergedKm > (trip?.max_stop_km ?? 200) ? (
                    <Text style={{ fontSize: 12, color: "#D97706", backgroundColor: "#FEF9C3", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                      ⚠ O trecho resultante ({Math.round(mergePreview.mergedKm)}km) excede o máximo configurado ({trip?.max_stop_km}km).
                      Você poderá dividir este trecho adicionando paradas manualmente.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: "#aaa", marginBottom: 10, textAlign: "center" }}>
                      Você poderá adicionar paradas neste trecho manualmente se necessário.
                    </Text>
                  )}
                </>
              )}

              <View style={styles.deleteActions}>
                <TouchableOpacity
                  style={styles.deleteCancelBtn}
                  onPress={() => { setMergeModal(null); setMergePreview(null); }}
                  disabled={mergeExecuting}
                >
                  <Text style={styles.deleteCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteConfirmBtn, (!mergePreview || mergeExecuting) && { opacity: 0.5 }]}
                  onPress={executeMerge}
                  disabled={!mergePreview || mergeExecuting}
                >
                  {mergeExecuting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.deleteConfirmText}>Remover Parada</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Recalculate confirmation modal */}
        <Modal
          visible={showRecalcConfirm}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRecalcConfirm(false)}
        >
          <Pressable style={styles.deleteOverlay} onPress={() => setShowRecalcConfirm(false)}>
            <Pressable style={styles.deleteSheet} onPress={() => {}}>
              <Text style={styles.deleteTitle}>Recalcular Rota</Text>
              <Text style={styles.deleteMsg}>
                Todas as edições manuais (paradas inseridas, subdivisões) serão substituídas pela rota gerada automaticamente. Deseja continuar?
              </Text>
              <View style={styles.deleteActions}>
                <TouchableOpacity
                  style={styles.deleteCancelBtn}
                  onPress={() => setShowRecalcConfirm(false)}
                >
                  <Text style={styles.deleteCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteConfirmBtn}
                  onPress={() => { setShowRecalcConfirm(false); calcularRota(); }}
                >
                  <Text style={styles.deleteConfirmText}>Recalcular</Text>
                </TouchableOpacity>
              </View>
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
                  style={styles.altRow}
                  onPress={() => selectForPreview(r)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.altName} numberOfLines={1}>📍 {r.name}</Text>
                    <Text style={styles.altMeta} numberOfLines={1}>{r.address}</Text>
                  </View>
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

        {/* Stop insertion impact preview modal — Phase 4 */}
        <Modal
          visible={wpPending != null}
          transparent
          animationType="fade"
          onRequestClose={() => { setWpPending(null); setWpImpact(null); }}
        >
          <Pressable style={styles.modalOverlay} onPress={() => { setWpPending(null); setWpImpact(null); }}>
            <Pressable style={[styles.modalSheet, { paddingBottom: 24 }]} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Confirmar inserção</Text>

              {wpPending && (
                <View style={styles.wpImpactPointRow}>
                  <Text style={styles.altName}>📍 {wpPending.result.name}</Text>
                  <Text style={styles.altMeta} numberOfLines={1}>{wpPending.result.address}</Text>
                </View>
              )}

              {wpPreviewLoading && (
                <View style={styles.wpImpactLoading}>
                  <ActivityIndicator color="#C97826" />
                  <Text style={styles.wpImpactLoadingText}>Calculando impacto na rota…</Text>
                </View>
              )}

              {!wpPreviewLoading && wpImpact && (
                <View style={styles.wpImpactBox}>
                  {wpImpact.deviationKm > 50 && (
                    <View style={[styles.wpImpactTypeBadge, { backgroundColor: "#FEF3C7" }]}>
                      <Text style={[styles.wpImpactTypeBadgeText, { color: "#92400E" }]}>
                        ⚠ Esta parada está fora do corredor atual. Serão adicionados +{Math.round(wpImpact.deltaKm)} km ao roteiro. Verifique se é isso que deseja.
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.wpImpactDetail, { marginBottom: 6 }]}>
                    {wpImpact.newSegments.length} trecho{wpImpact.newSegments.length !== 1 ? "s" : ""} serão criados neste segmento:
                  </Text>
                  {wpImpact.newSegments.map((s, i) => (
                    <View key={i} style={styles.wpNewSegRow}>
                      <Text style={styles.wpNewSegText} numberOfLines={1}>
                        {s.originName} → {s.destName}
                      </Text>
                      <Text style={styles.wpNewSegMeta}>{fmtKm(s.km)} · {fmtDuration(s.min)}</Text>
                    </View>
                  ))}

                  <View style={[styles.wpImpactDeltaRow, { marginTop: 12 }]}>
                    <View style={styles.wpImpactDelta}>
                      <Text style={styles.wpImpactDeltaVal}>
                        {wpImpact.deltaKm >= 0 ? "+" : ""}{fmtKm(Math.abs(wpImpact.deltaKm))}
                      </Text>
                      <Text style={styles.wpImpactDeltaLabel}>distância total</Text>
                    </View>
                    <View style={styles.wpImpactDelta}>
                      <Text style={styles.wpImpactDeltaVal}>
                        {wpImpact.deltaMin >= 0 ? "+" : ""}{fmtDuration(Math.abs(wpImpact.deltaMin))}
                      </Text>
                      <Text style={styles.wpImpactDeltaLabel}>duração total</Text>
                    </View>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.btnCalc, { marginTop: 16, marginHorizontal: 0 }, (wpPreviewLoading || wpExecuting) && { opacity: 0.5 }]}
                onPress={executeInsert}
                disabled={wpPreviewLoading || wpExecuting || !wpImpact}
              >
                {wpExecuting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnCalcText}>Confirmar inserção</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setWpPending(null); setWpImpact(null); }}
                disabled={wpExecuting}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" },
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
  topBarTitle: { fontSize: 17, fontWeight: "700", color: "#fff", flex: 1, textAlign: "center" },
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
  statsRow: { flexDirection: "row", gap: 24 },
  stat: { alignItems: "center" },
  statVal: { fontSize: 17, fontWeight: "700", color: "#C97826" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 2 },

  // Lista/Mapa toggle (D4)
  viewToggle: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
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

  // Global alert banner (D6)
  alertBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#FEE2E2",
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    borderRadius: 10,
    padding: 10,
  },
  alertBannerIcon: { fontSize: 14 },
  alertBannerText: { flex: 1, fontSize: 13, color: "#1A1A1A", lineHeight: 18 },

  // Day card (D1)
  dayCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dayAlertBanner: {
    backgroundColor: "#FFF3CD",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  dayAlertText: {
    fontSize: 12,
    color: "#7A5400",
    fontWeight: "500",
  },
  pernoiteWarning: {
    fontSize: 12,
    color: "#B45309",
    backgroundColor: "#FFF3CD",
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontWeight: "500",
  },
  pernoiteInfo: {
    fontSize: 12,
    color: "#1D4ED8",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dayHeader: {
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayBadge: {
    backgroundColor: "#C97826",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  dayBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  dayRoute: { fontSize: 13, fontWeight: "700", color: "#fff" },
  dayDate: { fontSize: 10, color: "#aaa", marginTop: 1 },
  dayKm: { fontSize: 13, fontWeight: "700", color: "#C97826" },
  dayBody: { backgroundColor: "#fff" },

  // Segment card (D2, D3, D11)
  segCard: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  segCardAlert: { borderLeftWidth: 3, borderLeftColor: "#EF4444" },
  segBody: { flexDirection: "row", alignItems: "stretch" },
  segContent: { flex: 1, padding: 11 },
  segTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 5 },
  segRoute: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1A1A1A", marginRight: 8 },
  segTopRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  segTime: { fontSize: 11, color: "#888" },
  addWpInCardBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#C97826",
    alignItems: "center", justifyContent: "center",
  },
  addWpInCardBtnText: { fontSize: 13, color: "#fff", fontWeight: "700", lineHeight: 15 },
  segSummary: { fontSize: 11, color: "#aaa", marginBottom: 5 },
  segBadges: { flexDirection: "row", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 6 },
  badgeKm: { backgroundColor: "#F0F0F0", borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  badgeKmText: { fontSize: 11, fontWeight: "700", color: "#555" },
  badgeTime: { backgroundColor: "#E8F4FF", borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTimeText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  segDayEndLabel: { fontSize: 10, color: "#C97826", fontWeight: "700" },

  // Fuel stop suggestion (D5)
  segStopCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  segStopIcon: { fontSize: 14 },
  segStopName: { fontSize: 12, fontWeight: "600", color: "#1A1A1A" },
  segStopMeta: { fontSize: 10, color: "#888", marginTop: 1 },
  segStopLowRating: { fontSize: 10, color: "#C97826", marginTop: 2, fontWeight: "600" },
  segStopAlt: { fontSize: 11, fontWeight: "700", color: "#2563EB", flexShrink: 0 },
  navigateBtn: {
    marginTop: 10, backgroundColor: "#C97826", borderRadius: 10,
    paddingVertical: 8, alignItems: "center",
  },
  navigateBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Weather panel — right side (D2, D7)
  weatherPanel: {
    width: 76,
    flexShrink: 0,
    backgroundColor: "#F9F9F9",
    borderLeftWidth: 1,
    borderLeftColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 2,
  },
  weatherPanelTemp: { fontSize: 18, fontWeight: "700", color: "#1A1A1A", lineHeight: 22, marginTop: 4 },
  weatherPanelSub: { fontSize: 9, color: "#999", lineHeight: 14, textAlign: "center" },
  weatherStale: { fontSize: 9, color: "#D97706", marginTop: 2 },
  weatherLocked: { fontSize: 10, color: "#aaa", textAlign: "center", marginTop: 4 },
  weatherCountdown: {
    backgroundColor: "#E8E8E8",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 3,
  },
  weatherCountdownText: { fontSize: 11, fontWeight: "700", color: "#888" },

  // Alert chips — bottom strip (D3)
  segAlerts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  alertChip: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  alertChipText: { fontSize: 11, fontWeight: "600" },

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

  // Action buttons (D8)
  btnCalc: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnCalcText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnWeather: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#C97826",
  },
  btnWeatherText: { color: "#C97826", fontSize: 14, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 8 },
  btnSave: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#D0D0D0",
  },
  btnSaveText: { color: "#555", fontSize: 14, fontWeight: "700" },
  btnStart: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#C97826",
  },
  btnStartText: { color: "#C97826", fontSize: 15, fontWeight: "800" },
  btnContinue: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 18,
    alignItems: "center",
  },
  btnContinueText: { color: "#fff", fontSize: 17, fontWeight: "800" },

  rulesCard: {
    backgroundColor: "#FEF3E2",
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
  },
  rulesTitle: { fontSize: 10, fontWeight: "700", color: "#C97826", letterSpacing: 0.8, marginBottom: 4 },
  rulesLine: { fontSize: 13, color: "#7C4A00" },

  notFound: { fontSize: 16, color: "#555", marginBottom: 12 },
  link: { color: "#C97826", fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: "#DDD",
    alignSelf: "center", marginBottom: 16,
  },
  modalTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A", marginBottom: 14 },
  altRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F0F0F0", gap: 10,
  },
  altRowSelected: {
    backgroundColor: "#FEF3E2", borderRadius: 10,
    paddingHorizontal: 10, marginHorizontal: -10, borderBottomColor: "transparent",
  },
  altName: { fontSize: 14, fontWeight: "600", color: "#1A1A1A" },
  altNameSelected: { color: "#C97826" },
  altMeta: { fontSize: 12, color: "#888" },
  altDelta: { fontSize: 12, fontWeight: "700" },
  altPhotoBtn: { padding: 6, marginRight: 2 },
  altPhotoBtnText: { fontSize: 18 },
  altCheck: { fontSize: 18, color: "#C97826", fontWeight: "700" },
  photoScroll: { marginVertical: 8 },
  photoImg: { width: 240, height: 160, borderRadius: 10, marginRight: 10 },
  photoPlaceholder: { height: 160, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5", borderRadius: 10, marginVertical: 8 },
  photoFullscreenOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.93)", justifyContent: "center", alignItems: "center" },
  photoFullscreenImg: { width: "100%", height: "80%" },
  photoFullscreenClose: { position: "absolute", top: 48, right: 20, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  photoFullscreenCloseText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  btnDelete: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DC2626",
    backgroundColor: "transparent",
    alignItems: "center",
  },
  btnDeleteText: { color: "#DC2626", fontSize: 15, fontWeight: "600" },
  deleteOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  deleteSheet: { backgroundColor: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 400 },
  deleteTitle: { fontSize: 17, fontWeight: "700", color: "#1A1A1A", marginBottom: 10 },
  deleteMsg: { fontSize: 14, color: "#555", lineHeight: 20, marginBottom: 24 },
  deleteActions: { flexDirection: "row", gap: 12 },
  deleteCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: "#CCC", alignItems: "center" },
  deleteCancelText: { fontSize: 15, color: "#555", fontWeight: "600" },
  deleteConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: "#DC2626", alignItems: "center" },
  deleteConfirmText: { fontSize: 15, color: "#fff", fontWeight: "700" },
  modalCancelBtn: {
    marginTop: 18, paddingVertical: 14, alignItems: "center",
    borderRadius: 12, backgroundColor: "#F5F5F5",
  },
  modalCancelText: { fontSize: 15, color: "#555", fontWeight: "600" },

  lodgingEmpty: {
    borderWidth: 1.5, borderColor: "#D0D0D0", borderStyle: "dashed",
    borderRadius: 14, margin: 10, paddingVertical: 18, paddingHorizontal: 16,
    alignItems: "center", backgroundColor: "#FAFAFA",
  },
  lodgingEmptyIcon: { fontSize: 22, marginBottom: 6 },
  lodgingEmptyText: { fontSize: 14, fontWeight: "700", color: "#555", marginBottom: 2 },
  lodgingEmptyHint: { fontSize: 12, color: "#aaa" },
  lodgingCard: { margin: 10, borderRadius: 12, padding: 14 },
  lodgingRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  lodgingDayLabel: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 0.8, marginBottom: 4 },
  lodgingName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  lodgingMeta: { flexDirection: "row", gap: 10, marginTop: 4, flexWrap: "wrap" },
  lodgingMetaText: { fontSize: 12, color: "rgba(255,255,255,0.75)" },
  reservedBadge: {
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start",
  },
  reservedBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  lodgingActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  lodgingActionBtn: {
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  lodgingActionSecondary: { backgroundColor: "rgba(255,255,255,0.10)" },
  lodgingActionText: { fontSize: 12, color: "#fff", fontWeight: "600" },
  lodgingChangeText: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginLeft: 4 },

  // Waypoints (D9)
  wpDivider: { marginHorizontal: 10, marginVertical: 4, gap: 5 },
  wpTag: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#EFF6FF", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "#BFDBFE", gap: 6, alignSelf: "flex-start",
  },
  wpTagText: { fontSize: 13, color: "#1E40AF", fontWeight: "600" },
  wpTagRemove: { fontSize: 16, color: "#93C5FD", fontWeight: "700" },
  addWpBtn: {
    alignSelf: "center", paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: "#D0D0D0",
    borderStyle: "dashed", backgroundColor: "#fff",
  },
  addWpBtnText: { fontSize: 12, color: "#888" },
  wpSearchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  wpSearchInput: {
    flex: 1, height: 42, borderRadius: 10, backgroundColor: "#F5F5F5",
    paddingHorizontal: 12, fontSize: 14, color: "#1A1A1A",
    borderWidth: 1, borderColor: "#E0E0E0",
  },
  wpSearchBtn: {
    backgroundColor: "#C97826", borderRadius: 10,
    paddingHorizontal: 14, height: 42, justifyContent: "center",
  },
  wpSearchBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  wpRemoveConfirm: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#FEE2E2", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: "#FCA5A5", gap: 8, alignSelf: "flex-start",
  },
  wpRemoveConfirmText: { fontSize: 13, color: "#991B1B", fontWeight: "600", flex: 1 },
  wpRemoveCancel: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D0D0",
  },
  wpRemoveCancelText: { fontSize: 12, color: "#555", fontWeight: "600" },
  wpRemoveConfirmBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: "#EF4444",
  },
  wpRemoveConfirmBtnText: { fontSize: 12, color: "#fff", fontWeight: "700" },

  // Merge segments button (between cards)
  mergeStopBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 8,
  },
  mergeStopLine: { flex: 1, height: 1, backgroundColor: "#E8E8E8" },
  mergeStopText: { fontSize: 11, color: "#bbb", fontWeight: "500" as const },

  // Merge modal rows
  mergeRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  mergeRowLabel: { flex: 1, fontSize: 13, color: "#444" },
  mergeRowMeta: { fontSize: 12, color: "#888", flexShrink: 0 },

  // Stop insertion impact preview modal
  wpImpactPointRow: { marginBottom: 12 },
  wpImpactLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 20 },
  wpImpactLoadingText: { fontSize: 13, color: "#888" },
  wpImpactBox: { backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, gap: 10 },
  wpImpactTypeBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  wpImpactTypeBadgeText: { fontSize: 12, fontWeight: "700" },
  wpImpactDetail: { fontSize: 13, color: "#444", lineHeight: 20 },
  wpImpactDeltaRow: { flexDirection: "row", gap: 24, marginTop: 4 },
  wpImpactDelta: { alignItems: "center" },
  wpImpactDeltaVal: { fontSize: 18, fontWeight: "700", color: "#C97826" },
  wpImpactDeltaLabel: { fontSize: 11, color: "#888", marginTop: 2 },
  wpNewSegRow: {
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F0F0F0",
  },
  wpNewSegText: { fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  wpNewSegMeta: { fontSize: 11, color: "#888", marginTop: 2 },
});
