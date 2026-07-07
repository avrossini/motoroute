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
import { calcularRoleRemoto } from "@/services/roleService";
import { calcularExpedicaoRemota } from "@/services/expedicaoService";
import type { Trecho } from "@/domain/route/types";
import { useIsDesktopWeb } from "@/hooks/useIsDesktopWeb";
import { useBoardColumns } from "@/hooks/useBoardColumns";
import DayBoard from "@/components/DayBoard";
import {
  fetchSegmentWeather,
  isWeatherAvailable,
  daysUntilForecast,
  segmentDate,
  isWeatherStale,
} from "@/services/weatherService";
import {
  fetchStopSuggestions,
  fetchPlacesSearch,
  type StopSuggestion,
  type StopSuggestionsResult,
} from "@/services/placesService";
import type { Database } from "@/types/database";
import TripMap from "@/components/TripMap";
import StopAltMap from "@/components/StopAltMap";

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
  day_index?: number | null; // Expedição: dia de deslocamento em que a parada cai (bucketing)
}

interface GeoResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  // Preenchidos pela busca Places da inserção manual (posto/POI). place_id fixa a escolha.
  place_id?: string;
  types?: string[];
  rating?: number | null;
  total_ratings?: number | null;
  is_24h?: boolean | null;
}

type Trip = Database["public"]["Tables"]["trips"]["Row"];
type Segment = Database["public"]["Tables"]["segments"]["Row"];
type TripDay = Database["public"]["Tables"]["trip_days"]["Row"];

const RAIN_ALERT_THRESHOLD = 40;
const WIND_ALERT_KMH = 50;

const ALERT_LABELS: Record<string, string> = {
  trecho_longo: "Trecho longo",
  trecho_curto: "Trecho curto",
  chuva_forte: "Chuva provável",
  vento_forte: "Vento forte",
  // Alertas de DIA da Expedição (motor dividirEmDias) — informativos, não bloqueiam.
  dia_puxado: "Dia puxado",
  dia_extremo: "Dia intenso",
  sem_cidade: "Fim de dia sem cidade",
};

const ALERT_CHIP_BG: Record<string, string> = {
  chuva_forte: "#EBF4FF",
  vento_forte: "#FFF3E0",
  trecho_longo: "#FEF3C7",
  trecho_curto: "#FEF3C7",
  dia_puxado: "#FEF3C7",
  dia_extremo: "#FEE2E2",
  sem_cidade: "#FEF3C7",
};
const ALERT_CHIP_COLOR: Record<string, string> = {
  chuva_forte: "#1565C0",
  vento_forte: "#E65100",
  trecho_longo: "#B45309",
  trecho_curto: "#B45309",
  dia_puxado: "#B45309",
  dia_extremo: "#EF4444",
  sem_cidade: "#B45309",
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

// Versão compacta do clima (1 linha) usada no board de Expedição, onde a coluna é
// estreita demais para o painel lateral de 76px. Mantém os 3 estados do WeatherPanel.
function WeatherLine({ seg, departureDate }: { seg: Segment; departureDate: string }) {
  const segDate = segmentDate(departureDate, seg.day_index ?? 1);

  if (!isWeatherAvailable(segDate)) {
    return (
      <Text style={styles.weatherLine} numberOfLines={1}>
        🔒 Prev. em {daysUntilForecast(segDate)}d
      </Text>
    );
  }
  if (!seg.weather_condition) {
    return (
      <Text style={[styles.weatherLine, { color: "#9a9a9a" }]} numberOfLines={1}>
        — sem previsão
      </Text>
    );
  }
  return (
    <Text style={styles.weatherLine} numberOfLines={1}>
      {weatherIcon(seg.weather_condition)} {seg.weather_temp_max != null ? `${seg.weather_temp_max}°` : "—"}
      {"  ·  "}🌧 {seg.weather_rain_pct ?? 0}%{"  ·  "}💨 {seg.weather_wind_kmh ?? 0}km/h
    </Text>
  );
}

function DayHeader({
  label,
  date,
  originName,
  destinName,
  totalKm,
  onEditCity,
  onToggleRest,
}: {
  label: string | null; // "DIA 1" | "IDA" | "VOLTA" | null (sem badge, ex.: Rolê só ida)
  date: string;
  originName: string;
  destinName: string;
  totalKm: number;
  onEditCity?: () => void; // Expedição: trocar a cidade de pernoite do dia
  onToggleRest?: () => void; // Expedição: marcar o dia como "parado"
}) {
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  });
  return (
    <View style={styles.dayHeader}>
      <View style={{ flex: 1 }}>
        {label && (
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeText}>{label}</Text>
          </View>
        )}
        <Text style={styles.dayRoute} numberOfLines={1}>
          {originName} → {destinName}
        </Text>
        <Text style={styles.dayDate}>{dateLabel}</Text>
      </View>
      <View style={styles.dayHeaderRight}>
        <Text style={styles.dayKm}>{Math.round(totalKm)}km</Text>
        {onEditCity && (
          <TouchableOpacity onPress={onEditCity} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.editCityBtn}>✎ cidade</Text>
          </TouchableOpacity>
        )}
        {onToggleRest && (
          <TouchableOpacity onPress={onToggleRest} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.editCityBtn}>🛌 parar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SegmentCard({
  seg,
  stop,
  showDayEnd = true,
  departureDate,
  departureTime,
  onStopPress,
  onAddPress,
  onNavigatePress,
  compact = false,
}: {
  seg: Segment;
  stop?: StopSuggestion;
  showDayEnd?: boolean; // false no Rolê (day_trip) — "Fim Dia" não faz sentido
  departureDate: string;
  departureTime: string;
  onStopPress?: () => void;
  onAddPress?: () => void;
  onNavigatePress?: () => void;
  compact?: boolean; // board de Expedição: clima em 1 linha, sem painel lateral de 76px
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
            {seg.is_last_of_day && showDayEnd && (
              <Text style={styles.segDayEndLabel}>Fim Dia {seg.day_index}</Text>
            )}
          </View>
          {compact && <WeatherLine seg={seg} departureDate={departureDate} />}
          {seg.stop_kind === "poi" ? (
            // POI: card dividido — esquerda o ponto de interesse (sem ⇄), direita o posto
            // vizinho (com ⇄ p/ trocar de posto, igual aos demais).
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={[styles.segStopCard, { flex: 1 }]}>
                <Text style={styles.segStopIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.segStopName} numberOfLines={1}>{seg.destination_name}</Text>
                  <Text style={styles.segStopMeta}>Ponto de interesse</Text>
                </View>
              </View>
              {stop && (
                <TouchableOpacity
                  style={[styles.segStopCard, { flex: 1 }]}
                  onPress={onStopPress}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Trocar posto"
                >
                  <Text style={styles.segStopIcon}>⛽</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.segStopName} numberOfLines={1}>{stop.name}</Text>
                    <Text style={styles.segStopMeta}>
                      {stop.rating != null ? `★${stop.rating}` : "Sem avaliação"}
                      {stop.is_24h ? "  24h" : ""}
                    </Text>
                  </View>
                  <Text style={styles.segStopAlt}>⇄</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : stop ? (
            // Posto (manual 'fuel' ou automático null): ⇄ p/ trocar de posto em ambos.
            <TouchableOpacity
              style={styles.segStopCard}
              onPress={onStopPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Trocar posto"
            >
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
              <Text style={styles.segStopAlt}>⇄</Text>
            </TouchableOpacity>
          ) : null}
          {onNavigatePress && (
            <TouchableOpacity style={styles.navigateBtn} onPress={onNavigatePress}>
              <Text style={styles.navigateBtnText}>Navegar →</Text>
            </TouchableOpacity>
          )}
        </View>
        {!compact && <WeatherPanel seg={seg} departureDate={departureDate} />}
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

// Linha rótulo→valor do sheet "Sobre esta viagem"
function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowKey}>{k}</Text>
      <Text style={styles.infoRowVal} numberOfLines={2}>{v}</Text>
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
  const isDesktop = useIsDesktopWeb();
  const board = useBoardColumns();
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchingWeather, setFetchingWeather] = useState(false);
  const [stops, setStops] = useState<Map<string, StopSuggestion>>(new Map());
  const [lodging, setLodging] = useState<Map<number, LodgingSuggestion>>(new Map());
  const [tripDays, setTripDays] = useState<Map<number, TripDay>>(new Map());
  const [generatingDay, setGeneratingDay] = useState<number | null>(null);
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
  const [editCityModal, setEditCityModal] = useState<{ dayIndex: number; currentCity: string } | null>(null);
  const [savingCity, setSavingCity] = useState(false);
  const [togglingRest, setTogglingRest] = useState<number | null>(null);
  const [addParadaModal, setAddParadaModal] = useState(false);
  const [savingParada, setSavingParada] = useState(false);
  const [wpQuery, setWpQuery] = useState("");
  const [wpMode, setWpMode] = useState<"fuel" | "poi">("fuel"); // inserção manual: ⛽ posto ou 📍 POI
  const [wpResults, setWpResults] = useState<GeoResult[]>([]);
  const [wpSearching, setWpSearching] = useState(false);
  const [wpSaving, setWpSaving] = useState(false);
  // Compartilhamento (Fase 1): enviar convite por e-mail + "Sobre esta viagem"
  const [shareModal, setShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareSending, setShareSending] = useState(false);
  // feedback inline (Alert é no-op no web) — sucesso/erro do compartilhamento
  const [shareResult, setShareResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [infoSheet, setInfoSheet] = useState<{
    creatorName: string; creatorAvatar: string | null; sharedByName: string | null;
  } | null>(null);
  const [wpPending, setWpPending] = useState<{ result: GeoResult; segIndex: number; splitSeg: (typeof segments)[0] } | null>(null);
  const [wpImpact, setWpImpact] = useState<{
    deviationKm: number;
    deltaKm: number;
    deltaMin: number;
    newSegments: Array<{
      originName: string; destName: string; km: number; min: number;
      originLat?: number | null; originLng?: number | null;
      destLat?: number | null; destLng?: number | null;
      isArrival?: boolean;
      isChosenPoint?: boolean;
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
      .select("id, name, latitude, longitude, order_index, day_index")
      .eq("trip_id", id)
      .order("order_index", { ascending: true });
    setWaypoints((wpData ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      latitude: Number(w.latitude),
      longitude: Number(w.longitude),
      order_index: w.order_index,
      day_index: w.day_index,
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

    // Dias da Expedição (trip_days) — cidade de pernoite, dia parado, estado de geração.
    const { data: tripDaysData } = await supabase
      .from("trip_days")
      .select("*")
      .eq("trip_id", id)
      .order("day_index", { ascending: true });
    const tdMap = new Map<number, TripDay>();
    for (const td of tripDaysData ?? []) tdMap.set(td.day_index, td);
    setTripDays(tdMap);

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
      if (autoCalc === "true" && tripData) calcularRota(tripData);
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
            (a) =>
              a === "trecho_longo" ||
              a === "trecho_curto" ||
              a === "dia_puxado" ||
              a === "dia_extremo" ||
              a === "sem_cidade"
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
    // Numa ida-e-volta (day_trip) a chegada da IDA (destino da viagem) é um trecho de
    // chegada, sem posto — igual ao motor. slice(0,-1) tira só a chegada da VOLTA (o
    // último); a virada precisa ser filtrada à parte para não pendurar um ⛽ indevido.
    const isTurnaround = (seg: Segment) =>
      trip?.trip_type === "day_trip" && !!trip?.round_trip && seg.destination_name === trip.destination;
    // stop_kind 'fuel' = posto exato fixado pelo usuário na inserção manual: nunca re-buscar
    // (senão o snap-por-rating troca o posto escolhido). 'poi' e null (automático) seguem
    // ganhando o posto vizinho normalmente.
    const intermediateSegs = segs
      .slice(0, -1)
      .filter((seg) => !isTurnaround(seg) && seg.stop_kind !== "fuel");
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

  // day_trip (Rolê): o motor já escolheu o posto de cada trecho. Grava o escolhido
  // como selecionado e popula as alternativas em volta (não-selecionadas) — §472.
  async function attachRolePostos(segs: Segment[], trechos: Trecho[]) {
    const supabase = getSupabase();
    const intermediate = segs.slice(0, -1); // o último trecho (chegada) não tem posto
    const BATCH = 8;
    for (let i = 0; i < intermediate.length; i += BATCH) {
      await Promise.allSettled(
        intermediate.slice(i, i + BATCH).map(async (seg, bi) => {
          // Guard dentro do map (não filtrar o array) p/ preservar o alinhamento com trechos[i+bi].
          if (seg.stop_kind === "fuel") return; // posto exato fixado — não re-buscar
          const chosen = trechos[i + bi]?.posto ?? null;
          const { results } = await fetchStopSuggestions(seg.dest_lat, seg.dest_lng);
          await supabase.from("stop_suggestions").delete().eq("segment_id", seg.id);
          const rows: any[] = [];
          if (chosen) {
            rows.push({
              segment_id: seg.id,
              place_id: chosen.placeId,
              name: chosen.nome,
              rating: chosen.rating,
              total_ratings: chosen.totalRatings,
              is_24h: chosen.is24h,
              latitude: chosen.lat,
              longitude: chosen.lng,
              is_selected: true,
            });
          }
          for (const r of results) {
            if (chosen && r.place_id === chosen.placeId) continue; // dedup o escolhido
            rows.push({
              segment_id: seg.id,
              place_id: r.place_id,
              name: r.name,
              rating: r.rating,
              total_ratings: r.total_ratings,
              is_24h: r.is_24h,
              latitude: r.latitude,
              longitude: r.longitude,
              is_selected: false,
            });
          }
          if (rows.length > 0) await supabase.from("stop_suggestions").insert(rows);
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

  // Compartilhar: cria um convite pending + notificação para o destinatário (fork no aceite).
  // A RPC nunca vaza se o e-mail existe → resposta é sempre "convite enviado".
  async function submitShare() {
    const email = shareEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setShareResult({ ok: false, text: "Informe um e-mail válido." });
      return;
    }
    setShareResult(null);
    setShareSending(true);
    const { error } = await getSupabase().rpc("share_trip", { p_trip_id: id, p_recipient_email: email });
    setShareSending(false);
    if (error) {
      setShareResult({ ok: false, text: "Não foi possível compartilhar. Tente novamente." });
      return;
    }
    setShareEmail("");
    setShareResult({
      ok: true,
      text: "Convite enviado! Se o e-mail for de um piloto do MotoRoute, ele decide se aceita uma cópia.",
    });
  }

  // "Sobre esta viagem": resolve o perfil do autor original (created_by) e de quem
  // compartilhou (shared_by). profiles é legível por qualquer autenticado (sem e-mail).
  async function openInfoSheet() {
    if (!trip) return;
    const ids = [trip.created_by, trip.shared_by].filter(Boolean) as string[];
    let creatorName = "—";
    let creatorAvatar: string | null = null;
    let sharedByName: string | null = null;
    if (ids.length > 0) {
      const { data: profs } = await getSupabase()
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      if (trip.created_by) {
        const c = byId.get(trip.created_by);
        creatorName = c?.display_name ?? "—";
        creatorAvatar = c?.avatar_url ?? null;
      }
      if (trip.shared_by) sharedByName = byId.get(trip.shared_by)?.display_name ?? null;
    }
    setInfoSheet({ creatorName, creatorAvatar, sharedByName });
  }

  async function startTrip() {
    if (!trip) return;
    // Expedição: não iniciar com dias de deslocamento ainda em esqueleto — a tela de
    // viagem ativa é 1:1 por segmento e mostraria o placeholder do dia como uma perna
    // única e gigante, sem postos. Dias parados não têm segmento e são ignorados aqui.
    if (trip.trip_type !== "day_trip") {
      const pendente = [...tripDays.values()].some((td) => !td.is_rest_day && !td.segments_generated);
      if (pendente) {
        Alert.alert(
          "Gere os trechos primeiro",
          "Antes de iniciar a viagem, gere os trechos de todos os dias de deslocamento da expedição."
        );
        return;
      }
    }
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
        .select("origin_lat,origin_lng,dest_lat,dest_lng,order_index,day_index,trip_id,stop_kind")
        .eq("id", segId)
        .single();

      // Num POI o posto é só a sugestão vizinha: trocar apenas re-seleciona (não move o POI).
      // Nos demais (manual 'fuel' e automático) o posto É o destino → reposiciona o trecho.
      if (alt && seg && seg.stop_kind !== "poi") {
        // 3. Recalculate current segment: origin → new stop
        const [r1] = await Promise.all([
          fetch(`/api/directions-simple?origin_lat=${seg.origin_lat}&origin_lng=${seg.origin_lng}&dest_lat=${alt.latitude}&dest_lng=${alt.longitude}`).then((r) => r.json()),
        ]);
        if (r1.distance_km != null) {
          await supabase
            .from("segments")
            .update({ dest_lat: alt.latitude, dest_lng: alt.longitude, distance_km: r1.distance_km, duration_minutes: r1.duration_min, ...(seg.stop_kind === "fuel" ? { destination_name: alt.name } : {}) })
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
              .update({ origin_lat: alt.latitude, origin_lng: alt.longitude, distance_km: r2.distance_km, duration_minutes: r2.duration_min, ...(seg.stop_kind === "fuel" ? { origin_name: alt.name } : {}) })
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
    // Dia "sem cidade": não faz sentido buscar hospedagem pela string "Local a confirmar"
    // (o geocode não resolve). Pede para definir a cidade de pernoite primeiro.
    if (!destCity.trim() || destCity === "Local a confirmar") {
      Alert.alert("Cidade a confirmar", "Defina a cidade de pernoite deste dia (✎ cidade) antes de buscar hospedagem.");
      return;
    }
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
      // Busca Places filtrada pelo modo: ⛽ só postos, 📍 tudo menos postos.
      const results = await fetchPlacesSearch(query.trim(), wpMode);
      setWpResults(results);
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
        // Último sub-trecho da subdivisão (chegada ao waypoint/destino): o motor isenta
        // a chegada da regra de km mínimo, então não deve receber alerta "trecho_curto".
        isArrival?: boolean;
        // Marca o segmento cujo destino É o ponto escolhido pelo usuário (leva o stop_kind).
        isChosenPoint?: boolean;
      };

      // Se um sub-trecho exceder max_stop_km, subdividi-lo com o motor buscar-primeiro
      // (mesmo do Rolê) — postos reais, em vez do corte geométrico do motor antigo.
      async function maybeSubdivide(
        originName: string, destName: string, km: number, min: number,
        oLat?: number | null, oLng?: number | null,
        dLat?: number | null, dLng?: number | null,
      ): Promise<NewSeg[]> {
        if (km <= maxKm) return [{ originName, destName, km, min, originLat: oLat, originLng: oLng, destLat: dLat, destLng: dLng, isArrival: true }];
        const r = await calcularRoleRemoto({
          origem: { lat: Number(oLat), lng: Number(oLng), nome: originName },
          destino: { lat: Number(dLat), lng: Number(dLng), nome: destName },
          minStopKm: minKm, maxStopKm: maxKm, favoritos: [], idaEVolta: false,
        });
        return r.trechos.map((t, ti) => ({
          originName: t.origem.nome,
          destName: t.destino.nome,
          km: t.distanciaKm,
          min: t.duracaoMin,
          originLat: t.origem.lat,
          originLng: t.origem.lng,
          destLat: t.destino.lat,
          destLng: t.destino.lng,
          isArrival: ti === r.trechos.length - 1,
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

      // O ponto que o usuário escolheu é o destino do ÚLTIMO sub-trecho de subA (a "chegada").
      // É esse segmento que carrega o stop_kind (fuel/poi) e, no modo fuel, o posto pinado.
      if (subA.length > 0) subA[subA.length - 1].isChosenPoint = true;

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
        // isArrival (fim de subA = chegada ao waypoint, ou fim de subB = destino), não
        // isLast do array combinado — senão a chegada ao waypoint ganha "trecho_curto".
        if (s.km < minKm && !s.isArrival) alerts.push("trecho_curto");
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
          // O ponto escolhido leva o tipo do modo. O ÚLTIMO sub-trecho mantém o destino
          // original: se aquele destino já era um POI manual, herda 'poi' (senão inserir uma
          // parada ANTES de um POI rebaixaria o POI a posto automático). Demais: null.
          stop_kind: s.isChosenPoint
            ? (wpMode === "fuel" ? "fuel" : "poi")
            : (isLast && splitSeg.stop_kind === "poi" ? "poi" : null),
        };
      });

      const { data: inserted } = await supabase.from("segments").insert(toInsert).select("*");

      // Modo ⛽ Posto: o usuário escolheu um posto EXATO — pinar esse posto como a parada do
      // segmento (fetchStops pula stop_kind='fuel', preservando a escolha). No modo 📍 POI não
      // pinamos nada: o fetchStops abaixo anexa o posto vizinho ao POI (mesma regra de rating).
      const chosenResult = wpPending.result;
      const chosenPlaceId = wpMode === "fuel" ? chosenResult.place_id : undefined;
      if (chosenPlaceId) {
        const chosenIdx = newSegs.findIndex((s) => s.isChosenPoint);
        const chosenSeg = (inserted ?? []).find((seg) => seg.order_index === origOrderIndex + chosenIdx);
        if (chosenSeg) {
          // O posto exato escolhido fica selecionado; os vizinhos entram como alternativas
          // (não-selecionadas) para o botão de trocar posto (⇄) ter opções.
          const { results: nearby } = await fetchStopSuggestions(chosenResult.lat, chosenResult.lng);
          const rows = [
            {
              segment_id: chosenSeg.id,
              place_id: chosenPlaceId,
              name: chosenResult.name,
              rating: chosenResult.rating ?? null,
              total_ratings: chosenResult.total_ratings ?? null,
              is_24h: chosenResult.is_24h ?? null,
              latitude: chosenResult.lat,
              longitude: chosenResult.lng,
              is_selected: true,
            },
            ...nearby
              .filter((n) => n.place_id !== chosenPlaceId)
              .map((n) => ({
                segment_id: chosenSeg.id,
                place_id: n.place_id,
                name: n.name,
                rating: n.rating,
                total_ratings: n.total_ratings,
                is_24h: n.is_24h,
                latitude: n.latitude,
                longitude: n.longitude,
                is_selected: false,
              })),
          ];
          await supabase.from("stop_suggestions").insert(rows);
        }
      }

      // 4. Fetch fresh full segment list for accurate stop/weather fetching
      const { data: freshAllSegs } = await supabase
        .from("segments").select("*").eq("trip_id", id).order("order_index", { ascending: true });

      // 5. Update trip totals
      const totalKm = Math.round((freshAllSegs ?? []).reduce((acc, s) => acc + (s.distance_km ?? 0), 0));
      const totalMin = (freshAllSegs ?? []).reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0);
      await supabase.from("trips").update({
        total_distance_km: totalKm,
        total_duration_min: totalMin,
        stop_count: Math.max(0, (freshAllSegs ?? []).length - (trip.round_trip ? 2 : 1)),
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
        stop_count: Math.max(0, (freshAllSegs ?? []).length - (trip.round_trip ? 2 : 1)),
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
      .select("id, name, latitude, longitude, order_index, day_index")
      .eq("trip_id", id)
      .order("order_index", { ascending: true });
    const remainingRows = remaining ?? [];
    setWaypoints(remainingRows.map((w) => ({
      id: w.id,
      name: w.name,
      latitude: Number(w.latitude),
      longitude: Number(w.longitude),
      order_index: w.order_index,
      day_index: w.day_index,
    })));
    await calcularRota();
    await load();
  }

  // Re-esqueleta a Expedição de forma REST-DAY-AWARE: num_days = dias de calendário;
  // nDias do motor = dias de deslocamento (= num_days − parados). Divide entre os dias de
  // deslocamento e mapeia nos índices de calendário não-parados; dia parado herda a cidade
  // do dia de deslocamento anterior (sem segmentos). A rota passa pelas paradas obrigatórias
  // e o day_index de cada parada é gravado a partir do bucketing. Persiste tudo. Usada pelo
  // recálculo (calcularRota) e por toggleRestDay — fonte única da verdade.
  async function reesqueletarExpedicao(restSet: Set<number>, at: NonNullable<typeof trip>) {
    const supabase = getSupabase();
    const numDays = at.num_days ?? 1;
    const travelCal: number[] = [];
    for (let d = 1; d <= numDays; d++) if (!restSet.has(d)) travelCal.push(d);
    if (travelCal.length === 0) throw new Error("A expedição precisa de ao menos um dia de deslocamento.");

    const { data: wpRows } = await supabase
      .from("waypoints").select("id,name,latitude,longitude")
      .eq("trip_id", id).order("order_index", { ascending: true });
    const paradas = (wpRows ?? []).map((w) => ({ lat: Number(w.latitude), lng: Number(w.longitude), nome: w.name }));

    const result = await calcularExpedicaoRemota({
      origem: { lat: Number(at.origin_lat), lng: Number(at.origin_lng), nome: at.origin },
      destino: { lat: Number(at.dest_lat), lng: Number(at.dest_lng), nome: at.destination },
      nDias: travelCal.length,
      paradasObrigatorias: paradas.length ? paradas : undefined,
    });

    const segRows: any[] = [];
    const tdRows: any[] = [];
    const wpUpd: PromiseLike<unknown>[] = [];
    let lastCity = { nome: at.origin, lat: Number(at.origin_lat) as number | null, lng: Number(at.origin_lng) as number | null, placeId: null as string | null };
    let k = 0;
    for (let d = 1; d <= numDays; d++) {
      if (restSet.has(d)) {
        tdRows.push({ trip_id: id, day_index: d, is_rest_day: true, city_name: lastCity.nome, city_lat: lastCity.lat, city_lng: lastCity.lng, city_place_id: lastCity.placeId, km_dia: 0, duration_min: 0, alert_types: null, segments_generated: false });
      } else {
        const dia = result.dias[k];
        if (!dia) break; // motor devolveu menos dias que o pedido (raro) — para de mapear
        k++;
        segRows.push({ trip_id: id, order_index: d * 1000, day_index: d, is_last_of_day: true, origin_name: dia.origem.nome, destination_name: dia.destino.nome, origin_lat: dia.origem.lat, origin_lng: dia.origem.lng, dest_lat: dia.destino.lat, dest_lng: dia.destino.lng, distance_km: dia.kmDia, duration_minutes: dia.duracaoMin, route_summary: null, has_alert: dia.alertas.length > 0, alert_types: dia.alertas.length > 0 ? dia.alertas : null });
        tdRows.push({ trip_id: id, day_index: d, is_rest_day: false, city_name: dia.cidade?.nome ?? null, city_lat: dia.cidade?.lat ?? null, city_lng: dia.cidade?.lng ?? null, city_place_id: dia.cidade?.placeId ?? null, km_dia: dia.kmDia, duration_min: dia.duracaoMin, alert_types: dia.alertas.length > 0 ? dia.alertas : null, segments_generated: false });
        for (const p of dia.paradasObrigatorias ?? []) {
          const wp = (wpRows ?? []).find((w) => Math.abs(Number(w.latitude) - p.lat) < 1e-4 && Math.abs(Number(w.longitude) - p.lng) < 1e-4);
          if (wp) wpUpd.push(supabase.from("waypoints").update({ day_index: d }).eq("id", wp.id));
        }
        lastCity = { nome: dia.destino.nome, lat: dia.destino.lat, lng: dia.destino.lng, placeId: dia.cidade?.placeId ?? null };
      }
    }

    await supabase.from("segments").delete().eq("trip_id", id);
    await supabase.from("segments").insert(segRows);
    await supabase.from("trip_days").delete().eq("trip_id", id);
    await supabase.from("trip_days").insert(tdRows);
    if (wpUpd.length > 0) await Promise.all(wpUpd);
    await supabase.from("trips").update({ total_distance_km: result.totalKm, total_duration_min: result.totalMin, stop_count: 0 }).eq("id", id);

    // Reconcilia hospedagem: apaga reservas de dias cuja cidade de pernoite mudou no
    // re-esqueleto (senão o hotel reservado aparece sob a cidade errada).
    const cityByDay = new Map<number, string | null>();
    for (const td of tdRows) cityByDay.set(td.day_index as number, (td.city_name ?? null) as string | null);
    const { data: lodges } = await supabase.from("lodging_suggestions").select("id, day_index, city").eq("trip_id", id);
    const staleLodge = (lodges ?? []).filter((l) => (l.city ?? null) !== (cityByDay.get(l.day_index) ?? null)).map((l) => l.id);
    if (staleLodge.length > 0) await supabase.from("lodging_suggestions").delete().in("id", staleLodge);

    return { totalKm: result.totalKm, travelN: travelCal.length };
  }

  async function calcularRota(tripOverride?: typeof trip) {
    const activeTripVal = tripOverride ?? trip;
    if (!activeTripVal) return;
    // Guard na função (não só nos botões): recalcular apaga+recria todos os segments, o
    // que orfanizaria os check-ins de uma viagem em andamento. Funil de Recalcular e de
    // deleteWaypoint; adicionarParada já tem o próprio guard antes de chamar aqui.
    if (activeTripVal.status === "active") {
      Alert.alert("Viagem em andamento", "Não é possível recalcular a rota com a viagem já iniciada.");
      return;
    }
    setCalculating(true);
    try {
      const supabase = getSupabase();

      // Monta os segmentos: day_trip (Rolê) gera os trechos; multi_day (Expedição) gera
      // o esqueleto de dias (trechos sob demanda). Ambos no motor buscar-primeiro.
      let segRows: any[];
      let totals: { total_distance_km: number; total_duration_min: number; stop_count: number };
      let trechosRole: Trecho[] | null = null;

      if (activeTripVal.trip_type === "day_trip") {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const { data: favData } = authUser
          ? await supabase.from("favorites").select("place_id").eq("user_id", authUser.id)
          : { data: null };
        const favoritos = (favData ?? []).map((f) => f.place_id);

        const result = await calcularRoleRemoto({
          origem: { lat: Number(activeTripVal.origin_lat), lng: Number(activeTripVal.origin_lng), nome: activeTripVal.origin },
          destino: { lat: Number(activeTripVal.dest_lat), lng: Number(activeTripVal.dest_lng), nome: activeTripVal.destination },
          minStopKm: activeTripVal.min_stop_km,
          maxStopKm: activeTripVal.max_stop_km,
          favoritos,
          idaEVolta: !!activeTripVal.round_trip,
        });

        trechosRole = result.trechos;
        segRows = result.trechos.map((t, i) => ({
          trip_id: id,
          order_index: t.ordem,
          // Rolê é sempre 1 dia (ida e volta no MESMO dia) → day_index 1 para todos,
          // para data/horário/clima não somarem um dia na volta. A separação visual
          // Ida/Volta é feita no render (grupos), não pelo day_index.
          day_index: 1,
          is_last_of_day: i === result.trechos.length - 1,
          origin_name: t.origem.nome,
          destination_name: t.destino.nome,
          origin_lat: t.origem.lat,
          origin_lng: t.origem.lng,
          dest_lat: t.destino.lat,
          dest_lng: t.destino.lng,
          distance_km: t.distanciaKm,
          duration_minutes: t.duracaoMin,
          route_summary: t.rodovia,
          has_alert: t.alertas.length > 0,
          alert_types: t.alertas.length > 0 ? t.alertas : null,
        }));
        totals = {
          total_distance_km: result.totalKm,
          total_duration_min: result.totalMin,
          // Postos = trechos menos as chegadas (sem posto): 1 na só-ida, 2 na ida-e-volta
          // (chegada no destino + volta na origem).
          stop_count: Math.max(0, result.trechos.length - (activeTripVal.round_trip ? 2 : 1)),
        };
      } else {
        // Expedição (multi_day): re-esqueleta preservando os dias parados existentes
        // (rest-day-aware) e re-bucketa as paradas. Persiste dentro de reesqueletarExpedicao.
        const restSet = new Set<number>();
        for (const [d, td] of tripDays) if (td.is_rest_day) restSet.add(d);
        const { totalKm, travelN } = await reesqueletarExpedicao(restSet, activeTripVal);

        // Alerta de média diária (business-logic §59) — sobre os dias de DESLOCAMENTO.
        const avgDaily = travelN > 0 ? Math.round(totalKm / travelN) : 0;
        if (avgDaily > 500) {
          const isExtremo = avgDaily > 650;
          Alert.alert(
            isExtremo ? "Expedição muito puxada" : "Ritmo intenso",
            `Esta expedição terá média de ${avgDaily} km por dia. Para uma viagem de moto, considere adicionar mais dias ou revisar o ritmo.`,
            [{ text: "Entendi" }]
          );
        }

        await load();
        const { data: freshExpSegs } = await supabase
          .from("segments").select("*").eq("trip_id", id).order("order_index", { ascending: true });
        if (freshExpSegs && freshExpSegs.length > 0) {
          // Só clima — os postos vêm por dia sob demanda (gerarTrechosDia).
          await fetchWeather(freshExpSegs, activeTripVal.departure_date);
          await load();
        }
        return; // Expedição faz a própria persistência — pula a comum abaixo
      }

      // Persistência comum (day_trip):
      await supabase.from("segments").delete().eq("trip_id", id);
      await supabase.from("segments").insert(segRows);
      await supabase.from("trips").update(totals).eq("id", id);

      await load();

      const { data: freshSegs } = await supabase
        .from("segments")
        .select("*")
        .eq("trip_id", id)
        .order("order_index", { ascending: true });
      if (freshSegs && freshSegs.length > 0) {
        await Promise.all([
          fetchWeather(freshSegs, activeTripVal.departure_date),
          trechosRole ? attachRolePostos(freshSegs, trechosRole) : fetchStops(freshSegs),
        ]);
        await load();
      }
    } catch (e: any) {
      Alert.alert("Erro ao calcular rota", e.message ?? "Tente novamente.");
    } finally {
      setCalculating(false);
    }
  }

  // Expedição: materializa os trechos de UM dia sob demanda (Motor do Rolê, só ida,
  // origem = início do dia, destino = cidade de pernoite). Substitui o placeholder do
  // dia pelos trechos reais e grava os postos. Não mexe nos outros dias.
  async function gerarTrechosDia(dayIndex: number) {
    if (!trip) return;
    if (trip.status === "active") {
      Alert.alert("Viagem em andamento", "Não é possível gerar trechos com a viagem já iniciada.");
      return;
    }
    const daySeg = segments.find((s) => (s.day_index ?? 1) === dayIndex);
    if (!daySeg) return;
    setGeneratingDay(dayIndex);
    try {
      const supabase = getSupabase();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: favData } = authUser
        ? await supabase.from("favorites").select("place_id").eq("user_id", authUser.id)
        : { data: null };
      const favoritos = (favData ?? []).map((f) => f.place_id);

      // Paradas obrigatórias deste dia (bucketadas no esqueleto) — o Rolê crava só as do dia.
      const { data: wpDia } = await supabase
        .from("waypoints").select("name,latitude,longitude")
        .eq("trip_id", id).eq("day_index", dayIndex);
      const paradasDia = (wpDia ?? []).map((w) => ({ lat: Number(w.latitude), lng: Number(w.longitude), nome: w.name }));

      const result = await calcularRoleRemoto({
        origem: { lat: Number(daySeg.origin_lat), lng: Number(daySeg.origin_lng), nome: daySeg.origin_name ?? trip.origin },
        destino: { lat: Number(daySeg.dest_lat), lng: Number(daySeg.dest_lng), nome: daySeg.destination_name ?? trip.destination },
        minStopKm: trip.min_stop_km,
        maxStopKm: trip.max_stop_km,
        favoritos,
        idaEVolta: false,
        paradasObrigatorias: paradasDia.length ? paradasDia : undefined,
      });

      const novos = result.trechos.map((t, i) => ({
        trip_id: id,
        order_index: dayIndex * 1000 + i,
        day_index: dayIndex,
        is_last_of_day: i === result.trechos.length - 1,
        origin_name: t.origem.nome,
        destination_name: t.destino.nome,
        origin_lat: t.origem.lat,
        origin_lng: t.origem.lng,
        dest_lat: t.destino.lat,
        dest_lng: t.destino.lng,
        distance_km: t.distanciaKm,
        duration_minutes: t.duracaoMin,
        route_summary: t.rodovia,
        has_alert: t.alertas.length > 0,
        alert_types: t.alertas.length > 0 ? t.alertas : null,
      }));

      // Substitui os segmentos deste dia (o placeholder ou uma geração anterior).
      await supabase.from("segments").delete().eq("trip_id", id).eq("day_index", dayIndex);
      await supabase.from("segments").insert(novos);
      // Atualiza o cache de km/duração do dia com o total REAL dos trechos gerados (o
      // esqueleto guardava a estimativa cidade-a-cidade) — trip_days fica consistente.
      const diaKm = Math.round(novos.reduce((s, n) => s + (n.distance_km ?? 0), 0) * 10) / 10;
      const diaMin = novos.reduce((s, n) => s + (n.duration_minutes ?? 0), 0);
      await supabase.from("trip_days").update({ segments_generated: true, km_dia: diaKm, duration_min: diaMin }).eq("trip_id", id).eq("day_index", dayIndex);

      // Recalcula os totais da viagem a partir de TODOS os segmentos.
      const { data: allSegs } = await supabase
        .from("segments")
        .select("*")
        .eq("trip_id", id)
        .order("order_index", { ascending: true });
      const segs = allSegs ?? [];
      const nDays = segs.length > 0 ? new Set(segs.map((s) => s.day_index ?? 1)).size : (trip.num_days ?? 1);
      await supabase.from("trips").update({
        total_distance_km: Math.round(segs.reduce((s, x) => s + (x.distance_km ?? 0), 0)),
        total_duration_min: segs.reduce((s, x) => s + (x.duration_minutes ?? 0), 0),
        stop_count: Math.max(0, segs.length - nDays),
      }).eq("id", id);

      await load();

      // Postos + clima só nos trechos deste dia.
      const { data: diaSegs } = await supabase
        .from("segments")
        .select("*")
        .eq("trip_id", id)
        .eq("day_index", dayIndex)
        .order("order_index", { ascending: true });
      if (diaSegs && diaSegs.length > 0) {
        await Promise.all([
          attachRolePostos(diaSegs, result.trechos),
          fetchWeather(diaSegs, trip.departure_date),
        ]);
        await load();
      }
    } catch (e: any) {
      Alert.alert("Erro ao gerar trechos", e.message ?? "Tente novamente.");
    } finally {
      setGeneratingDay(null);
    }
  }

  // Expedição: troca a cidade de pernoite de um dia. Atualiza o dia D (destino) e o
  // dia D+1 (origem), reverte ambos a placeholder (trechos ficam obsoletos → regerar)
  // e recomputa os km via directions-simple. Não mexe nos outros dias.
  async function editarCidadeDia(geo: GeoResult) {
    if (!editCityModal || !trip) return;
    // Trocar a cidade apaga+recria os segments do dia (novos UUIDs) — orfanizaria os
    // check-ins numa viagem em andamento. Mesmo guard de gerar/parar/parada.
    if (trip.status === "active") {
      Alert.alert("Viagem em andamento", "Não é possível trocar a cidade de pernoite com a viagem já iniciada.");
      return;
    }
    const D = editCityModal.dayIndex;
    const cityPlaceId = (geo as any).place_id ?? null;
    setSavingCity(true);
    try {
      const supabase = getSupabase();
      const dir = (oLat: number, oLng: number, dLat: number, dLng: number) =>
        fetch(`/api/directions-simple?origin_lat=${oLat}&origin_lng=${oLng}&dest_lat=${dLat}&dest_lng=${dLng}`).then((r) => r.json());

      const dSegs = segments
        .filter((s) => (s.day_index ?? 1) === D)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      if (dSegs.length === 0) return;
      const origemD = {
        lat: Number(dSegs[0].origin_lat),
        lng: Number(dSegs[0].origin_lng),
        nome: dSegs[0].origin_name ?? trip.origin,
      };

      // Alerta de km/dia recomputado sobre a nova distância (mesmos limites do motor:
      // dia_puxado 500–650, dia_extremo >650). Mantém segment e trip_days consistentes.
      const alertaDoDia = (km: number): string[] => (km > 650 ? ["dia_extremo"] : km > 500 ? ["dia_puxado"] : []);

      // Dia D: origem do dia → nova cidade
      const r1 = await dir(origemD.lat, origemD.lng, geo.lat, geo.lng);
      const alertD = alertaDoDia(r1.distance_km ?? 0);
      await supabase.from("segments").delete().eq("trip_id", id).eq("day_index", D);
      await supabase.from("segments").insert([{
        trip_id: id, order_index: D * 1000, day_index: D, is_last_of_day: true,
        origin_name: origemD.nome, destination_name: geo.name,
        origin_lat: origemD.lat, origin_lng: origemD.lng, dest_lat: geo.lat, dest_lng: geo.lng,
        distance_km: r1.distance_km ?? 0, duration_minutes: r1.duration_min ?? 0,
        route_summary: null, has_alert: alertD.length > 0, alert_types: alertD.length ? alertD : null,
      }]);
      await supabase.from("trip_days").update({
        city_name: geo.name, city_lat: geo.lat, city_lng: geo.lng, city_place_id: cityPlaceId,
        km_dia: r1.distance_km ?? null, duration_min: r1.duration_min ?? null,
        alert_types: alertD.length ? alertD : null, segments_generated: false,
      }).eq("trip_id", id).eq("day_index", D);

      // Dias parados logo após D herdam a nova cidade; o próximo dia de DESLOCAMENTO
      // tem sua origem atualizada e o km recomputado.
      const numCal = trip.num_days ?? D;
      let nextTravel = D + 1;
      while (nextTravel <= numCal && tripDays.get(nextTravel)?.is_rest_day) {
        await supabase.from("trip_days").update({
          city_name: geo.name, city_lat: geo.lat, city_lng: geo.lng, city_place_id: cityPlaceId,
        }).eq("trip_id", id).eq("day_index", nextTravel);
        nextTravel++;
      }
      const ntSegs = segments
        .filter((s) => (s.day_index ?? 1) === nextTravel)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      if (ntSegs.length > 0) {
        const last = ntSegs[ntSegs.length - 1];
        const destNt = { lat: Number(last.dest_lat), lng: Number(last.dest_lng), nome: last.destination_name ?? trip.destination };
        const r2 = await dir(geo.lat, geo.lng, destNt.lat, destNt.lng);
        // D+1 segue "sem cidade" se seu destino ainda é o ponto a confirmar; preserva esse
        // alerta e recomputa o de km — segment e trip_days consistentes (não some o aviso).
        const semCidadeNt = destNt.nome === "Local a confirmar";
        const alertNt = [...alertaDoDia(r2.distance_km ?? 0), ...(semCidadeNt ? ["sem_cidade"] : [])];
        await supabase.from("segments").delete().eq("trip_id", id).eq("day_index", nextTravel);
        await supabase.from("segments").insert([{
          trip_id: id, order_index: nextTravel * 1000, day_index: nextTravel, is_last_of_day: true,
          origin_name: geo.name, destination_name: destNt.nome,
          origin_lat: geo.lat, origin_lng: geo.lng, dest_lat: destNt.lat, dest_lng: destNt.lng,
          distance_km: r2.distance_km ?? 0, duration_minutes: r2.duration_min ?? 0,
          route_summary: null, has_alert: alertNt.length > 0, alert_types: alertNt.length ? alertNt : null,
        }]);
        await supabase.from("trip_days").update({
          km_dia: r2.distance_km ?? null, duration_min: r2.duration_min ?? null,
          alert_types: alertNt.length ? alertNt : null, segments_generated: false,
        }).eq("trip_id", id).eq("day_index", nextTravel);
      }

      // Re-bucketa as paradas de D e D+1: a fronteira entre eles (a cidade de pernoite)
      // mudou, então uma parada pode ter trocado de dia. Compara a distância origemD→parada
      // com origemD→novaCidade (r1); antes da cidade = dia D, depois = próximo deslocamento.
      const paradasAfetadas = waypoints.filter((w) => w.day_index === D || w.day_index === nextTravel);
      for (const wp of paradasAfetadas) {
        const rp = await dir(origemD.lat, origemD.lng, wp.latitude, wp.longitude);
        const novoDia = (rp.distance_km ?? 0) <= (r1.distance_km ?? 0) ? D : nextTravel;
        if (novoDia !== wp.day_index) {
          await supabase.from("waypoints").update({ day_index: novoDia }).eq("id", wp.id);
        }
      }

      // Reconcilia hospedagem: a cidade de pernoite de D (e dos dias parados que a herdam)
      // mudou → apaga reservas antigas para não aparecerem sob a cidade errada.
      if (geo.name !== editCityModal.currentCity) {
        const diasCidadeMudou = [D];
        for (let x = D + 1; x < nextTravel; x++) diasCidadeMudou.push(x);
        await supabase.from("lodging_suggestions").delete().eq("trip_id", id).in("day_index", diasCidadeMudou);
      }

      // Totais
      const { data: allSegs } = await supabase.from("segments").select("distance_km,duration_minutes,day_index").eq("trip_id", id);
      if (allSegs) {
        const nd = allSegs.length > 0 ? new Set(allSegs.map((s) => s.day_index ?? 1)).size : (trip.num_days ?? 1);
        await supabase.from("trips").update({
          total_distance_km: Math.round(allSegs.reduce((s, r) => s + Number(r.distance_km), 0)),
          total_duration_min: allSegs.reduce((s, r) => s + Number(r.duration_minutes), 0),
          stop_count: Math.max(0, allSegs.length - nd),
        }).eq("id", id);
      }

      setEditCityModal(null);
      setWpQuery("");
      setWpResults([]);
      await load();
    } catch (e: any) {
      Alert.alert("Erro ao editar cidade", e.message ?? "Tente novamente.");
    } finally {
      setSavingCity(false);
    }
  }

  // Expedição: alterna um dia entre "deslocamento" e "parado". num_days = dias de
  // calendário; nDias do motor = dias de deslocamento (= num_days − parados). Re-esqueleta
  // (redistribui as cidades entre os dias de deslocamento; perde trechos gerados e edições
  // de cidade — é uma reestruturação da viagem). Dia parado herda a cidade do dia anterior.
  async function toggleRestDay(dayIndex: number) {
    if (!trip) return;
    if (trip.status === "active") {
      Alert.alert("Viagem em andamento", "Não é possível reestruturar os dias com a viagem já iniciada.");
      return;
    }
    if (dayIndex === 1) {
      Alert.alert("Dia 1", "O primeiro dia não pode ser parado — a viagem começa na origem.");
      return;
    }
    const numDays = trip.num_days ?? 1;
    if (dayIndex >= numDays && !tripDays.get(dayIndex)?.is_rest_day) {
      Alert.alert("Último dia", "O último dia é a chegada ao destino — não pode ser um dia parado.");
      return;
    }
    const restSet = new Set<number>();
    for (const [d, td] of tripDays) if (td.is_rest_day) restSet.add(d);
    if (restSet.has(dayIndex)) restSet.delete(dayIndex);
    else restSet.add(dayIndex);
    const travelCal: number[] = [];
    for (let d = 1; d <= numDays; d++) if (!restSet.has(d)) travelCal.push(d);
    if (travelCal.length === 0) {
      Alert.alert("Sem deslocamento", "A expedição precisa de ao menos um dia de deslocamento.");
      return;
    }

    setTogglingRest(dayIndex);
    try {
      await reesqueletarExpedicao(restSet, trip);
      await load();
      const supabase = getSupabase();
      const { data: freshSegs } = await supabase.from("segments").select("*").eq("trip_id", id).order("order_index", { ascending: true });
      if (freshSegs && freshSegs.length > 0) {
        await fetchWeather(freshSegs, trip.departure_date);
        await load();
      }
    } catch (e: any) {
      Alert.alert("Erro ao alterar o dia", e.message ?? "Tente novamente.");
    } finally {
      setTogglingRest(null);
    }
  }

  // Expedição: adiciona uma parada obrigatória (waypoint). Re-esqueleta (a rota passa
  // pela parada e ela é bucketada num dia). O re-esqueleto (calcularRota) é rest-day-aware:
  // PRESERVA os dias parados e as demais paradas (persistidas em waypoints); os trechos já
  // detalhados voltam ao esqueleto.
  async function adicionarParada(geo: GeoResult) {
    if (!trip) return;
    if (trip.status === "active") {
      Alert.alert("Viagem em andamento", "Não é possível alterar as paradas com a viagem já iniciada.");
      return;
    }
    setSavingParada(true);
    try {
      const supabase = getSupabase();
      const nextOrder = waypoints.reduce((m, w) => Math.max(m, w.order_index), -1) + 1;
      await supabase.from("waypoints").insert([{
        trip_id: id, name: geo.name, latitude: geo.lat, longitude: geo.lng, order_index: nextOrder, is_mandatory: true,
      }]);
      setAddParadaModal(false);
      setWpQuery("");
      setWpResults([]);
      await calcularRota();
      await load();
    } catch (e: any) {
      Alert.alert("Erro ao adicionar parada", e.message ?? "Tente novamente.");
    } finally {
      setSavingParada(false);
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

  const isDayTrip = trip?.trip_type === "day_trip";
  // Dias de calendário da Expedição (inclui dias parados, que não têm segmentos).
  const numDiasCal = !isDayTrip ? (trip.num_days ?? maxDay) : maxDay;
  // Grupos de cards: Rolê ida-e-volta = IDA/VOLTA (corte no destino da viagem, que é o
  // ponto de retorno); Rolê só ida = um grupo sem rótulo; multi_day = um por dia (de
  // calendário — dias parados entram sem segmentos).
  type GrupoCards = { label: string | null; segs: Segment[]; isRest?: boolean };
  const grupos: GrupoCards[] = [];
  if (isDayTrip && trip?.round_trip) {
    const turnaround = segments.findIndex((s) => s.destination_name === trip.destination);
    const cut = turnaround >= 0 ? turnaround + 1 : Math.ceil(segments.length / 2);
    grupos.push({ label: "IDA", segs: segments.slice(0, cut) });
    grupos.push({ label: "VOLTA", segs: segments.slice(cut) });
  } else if (isDayTrip) {
    grupos.push({ label: null, segs: segments });
  } else {
    for (let d = 1; d <= numDiasCal; d++) {
      grupos.push({
        label: `DIA ${d}`,
        segs: segments.filter((s) => (s.day_index ?? 1) === d),
        isRest: !!tripDays.get(d)?.is_rest_day,
      });
    }
  }
  // No desktop, Ida e Volta (2 cards) ficam lado a lado; no mobile, empilhados.
  const sideBySide = isDesktop && !!isDayTrip && !!trip?.round_trip && grupos.length === 2;

  // Dias com alerta de chuva/vento (D6). Recomputado dos segments: após um re-esqueleto
  // (editar cidade / recalcular) os segments perdem os alertas até "Atualizar Clima", então
  // a lista pode ficar vazia mesmo com trip.has_weather_alert ainda true — nesse caso o
  // banner não deve renderizar (evita "Alertas climáticos em" sem nenhum dia).
  const diasComAlertaClimatico = segments
    .filter((s) =>
      (s.alert_types as string[] | null)?.some(
        (a) => a.startsWith("chuva") || a.startsWith("vento")
      )
    )
    .map((s) => `Dia ${s.day_index}`)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  // Renderiza o card de UM dia. Reutilizado pela lista vertical (Rolê) e pelo board
  // horizontal (Expedição). inBoard = Expedição: o card ocupa 100% da coluna e o clima
  // do trecho vira 1 linha compacta (sem o painel lateral de 76px).
  const renderDay = (grupo: GrupoCards, gi: number) => {
    const inBoard = !isDayTrip;
    const cardStyle = [styles.dayCard, inBoard ? styles.dayCardBoard : sideBySide && styles.dayCardHalf];
    const daySegs = grupo.segs;
    const dayIdx = gi + 1; // nº do dia (multi_day) / índice do grupo

    // Dia parado (Expedição): sem segmentos, herda a cidade do dia anterior.
    if (!isDayTrip && grupo.isRest) {
      const restCity = tripDays.get(dayIdx)?.city_name ?? "";
      return (
        <View key={gi} style={cardStyle}>
          <DayHeader
            label={grupo.label}
            date={segmentDate(trip.departure_date, dayIdx)}
            originName={restCity}
            destinName={restCity}
            totalKm={0}
          />
          <View style={styles.restDayBody}>
            <Text style={styles.restDayText}>🛌 Dia parado em {restCity || "—"}</Text>
            <TouchableOpacity
              style={[styles.restToggleBtn, (togglingRest !== null || calculating || trip.status === "active") && { opacity: 0.5 }]}
              onPress={() => toggleRestDay(dayIdx)}
              disabled={togglingRest !== null || calculating || trip.status === "active"}
            >
              {togglingRest === dayIdx ? (
                <ActivityIndicator color="#C97826" />
              ) : (
                <Text style={styles.restToggleBtnText}>▶ Voltar a dia de viagem</Text>
              )}
            </TouchableOpacity>
          </View>
          {dayIdx < numDiasCal && (
            <LodgingBlock
              tripId={id}
              dayIndex={dayIdx}
              departureDate={trip.departure_date}
              destCity={restCity}
              lodgingItem={lodging.get(dayIdx)}
              onReservedToggle={toggleReserved}
              onSearchPress={() => openLodgingSearch(dayIdx, restCity)}
            />
          )}
        </View>
      );
    }

    if (daySegs.length === 0) return null;

    const firstSeg = daySegs[0];
    const lastSeg = daySegs[daySegs.length - 1];
    const dayTotalKm = daySegs.reduce((sum, s) => sum + s.distance_km, 0);
    // Rolê: sempre o dia de saída (ida e volta no mesmo dia). Expedição: soma os dias.
    const dayDate = isDayTrip ? trip.departure_date : segmentDate(trip.departure_date, dayIdx);
    // "Gerado" = mostra os trechos. Esqueleto (botão gerar) só quando há uma linha
    // trip_days do dia com segments_generated=false. day_trip e multi_day antigo
    // (sem trip_days) contam como gerados — não regride viagens já calculadas.
    const diaGerado = isDayTrip || !tripDays.has(dayIdx) || !!tripDays.get(dayIdx)?.segments_generated;

    return (
      <View key={gi} style={cardStyle}>
        <DayHeader
          label={grupo.label}
          date={dayDate}
          originName={firstSeg.origin_name ?? ""}
          destinName={lastSeg.destination_name ?? ""}
          totalKm={dayTotalKm}
          onEditCity={!isDayTrip && dayIdx < numDiasCal && trip.status !== "active"
            && togglingRest === null && generatingDay === null && !savingCity ? () => {
            setEditCityModal({ dayIndex: dayIdx, currentCity: lastSeg.destination_name ?? "" });
            setWpQuery("");
            setWpResults([]);
          } : undefined}
          onToggleRest={!isDayTrip && dayIdx > 1 && dayIdx < numDiasCal ? () => toggleRestDay(dayIdx) : undefined}
        />
        {/* Paradas obrigatórias deste dia (Expedição) */}
        {!isDayTrip && (() => {
          const paradasDoDia = waypoints.filter((w) => w.day_index === dayIdx);
          if (paradasDoDia.length === 0) return null;
          return (
            <View style={styles.paradasRow}>
              {paradasDoDia.map((wp) => (
                <View key={wp.id} style={styles.paradaTag}>
                  <Text style={styles.paradaTagText} numberOfLines={1}>📍 {wp.name}</Text>
                  {trip.status !== "active" && (
                    <TouchableOpacity
                      onPress={() => deleteWaypoint(wp.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      disabled={calculating}
                    >
                      <Text style={styles.paradaTagRemove}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          );
        })()}
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
          {!diaGerado && (() => {
            // Esqueleto do dia (Expedição): trechos ainda não gerados.
            const skel = daySegs[0];
            return (
              <View key="skel">
                {skel.alert_types?.includes("sem_cidade") && (
                  <Text style={styles.pernoiteWarning}>
                    ⚠️ Fim de dia sem cidade confirmada — confirme o local de pernoite
                  </Text>
                )}
                <View style={styles.daySkeleton}>
                  <Text style={styles.daySkelHint}>Trechos e postos ainda não detalhados</Text>
                  <TouchableOpacity
                    style={[styles.btnGerarDia, (generatingDay !== null || calculating || trip.status === "active") && { opacity: 0.5 }]}
                    onPress={() => gerarTrechosDia(dayIdx)}
                    disabled={generatingDay !== null || calculating || trip.status === "active"}
                  >
                    {generatingDay === dayIdx ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnGerarDiaText}>⚙ Gerar trechos deste dia</Text>
                    )}
                  </TouchableOpacity>
                  {trip.status === "active" && (
                    <Text style={styles.daySkelNote}>Gere os trechos antes de iniciar a viagem.</Text>
                  )}
                </View>
                {dayIdx < numDiasCal && (
                  <LodgingBlock
                    tripId={id}
                    dayIndex={dayIdx}
                    departureDate={trip.departure_date}
                    destCity={skel.destination_name ?? ""}
                    lodgingItem={lodging.get(dayIdx)}
                    onReservedToggle={toggleReserved}
                    onSearchPress={() => openLodgingSearch(dayIdx, skel.destination_name ?? "")}
                  />
                )}
              </View>
            );
          })()}
          {diaGerado && daySegs.map((seg, segIdx) => {
            const globalIdx = segments.indexOf(seg);
            const isLastSeg = globalIdx === segments.length - 1;
            const showLodging = seg.is_last_of_day && dayIdx < numDiasCal && !isDayTrip;
            const depTime = segmentTimes.get(seg.id) ?? baseTime;

            return (
              <View key={seg.id}>
                <SegmentCard
                  seg={seg}
                  stop={stops.get(seg.id)}
                  showDayEnd={!isDayTrip}
                  departureDate={trip.departure_date}
                  departureTime={depTime}
                  compact={inBoard}
                  onStopPress={() => openStopAlternatives(seg.id)}
                  onAddPress={isDayTrip ? () => {
                    setAddWpModal({ segIndex: globalIdx, segment: seg });
                    setWpQuery("");
                    setWpResults([]);
                    setWpMode("fuel");
                  } : undefined}
                  onNavigatePress={trip.status === "active" ? () => handleNavigate(seg) : undefined}
                />
                {isDayTrip && segIdx < daySegs.length - 1 && (
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
                    {tripDays.get(dayIdx)?.alert_types?.includes("sem_cidade") && (
                      <Text style={styles.pernoiteWarning}>
                        ⚠️ Fim de dia sem cidade confirmada — verifique o local de pernoite
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
  };

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
          <TouchableOpacity
            style={styles.summaryMenuBtn}
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Ações da viagem"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.summaryMenuIcon}>⋮</Text>
          </TouchableOpacity>
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
              <Text style={activeView === "list" ? styles.toggleBtnActiveText : styles.toggleBtnText}>{isDayTrip ? "📋 Lista" : "▦ Board"}</Text>
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
        {hasWeatherAlert && diasComAlertaClimatico.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertBannerIcon}>⚠️</Text>
            <Text style={styles.alertBannerText}>
              {isDayTrip
                ? "Alertas climáticos previstos na rota"
                : `Alertas climáticos em ${diasComAlertaClimatico.join(", ")}`}
            </Text>
          </View>
        )}

        {/* Segments grouped by day (D1) */}
        {segments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Rota ainda não calculada.</Text>
            <Text style={styles.emptyHint}>
              Calcule a rota para buscar os segmentos via Google Maps.
            </Text>
            <TouchableOpacity
              style={[styles.emptyCalcBtn, (calculating || fetchingWeather) && { opacity: 0.6 }]}
              onPress={() => calcularRota()}
              disabled={calculating || fetchingWeather}
            >
              {calculating ? <ActivityIndicator color="#fff" /> : <Text style={styles.emptyCalcBtnText}>🧭 Calcular Rota</Text>}
            </TouchableOpacity>
          </View>
        ) : !isDayTrip ? (
          // Expedição: board horizontal (colunas = dias). Ver useBoardColumns/DayBoard.
          <DayBoard
            columns={grupos.map(renderDay).filter(Boolean)}
            colWidth={board.colWidth}
            gap={board.gap}
            numColumns={board.numColumns}
          />
        ) : (
          // Rolê (day_trip): mantém a lista vertical; Ida/Volta lado a lado no desktop.
          <View style={sideBySide ? styles.dayCardsRow : undefined}>
            {grupos.map(renderDay)}
          </View>
        )}

        {/* Regras da viagem (info) */}
        {segments.length > 0 && trip.max_stop_km != null && (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>REGRAS DA VIAGEM</Text>
            <Text style={styles.rulesLine}>
              Paradas: {trip.min_stop_km}–{trip.max_stop_km} km entre cada uma
            </Text>
          </View>
        )}

        {/* Menu de ações da viagem — aberto pelo ⋮ do card de resumo. Reúne todas as
            ações da viagem (Rolê ou Expedição), que antes ficavam empilhadas no rodapé. */}
        <Modal
          visible={menuOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setMenuOpen(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Ações da viagem</Text>

              {/* Ação principal contextual (destacada) */}
              {segments.length === 0 && (
                <TouchableOpacity
                  style={[styles.menuRow, styles.menuRowPrimary, (calculating || fetchingWeather) && styles.menuRowDisabled]}
                  onPress={() => { setMenuOpen(false); calcularRota(); }}
                  disabled={calculating || fetchingWeather}
                >
                  <Text style={styles.menuIconPrimary}>🧭</Text>
                  <Text style={styles.menuLabelPrimary}>Calcular Rota</Text>
                </TouchableOpacity>
              )}
              {segments.length > 0 && (trip.status === "planned" || trip.status === "saved") && (
                <TouchableOpacity
                  style={[styles.menuRow, styles.menuRowPrimary, (calculating || fetchingWeather) && styles.menuRowDisabled]}
                  onPress={() => { setMenuOpen(false); startTrip(); }}
                  disabled={calculating || fetchingWeather}
                >
                  <Text style={styles.menuIconPrimary}>🏍</Text>
                  <Text style={styles.menuLabelPrimary}>Iniciar Viagem</Text>
                </TouchableOpacity>
              )}
              {trip.status === "active" && (
                <TouchableOpacity
                  style={[styles.menuRow, styles.menuRowPrimary]}
                  onPress={() => { setMenuOpen(false); router.push(`/trip/${id}/active` as any); }}
                >
                  <Text style={styles.menuIconPrimary}>▶</Text>
                  <Text style={styles.menuLabelPrimary}>Continuar Viagem</Text>
                </TouchableOpacity>
              )}

              {/* Utilitários */}
              {segments.length > 0 && (
                <TouchableOpacity
                  style={[styles.menuRow, (calculating || fetchingWeather || trip.status === "active") && styles.menuRowDisabled]}
                  onPress={() => { setMenuOpen(false); setShowRecalcConfirm(true); }}
                  disabled={calculating || fetchingWeather || trip.status === "active"}
                >
                  <Text style={styles.menuIcon}>↻</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>Recalcular Rota</Text>
                    {trip.status === "active" && (
                      <Text style={styles.menuNote}>Bloqueado na viagem em andamento</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              {segments.length > 0 && weatherAvailable && (
                <TouchableOpacity
                  style={[styles.menuRow, (fetchingWeather || calculating) && styles.menuRowDisabled]}
                  onPress={() => { setMenuOpen(false); fetchWeather(segments, trip.departure_date); }}
                  disabled={fetchingWeather || calculating}
                >
                  <Text style={styles.menuIcon}>🌦️</Text>
                  <Text style={styles.menuLabel}>{hasWeatherData ? "Atualizar Clima" : "Buscar Previsão do Tempo"}</Text>
                </TouchableOpacity>
              )}
              {!isDayTrip && segments.length > 0 && trip.status !== "active" && (
                <TouchableOpacity
                  style={[styles.menuRow, (calculating || savingParada) && styles.menuRowDisabled]}
                  onPress={() => { setMenuOpen(false); setAddParadaModal(true); setWpQuery(""); setWpResults([]); }}
                  disabled={calculating || savingParada}
                >
                  <Text style={styles.menuIcon}>➕</Text>
                  <Text style={styles.menuLabel}>Parada obrigatória</Text>
                </TouchableOpacity>
              )}
              {trip.status === "planned" && (
                <TouchableOpacity
                  style={[styles.menuRow, (calculating || fetchingWeather) && styles.menuRowDisabled]}
                  onPress={() => { setMenuOpen(false); saveTrip(); }}
                  disabled={calculating || fetchingWeather}
                >
                  <Text style={styles.menuIcon}>💾</Text>
                  <Text style={styles.menuLabel}>Salvar</Text>
                </TouchableOpacity>
              )}

              {/* Social — compartilhar cópia + proveniência */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => { setMenuOpen(false); setShareEmail(""); setShareResult(null); setShareModal(true); }}
              >
                <Text style={styles.menuIcon}>📤</Text>
                <Text style={styles.menuLabel}>Compartilhar viagem</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => { setMenuOpen(false); openInfoSheet(); }}
              >
                <Text style={styles.menuIcon}>ℹ️</Text>
                <Text style={styles.menuLabel}>Sobre esta viagem</Text>
              </TouchableOpacity>

              {/* Destrutivo */}
              {trip.status !== "completed" && (
                <>
                  <View style={styles.menuDivider} />
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => { setMenuOpen(false); setShowDeleteConfirm(true); }}
                    disabled={deleting}
                  >
                    <Text style={styles.menuIcon}>🗑</Text>
                    <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Excluir viagem</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuOpen(false)}>
                <Text style={styles.menuCancelText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Compartilhar viagem — envia convite por e-mail (fork no aceite) */}
        <Modal
          visible={shareModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShareModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShareModal(false)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Compartilhar viagem</Text>
              <Text style={styles.shareHint}>
                Envie uma cópia para outro piloto do MotoRoute. Ele recebe um convite e decide se
                aceita — as edições de vocês ficam independentes.
              </Text>
              <TextInput
                style={styles.wpSearchInput}
                value={shareEmail}
                onChangeText={setShareEmail}
                placeholder="email@exemplo.com"
                placeholderTextColor="#aaa"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={submitShare}
                returnKeyType="send"
              />
              {!shareResult?.ok && (
                <TouchableOpacity
                  style={[styles.shareSendBtn, shareSending && { opacity: 0.6 }]}
                  onPress={submitShare}
                  disabled={shareSending}
                >
                  {shareSending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.shareSendText}>Compartilhar →</Text>
                  )}
                </TouchableOpacity>
              )}
              {shareResult && (
                <Text style={shareResult.ok ? styles.shareResultOk : styles.shareResultErr}>
                  {shareResult.text}
                </Text>
              )}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShareModal(false)}>
                <Text style={styles.modalCancelText}>{shareResult?.ok ? "Fechar" : "Cancelar"}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Sobre esta viagem — autor original + proveniência + metadados */}
        <Modal
          visible={infoSheet != null}
          transparent
          animationType="slide"
          onRequestClose={() => setInfoSheet(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setInfoSheet(null)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Sobre esta viagem</Text>
              {infoSheet && trip && (
                <>
                  <View style={styles.infoCreatorRow}>
                    {infoSheet.creatorAvatar ? (
                      <Image source={{ uri: infoSheet.creatorAvatar }} style={styles.infoAvatarImg} />
                    ) : (
                      <View style={styles.infoAvatar}>
                        <Text style={styles.infoAvatarLetter}>
                          {(infoSheet.creatorName[0] ?? "?").toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoCreatorName}>Criada por {infoSheet.creatorName}</Text>
                      <Text style={styles.infoCreatorDate}>
                        {trip.created_at
                          ? new Date(trip.created_at).toLocaleDateString("pt-BR", {
                              day: "2-digit", month: "long", year: "numeric",
                            })
                          : ""}
                      </Text>
                    </View>
                  </View>
                  {infoSheet.sharedByName && (
                    <View style={styles.infoSharedBanner}>
                      <Text style={styles.infoSharedText}>
                        📤 Recebida de {infoSheet.sharedByName}
                      </Text>
                    </View>
                  )}
                  <InfoRow k="Rota" v={`${trip.origin} → ${trip.destination}`} />
                  <InfoRow
                    k="Tipo"
                    v={isDayTrip
                      ? (trip.round_trip ? "Rolê · ida e volta" : "Rolê")
                      : `Expedição · ${trip.num_days ?? 1} dias`}
                  />
                  {trip.total_distance_km != null && (
                    <InfoRow k="Distância" v={`${Math.round(trip.total_distance_km)} km`} />
                  )}
                  <InfoRow k="Paradas" v={String(trip.stop_count ?? 0)} />
                </>
              )}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setInfoSheet(null)}>
                <Text style={styles.modalCancelText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

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
              {stopModal && stopModal.alternatives.length > 0 && (
                <StopAltMap alternatives={stopModal.alternatives} />
              )}
              {stopModal?.alternatives.map((alt, i) => {
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
                    <View style={[styles.altNum, { backgroundColor: alt.is_selected ? "#16A34A" : "#C97826" }]}>
                      <Text style={styles.altNumText}>{i + 1}</Text>
                    </View>
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
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {(["fuel", "poi"] as const).map((m) => {
                  const active = wpMode === m;
                  const accent = m === "fuel" ? "#C97826" : "#2563EB";
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => { setWpMode(m); setWpResults([]); }}
                      style={{
                        flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center",
                        borderWidth: 1.5,
                        borderColor: active ? accent : "#3a3a3a",
                        backgroundColor: active ? accent + "22" : "transparent",
                      }}
                    >
                      <Text style={{ color: active ? accent : "#aaa", fontWeight: active ? "700" : "500", fontSize: 13 }}>
                        {m === "fuel" ? "⛽ Posto" : "📍 Ponto de interesse"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.wpSearchRow}>
                <TextInput
                  style={styles.wpSearchInput}
                  value={wpQuery}
                  onChangeText={setWpQuery}
                  placeholder={wpMode === "fuel" ? "Nome do posto ou cidade" : "Mirante, bar, monumento…"}
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
                    <Text style={styles.altName} numberOfLines={1}>{wpMode === "fuel" ? "⛽" : "📍"} {r.name}</Text>
                    <Text style={styles.altMeta} numberOfLines={1}>
                      {r.rating != null ? `★${r.rating} · ` : ""}{r.address}
                    </Text>
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

        {/* Editar cidade de pernoite (Expedição) */}
        <Modal
          visible={editCityModal != null}
          transparent
          animationType="slide"
          onRequestClose={() => setEditCityModal(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => !savingCity && setEditCityModal(null)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Cidade de pernoite</Text>
              {editCityModal && (
                <Text style={styles.editCitySub}>
                  Dia {editCityModal.dayIndex} — atual: {editCityModal.currentCity || "—"}. Trocar refaz os km
                  deste dia e do seguinte; os trechos já gerados desses dias precisarão ser regerados.
                </Text>
              )}
              <View style={styles.wpSearchRow}>
                <TextInput
                  style={styles.wpSearchInput}
                  value={wpQuery}
                  onChangeText={setWpQuery}
                  placeholder="Buscar cidade"
                  placeholderTextColor="#aaa"
                  onSubmitEditing={() => searchWaypoint(wpQuery)}
                  returnKeyType="search"
                  autoFocus
                  editable={!savingCity}
                />
                <TouchableOpacity style={styles.wpSearchBtn} onPress={() => searchWaypoint(wpQuery)} disabled={wpSearching || savingCity}>
                  {wpSearching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.wpSearchBtnText}>Buscar</Text>}
                </TouchableOpacity>
              </View>
              {savingCity ? (
                <View style={{ paddingVertical: 16, alignItems: "center", gap: 6 }}>
                  <ActivityIndicator color="#C97826" />
                  <Text style={styles.modalCancelText}>Recalculando os dias afetados…</Text>
                </View>
              ) : (
                <>
                  {wpResults.map((r, idx) => (
                    <TouchableOpacity key={idx} style={styles.altRow} onPress={() => editarCidadeDia(r)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.altName} numberOfLines={1}>🏙 {r.name}</Text>
                        <Text style={styles.altMeta} numberOfLines={1}>{r.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {wpResults.length === 0 && !wpSearching && wpQuery.trim().length > 0 && (
                    <Text style={styles.modalCancelText}>Nenhum resultado. Tente outro nome.</Text>
                  )}
                </>
              )}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditCityModal(null)} disabled={savingCity}>
                <Text style={styles.modalCancelText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Adicionar parada obrigatória (Expedição) */}
        <Modal
          visible={addParadaModal}
          transparent
          animationType="slide"
          onRequestClose={() => setAddParadaModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => !savingParada && setAddParadaModal(false)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Parada obrigatória</Text>
              <Text style={styles.editCitySub}>
                A rota vai passar por este ponto e ele vira uma parada fixa no dia em que cair.
                Adicionar refaz a divisão em dias; os dias parados e as demais paradas são
                mantidos, e os trechos já detalhados voltam ao esqueleto.
              </Text>
              <View style={styles.wpSearchRow}>
                <TextInput
                  style={styles.wpSearchInput}
                  value={wpQuery}
                  onChangeText={setWpQuery}
                  placeholder="Cidade, posto ou endereço"
                  placeholderTextColor="#aaa"
                  onSubmitEditing={() => searchWaypoint(wpQuery)}
                  returnKeyType="search"
                  autoFocus
                  editable={!savingParada}
                />
                <TouchableOpacity style={styles.wpSearchBtn} onPress={() => searchWaypoint(wpQuery)} disabled={wpSearching || savingParada}>
                  {wpSearching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.wpSearchBtnText}>Buscar</Text>}
                </TouchableOpacity>
              </View>
              {savingParada ? (
                <View style={{ paddingVertical: 16, alignItems: "center", gap: 6 }}>
                  <ActivityIndicator color="#C97826" />
                  <Text style={styles.modalCancelText}>Refazendo a divisão em dias…</Text>
                </View>
              ) : (
                <>
                  {wpResults.map((r, idx) => (
                    <TouchableOpacity key={idx} style={styles.altRow} onPress={() => adicionarParada(r)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.altName} numberOfLines={1}>📍 {r.name}</Text>
                        <Text style={styles.altMeta} numberOfLines={1}>{r.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {wpResults.length === 0 && !wpSearching && wpQuery.trim().length > 0 && (
                    <Text style={styles.modalCancelText}>Nenhum resultado. Tente outro nome.</Text>
                  )}
                </>
              )}
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddParadaModal(false)} disabled={savingParada}>
                <Text style={styles.modalCancelText}>Fechar</Text>
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
  summaryRoute: { fontSize: 17, fontWeight: "700", color: "#1A1A1A", marginBottom: 4, paddingRight: 32 },
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
  dayCardsRow: { flexDirection: "row", alignItems: "flex-start" },
  dayCardHalf: { flex: 1 },
  // Board de Expedição: o card ocupa 100% da coluna; a margem/gap fica a cargo do DayBoard.
  dayCardBoard: { width: "100%", marginHorizontal: 0, marginBottom: 0 },
  // Clima compacto (1 linha) do board — substitui o painel lateral de 76px.
  weatherLine: { marginTop: 6, marginBottom: 2, fontSize: 12, color: "#555", fontWeight: "600" },
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
  dayHeaderRight: { alignItems: "flex-end", gap: 4 },
  dayKm: { fontSize: 13, fontWeight: "700", color: "#C97826" },
  editCityBtn: { fontSize: 11, color: "#2563EB", fontWeight: "600" },
  editCitySub: { fontSize: 12, color: "#6B7280", marginBottom: 8, lineHeight: 16 },
  dayBody: { backgroundColor: "#fff" },

  // Esqueleto de dia da Expedição (trechos ainda não gerados)
  daySkeleton: { paddingHorizontal: 16, paddingVertical: 14, alignItems: "center", gap: 10 },
  daySkelHint: { fontSize: 13, color: "#6B7280" },
  btnGerarDia: {
    backgroundColor: "#C97826",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  btnGerarDiaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  daySkelNote: { fontSize: 12, color: "#B45309", textAlign: "center" },

  // Dia parado (rest day)
  restDayBody: { paddingHorizontal: 16, paddingVertical: 14, alignItems: "center", gap: 10, backgroundColor: "#F9FAFB" },
  restDayText: { fontSize: 14, color: "#374151", fontWeight: "600" },
  restToggleBtn: { borderWidth: 1, borderColor: "#C97826", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, minHeight: 40, alignItems: "center", justifyContent: "center" },
  restToggleBtnText: { color: "#C97826", fontSize: 14, fontWeight: "700" },

  // Paradas obrigatórias (Expedição)
  btnParada: { borderWidth: 1, borderColor: "#2563EB", borderRadius: 12, paddingVertical: 12, marginHorizontal: 16, marginTop: 8, alignItems: "center" },
  btnParadaText: { color: "#2563EB", fontSize: 15, fontWeight: "700" },
  paradasRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, paddingTop: 8 },
  paradaTag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  paradaTagText: { fontSize: 12, color: "#1D4ED8", fontWeight: "600", maxWidth: 200 },
  paradaTagRemove: { fontSize: 16, color: "#1D4ED8", fontWeight: "700" },

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
  segStopAlt: { fontSize: 18, lineHeight: 20, fontWeight: "700", color: "#2563EB", flexShrink: 0, paddingHorizontal: 2 },
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

  // ===== Menu de ações da viagem (⋮ no card de resumo) + action sheet =====
  summaryMenuBtn: { position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  summaryMenuIcon: { fontSize: 24, fontWeight: "800", color: "#555", lineHeight: 26 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  menuRowPrimary: { backgroundColor: "#FDF3E7", borderRadius: 12, paddingHorizontal: 14, marginBottom: 4 },
  menuRowDisabled: { opacity: 0.4 },
  menuIcon: { fontSize: 18, width: 24, textAlign: "center" },
  menuIconPrimary: { fontSize: 20, width: 24, textAlign: "center" },
  menuLabel: { fontSize: 15, fontWeight: "600", color: "#1A1A1A" },
  menuLabelPrimary: { fontSize: 16, fontWeight: "800", color: "#C97826" },
  menuLabelDanger: { color: "#E53935", fontWeight: "700" },
  menuNote: { fontSize: 11.5, color: "#999", marginTop: 2 },
  menuDivider: { height: 1, backgroundColor: "#EEE", marginVertical: 6 },
  menuCancel: { marginTop: 10, paddingVertical: 14, alignItems: "center", backgroundColor: "#F5F5F5", borderRadius: 12 },
  menuCancelText: { fontSize: 15, fontWeight: "700", color: "#555" },
  // Empty state — calcular rota
  emptyCalcBtn: { marginTop: 14, backgroundColor: "#C97826", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", minHeight: 44 },
  emptyCalcBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

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
  altNum: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  altNumText: { color: "#fff", fontSize: 11, fontWeight: "700" },
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

  // Compartilhar
  shareHint: { fontSize: 13, color: "#888", lineHeight: 19, marginBottom: 14 },
  shareSendBtn: {
    backgroundColor: "#C97826", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginTop: 12,
  },
  shareSendText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  shareResultOk: { marginTop: 12, fontSize: 13.5, color: "#16A34A", fontWeight: "600", lineHeight: 19 },
  shareResultErr: { marginTop: 12, fontSize: 13.5, color: "#E53935", fontWeight: "600", lineHeight: 19 },

  // Sobre esta viagem
  infoCreatorRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#F7F7F8", borderRadius: 12, padding: 12, marginBottom: 10,
  },
  infoAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#C97826",
    alignItems: "center", justifyContent: "center",
  },
  infoAvatarImg: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eee" },
  infoAvatarLetter: { color: "#fff", fontWeight: "700", fontSize: 17 },
  infoCreatorName: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  infoCreatorDate: { fontSize: 12, color: "#888", marginTop: 2 },
  infoSharedBanner: {
    backgroundColor: "#FEF6EC", borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: "#F3D9B8",
  },
  infoSharedText: { fontSize: 13, color: "#9A5A12", fontWeight: "600" },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", gap: 16,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F0F0F0",
  },
  infoRowKey: { fontSize: 13, color: "#888" },
  infoRowVal: { fontSize: 13, color: "#1A1A1A", fontWeight: "600", flexShrink: 1, textAlign: "right" },

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
