import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";
import type { Database } from "@/types/database";

type Trip = Database["public"]["Tables"]["trips"]["Row"];
type Segment = Database["public"]["Tables"]["segments"]["Row"];
type Checkin = Database["public"]["Tables"]["checkins"]["Row"];

const RAIN_ALERT_THRESHOLD = 40;

const ALERT_LABELS: Record<string, string> = {
  trecho_longo: "Trecho longo (>200km sem parada)",
  trecho_curto: "Trecho curto (<100km)",
  chuva_forte: "Chuva provável neste trecho",
  vento_forte: "Vento forte neste trecho",
};

function fmtKm(km: number) {
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function openNavigation(lat: number, lng: number, destName: string) {
  const url = `https://maps.google.com/?daddr=${lat},${lng}`;
  if (Platform.OS === "web") {
    // @ts-ignore
    window.open(url, "_blank");
  } else {
    Linking.openURL(url);
  }
}

function weatherIcon(rainPct: number | null) {
  if ((rainPct ?? 0) >= 60) return "🌧";
  if ((rainPct ?? 0) >= 30) return "⛅";
  return "☀️";
}

export default function ActiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkinModal, setCheckinModal] = useState(false);
  const [checkinKm, setCheckinKm] = useState("");
  const [checkinFueled, setCheckinFueled] = useState(false);

  async function load() {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const [{ data: tripData }, { data: segsData }, { data: checkinsData }] =
      await Promise.all([
        supabase.from("trips").select("*").eq("id", id).single(),
        supabase
          .from("segments")
          .select("*")
          .eq("trip_id", id)
          .order("order_index", { ascending: true }),
        supabase.from("checkins").select("*").eq("trip_id", id),
      ]);

    setTrip(tripData);
    setSegments(segsData ?? []);
    setCheckins(checkinsData ?? []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, [id]));

  const checkinMap = new Map(checkins.map((c) => [c.segment_id, c]));
  const currentIndex = segments.findIndex((s) => !checkinMap.has(s.id));
  const currentSeg = currentIndex >= 0 ? segments[currentIndex] : null;
  const allDone = segments.length > 0 && currentIndex === -1;

  const doneCount = checkins.filter((c) => !c.skipped).length;
  const progressPct = segments.length > 0 ? doneCount / segments.length : 0;

  function openCheckinModal() {
    setCheckinKm("");
    setCheckinFueled(false);
    setCheckinModal(true);
  }

  async function doCheckin(skipped: boolean, kmAtCheckin?: number, fueled?: boolean) {
    if (!currentSeg) return;
    setActionLoading(true);
    const supabase = getSupabase();
    try {
      // Re-fetch user each time to avoid stale state
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const uid = authUser?.id ?? userId;
      if (!uid) return;

      const { error } = await supabase.from("checkins").upsert(
        {
          trip_id: id,
          segment_id: currentSeg.id,
          user_id: uid,
          skipped,
          checked_in_at: new Date().toISOString(),
          km_at_checkin: kmAtCheckin ?? null,
          fueled_up: fueled ?? false,
        },
        { onConflict: "trip_id,segment_id,user_id" }
      );
      if (error) {
        console.error("checkin upsert error:", error);
        return;
      }
      if (fueled && kmAtCheckin) {
        const { data: moto } = await supabase
          .from("motorcycles").select("id").eq("is_active", true).maybeSingle();
        if (moto) {
          await supabase.from("motorcycles")
            .update({ odometer_km: kmAtCheckin })
            .eq("id", moto.id);
        }
      }
      await load();
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmCheckin() {
    setCheckinModal(false);
    const km = checkinKm.trim() ? Number(checkinKm.replace(/\D/g, "")) : undefined;
    await doCheckin(false, km || undefined, checkinFueled);
  }

  async function completeTrip() {
    setActionLoading(true);
    const supabase = getSupabase();
    try {
      await supabase
        .from("trips")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      router.replace("/viagens" as any);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97826" size="large" />
      </View>
    );
  }

  if (!trip || segments.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Viagem não encontrada.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const alerts = ((currentSeg?.alert_types as string[] | null) ?? []);
  const topAlert = alerts[0] ?? null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTag}>EM MOTO</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {trip.title}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Body — no scroll */}
      <View style={styles.body}>
        {allDone ? (
          /* All stops done */
          <View style={styles.doneWrapper}>
            <Text style={styles.doneEmoji}>🏁</Text>
            <Text style={styles.doneTitle}>Roteiro concluído!</Text>
            <Text style={styles.doneSub}>Você chegou ao destino final.</Text>
            <TouchableOpacity
              style={[styles.completeBtn, actionLoading && { opacity: 0.6 }]}
              onPress={completeTrip}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.completeBtnText}>Concluir Viagem</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : currentSeg ? (
          <>
            {/* Next stop card */}
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>PRÓXIMA PARADA</Text>
              <Text style={styles.nextDest} numberOfLines={2}>
                {currentSeg.destination_name}
              </Text>
              {currentSeg.route_summary ? (
                <Text style={styles.nextRoute} numberOfLines={1}>
                  Via {currentSeg.route_summary}
                </Text>
              ) : null}

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statVal}>
                    {fmtKm(currentSeg.distance_km)}
                  </Text>
                  <Text style={styles.statLabel}>restantes</Text>
                </View>
                <View style={styles.statSep} />
                <View style={styles.statItem}>
                  <Text style={styles.statVal}>
                    {fmtDuration(currentSeg.duration_minutes)}
                  </Text>
                  <Text style={styles.statLabel}>estimado</Text>
                </View>
              </View>

              {currentSeg.weather_condition ? (
                <View style={styles.weatherRow}>
                  <Text style={styles.weatherEmoji}>
                    {weatherIcon(currentSeg.weather_rain_pct)}
                  </Text>
                  <Text style={styles.weatherText} numberOfLines={1}>
                    {currentSeg.weather_temp_max != null
                      ? `${currentSeg.weather_temp_max}°C · `
                      : ""}
                    {currentSeg.weather_condition}
                    {currentSeg.weather_wind_kmh
                      ? ` · Vento ${currentSeg.weather_wind_kmh}km/h`
                      : ""}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Alert banner — at most 1 */}
            {topAlert ? (
              <View
                style={[
                  styles.alertBanner,
                  topAlert === "chuva_forte" || topAlert === "vento_forte"
                    ? styles.alertWeather
                    : styles.alertRoute,
                ]}
              >
                <Text style={styles.alertIcon}>⚠️</Text>
                <Text style={styles.alertText}>
                  {ALERT_LABELS[topAlert] ?? topAlert}
                </Text>
              </View>
            ) : null}

            {/* Progress */}
            <View style={styles.progressSection}>
              <Text style={styles.progressLabel}>PROGRESSO DA ROTA</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progressPct * 100)}%` },
                  ]}
                />
              </View>
              <View style={styles.stopsRow}>
                {segments.map((seg, i) => {
                  const c = checkinMap.get(seg.id);
                  const isDone = c != null && !c.skipped;
                  const isSkipped = c != null && c.skipped;
                  const isCurrent = i === currentIndex;
                  const shortName =
                    i === 0
                      ? seg.origin_name.split(",")[0]
                      : seg.destination_name.split(",")[0];
                  return (
                    <View key={seg.id} style={styles.stopItem}>
                      <View
                        style={[
                          styles.stopDot,
                          isDone && styles.stopDotDone,
                          isSkipped && styles.stopDotSkipped,
                          isCurrent && styles.stopDotCurrent,
                        ]}
                      >
                        {isDone && (
                          <Text style={styles.stopCheck}>✓</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.stopName,
                          isCurrent && styles.stopNameCurrent,
                        ]}
                        numberOfLines={1}
                      >
                        {shortName}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Action buttons */}
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() =>
                openNavigation(
                  currentSeg.dest_lat,
                  currentSeg.dest_lng,
                  currentSeg.destination_name
                )
              }
            >
              <Text style={styles.navBtnText}>
                🧭 Navegar para{" "}
                {currentSeg.destination_name.split(",")[0]}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.checkinBtn,
                actionLoading && { opacity: 0.6 },
              ]}
              onPress={openCheckinModal}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#22C55E" />
              ) : (
                <Text style={styles.checkinBtnText}>
                  ✓ Check-in nesta parada
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => doCheckin(true)}
              disabled={actionLoading}
            >
              <Text style={styles.skipBtnText}>Pular esta parada</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      {/* Check-in details modal */}
      <Modal visible={checkinModal} transparent animationType="slide" onRequestClose={() => setCheckinModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCheckinModal(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Check-in em {currentSeg?.dest_name}</Text>

            <Text style={styles.modalLabel}>KM atual do odômetro (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              value={checkinKm}
              onChangeText={setCheckinKm}
              placeholder="Ex: 45230"
              placeholderTextColor="#666"
              keyboardType="numeric"
              returnKeyType="done"
            />

            <TouchableOpacity
              style={styles.fuelToggle}
              onPress={() => setCheckinFueled((v) => !v)}
            >
              <View style={[styles.fuelCheckbox, checkinFueled && styles.fuelCheckboxOn]}>
                {checkinFueled && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
              </View>
              <Text style={styles.fuelLabel}>Abasteci nesta parada</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.confirmBtn} onPress={confirmCheckin}>
              <Text style={styles.confirmBtnText}>Confirmar Check-in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setCheckinModal(false)}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: {
    flex: 1,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: { fontSize: 16, color: "#ccc", marginBottom: 12 },
  linkText: { color: "#C97826", fontSize: 15 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  backBtnText: { fontSize: 24, color: "#fff" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTag: {
    fontSize: 10,
    color: "#C97826",
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  headerTitle: { fontSize: 15, color: "#fff", fontWeight: "700", marginTop: 2 },

  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    justifyContent: "space-between",
  },

  nextCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  nextLabel: {
    fontSize: 11,
    color: "#C97826",
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  nextDest: { fontSize: 26, color: "#fff", fontWeight: "800", marginBottom: 4 },
  nextRoute: { fontSize: 14, color: "#777", marginBottom: 16 },

  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  statItem: { alignItems: "center" },
  statVal: { fontSize: 22, color: "#fff", fontWeight: "700" },
  statLabel: { fontSize: 12, color: "#888", marginTop: 2 },
  statSep: {
    width: 1,
    height: 36,
    backgroundColor: "#333",
    marginHorizontal: 24,
  },

  weatherRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  weatherEmoji: { fontSize: 18 },
  weatherText: { fontSize: 14, color: "#bbb", flex: 1 },

  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  alertRoute: { backgroundColor: "#2D0000" },
  alertWeather: { backgroundColor: "#0D1B2E" },
  alertIcon: { fontSize: 20 },
  alertText: { fontSize: 15, color: "#fff", fontWeight: "600", flex: 1 },

  progressSection: {},
  progressLabel: {
    fontSize: 10,
    color: "#555",
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    backgroundColor: "#2A2A2A",
    borderRadius: 3,
    marginBottom: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: "#C97826",
    borderRadius: 3,
  },
  stopsRow: { flexDirection: "row", justifyContent: "space-around" },
  stopItem: { alignItems: "center", flex: 1 },
  stopDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#444",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  stopDotDone: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  stopDotSkipped: { backgroundColor: "#444", borderColor: "#444" },
  stopDotCurrent: { backgroundColor: "#C97826", borderColor: "#C97826" },
  stopCheck: { fontSize: 10, color: "#fff", fontWeight: "800" },
  stopName: { fontSize: 9, color: "#555", textAlign: "center" },
  stopNameCurrent: { color: "#C97826", fontWeight: "700" },

  navBtn: {
    backgroundColor: "#C97826",
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  navBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },

  checkinBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#22C55E",
    backgroundColor: "#0D2010",
    minHeight: 56,
  },
  checkinBtnText: { color: "#22C55E", fontSize: 17, fontWeight: "700" },

  skipBtn: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  skipBtnText: { color: "#555", fontSize: 15 },

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: { backgroundColor: "#1A1A1A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 20 },
  modalLabel: { fontSize: 13, color: "#aaa", marginBottom: 8 },
  modalInput: {
    backgroundColor: "#222", borderRadius: 10, padding: 14,
    fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "#333", marginBottom: 16,
  },
  fuelToggle: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  fuelCheckbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "#555", justifyContent: "center", alignItems: "center" },
  fuelCheckboxOn: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  fuelLabel: { fontSize: 15, color: "#fff" },
  confirmBtn: { backgroundColor: "#22C55E", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginBottom: 10 },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: { paddingVertical: 10, alignItems: "center" },
  cancelBtnText: { color: "#555", fontSize: 15 },

  doneWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  doneEmoji: { fontSize: 72 },
  doneTitle: { fontSize: 28, color: "#fff", fontWeight: "800" },
  doneSub: { fontSize: 16, color: "#888" },
  completeBtn: {
    backgroundColor: "#C97826",
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginTop: 16,
    minHeight: 64,
    justifyContent: "center",
  },
  completeBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
