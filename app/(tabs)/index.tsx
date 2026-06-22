import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";
import type { Database } from "@/types/database";

type Trip = Database["public"]["Tables"]["trips"]["Row"];

function statusLabel(status: Trip["status"]) {
  switch (status) {
    case "planned": return "Planejada";
    case "saved":   return "Salva";
    case "active":  return "Em andamento";
    case "completed": return "Concluída";
  }
}

function statusColor(status: Trip["status"]) {
  switch (status) {
    case "planned":   return "#C97826";
    case "saved":     return "#2563EB";
    case "active":    return "#16A34A";
    case "completed": return "#6B7280";
  }
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => router.push(`/trip/${trip.id}` as never)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={styles.cardRoute} numberOfLines={1}>
            {trip.origin} → {trip.destination}
          </Text>
          <Text style={styles.cardDate}>{formatDate(trip.departure_date)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusColor(trip.status) + "22" }]}>
          <Text style={[styles.badgeText, { color: statusColor(trip.status) }]}>
            {statusLabel(trip.status)}
          </Text>
        </View>
      </View>
      {(trip.total_distance_km || trip.num_days > 1 || trip.stop_count > 0) && (
        <View style={styles.statsRow}>
          {trip.total_distance_km && (
            <View style={styles.stat}>
              <Text style={styles.statVal}>{trip.total_distance_km}km</Text>
              <Text style={styles.statLabel}>Distância</Text>
            </View>
          )}
          {trip.num_days > 1 && (
            <View style={styles.stat}>
              <Text style={styles.statVal}>{trip.num_days}</Text>
              <Text style={styles.statLabel}>Dias</Text>
            </View>
          )}
          {trip.stop_count > 0 && (
            <View style={styles.stat}>
              <Text style={styles.statVal}>{trip.stop_count}</Text>
              <Text style={styles.statLabel}>Paradas</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [nextTrip, setNextTrip] = useState<Trip | null>(null);
  const [saved, setSaved] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const supabase = getSupabase();
    const today = new Date().toISOString().split("T")[0];

    const [{ data: active }, { data: planned }, { data: savedData }] = await Promise.all([
      supabase
        .from("trips")
        .select("*")
        .eq("status", "active")
        .limit(1),
      supabase
        .from("trips")
        .select("*")
        .eq("status", "planned")
        .gte("departure_date", today)
        .order("departure_date", { ascending: true })
        .limit(1),
      supabase
        .from("trips")
        .select("*")
        .eq("status", "saved")
        .order("updated_at", { ascending: false })
        .limit(3),
    ]);

    setActiveTrip(active?.[0] ?? null);
    setNextTrip(planned?.[0] ?? null);
    setSaved(savedData ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C97826" size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C97826" />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Moto<Text style={styles.headerTitleOrange}>Route</Text></Text>
      </View>

      {activeTrip && (
        <>
          <Text style={styles.sectionLabel}>EM ANDAMENTO</Text>
          <TouchableOpacity
            style={styles.activeCard}
            activeOpacity={0.8}
            onPress={() => router.push(`/trip/${activeTrip.id}/active` as never)}
          >
            <View style={styles.activeCardTop}>
              <Text style={styles.activePulse}>● EM MOTO</Text>
              <Text style={styles.activeTitle} numberOfLines={1}>{activeTrip.title}</Text>
              <Text style={styles.activeRoute} numberOfLines={1}>
                {activeTrip.origin} → {activeTrip.destination}
              </Text>
            </View>
            <View style={styles.activeCta}>
              <Text style={styles.activeCtaText}>🏍 Continuar Viagem →</Text>
            </View>
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.sectionLabel}>PRÓXIMA VIAGEM</Text>
      {nextTrip ? (
        <TripCard trip={nextTrip} />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{activeTrip ? "Nenhuma planejada." : "Nenhuma viagem planejada."}</Text>
          {!activeTrip && <Text style={styles.emptyHint}>Crie uma nova viagem abaixo!</Text>}
        </View>
      )}

      {saved.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>ROTEIROS SALVOS</Text>
          {saved.map((t) => <TripCard key={t.id} trip={t} />)}
        </>
      )}

      <TouchableOpacity
        style={styles.btnPrimary}
        activeOpacity={0.8}
        onPress={() => router.push("/trip/nova" as never)}
      >
        <Text style={styles.btnPrimaryText}>＋ Nova Viagem</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" },

  header: { backgroundColor: "#1A1A1A", paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  headerTitleOrange: { color: "#C97826" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 20,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardInfo: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A1A", marginBottom: 2 },
  cardRoute: { fontSize: 13, color: "#555", marginBottom: 2 },
  cardDate: { fontSize: 12, color: "#888" },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  statsRow: { flexDirection: "row", marginTop: 12, gap: 20 },
  stat: { alignItems: "center" },
  statVal: { fontSize: 16, fontWeight: "700", color: "#1A1A1A" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 1 },

  activeCard: {
    backgroundColor: "#14532D",
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: "hidden",
  },
  activeCardTop: { padding: 16 },
  activePulse: { fontSize: 11, fontWeight: "700", color: "#4ADE80", letterSpacing: 0.8, marginBottom: 6 },
  activeTitle: { fontSize: 17, fontWeight: "800", color: "#fff", marginBottom: 2 },
  activeRoute: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  activeCta: {
    backgroundColor: "#16A34A",
    paddingVertical: 14,
    alignItems: "center",
  },
  activeCtaText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 24,
    alignItems: "center",
  },
  emptyText: { fontSize: 15, color: "#555", marginBottom: 4 },
  emptyHint: { fontSize: 13, color: "#aaa" },

  btnPrimary: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 18,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
