import { useCallback, useState } from "react";
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

const TABS = [
  { key: "planned", label: "Planejadas" },
  { key: "saved",   label: "Salvas" },
  { key: "completed", label: "Realizadas" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function statusColor(status: Trip["status"]) {
  switch (status) {
    case "planned":   return "#C97826";
    case "saved":     return "#2563EB";
    case "active":    return "#16A34A";
    case "completed": return "#6B7280";
  }
}

function statusLabel(status: Trip["status"]) {
  switch (status) {
    case "planned":   return "Planejada";
    case "saved":     return "Salva";
    case "active":    return "Em andamento";
    case "completed": return "Concluída";
  }
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StarRating({
  value,
  onRate,
}: {
  value: number | null;
  onRate: (stars: number) => void;
}) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onRate(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={[styles.star, (value ?? 0) >= n && styles.starFilled]}>★</Text>
        </TouchableOpacity>
      ))}
      {value == null && <Text style={styles.rateHint}>Avaliar</Text>}
    </View>
  );
}

function TripCard({ trip, onRate }: { trip: Trip; onRate?: (stars: number) => void }) {
  const isCompleted = trip.status === "completed";
  return (
    <TouchableOpacity
      style={[styles.card, isCompleted && styles.cardCompleted]}
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
        {!isCompleted && (
          <View style={[styles.badge, { backgroundColor: statusColor(trip.status) + "22" }]}>
            <Text style={[styles.badgeText, { color: statusColor(trip.status) }]}>
              {statusLabel(trip.status)}
            </Text>
          </View>
        )}
        {isCompleted && trip.completed_at && (
          <Text style={styles.completedDate}>
            {new Date(trip.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          </Text>
        )}
      </View>
      <View style={styles.statsRow}>
        {trip.total_distance_km != null && (
          <View style={styles.stat}>
            <Text style={styles.statVal}>{trip.total_distance_km}km</Text>
            <Text style={styles.statLabel}>Distância</Text>
          </View>
        )}
        <View style={styles.stat}>
          <Text style={styles.statVal}>{trip.num_days}</Text>
          <Text style={styles.statLabel}>{trip.num_days === 1 ? "Dia" : "Dias"}</Text>
        </View>
        {trip.stop_count > 0 && (
          <View style={styles.stat}>
            <Text style={styles.statVal}>{trip.stop_count}</Text>
            <Text style={styles.statLabel}>Paradas</Text>
          </View>
        )}
      </View>
      {isCompleted && onRate && (
        <View style={styles.ratingRow}>
          <StarRating value={trip.rating ?? null} onRate={onRate} />
          {trip.rating_note ? (
            <Text style={styles.ratingNote} numberOfLines={2}>{trip.rating_note}</Text>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ViagensScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("planned");
  const [trips, setTrips] = useState<Record<TabKey, Trip[]>>({
    planned: [],
    saved: [],
    completed: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const supabase = getSupabase();
    const [{ data: planned }, { data: saved }, { data: completed }] = await Promise.all([
      supabase
        .from("trips")
        .select("*")
        .in("status", ["planned", "active"])
        .order("departure_date", { ascending: true }),
      supabase
        .from("trips")
        .select("*")
        .eq("status", "saved")
        .order("updated_at", { ascending: false }),
      supabase
        .from("trips")
        .select("*")
        .eq("status", "completed")
        .order("completed_at", { ascending: false }),
    ]);
    setTrips({
      planned: planned ?? [],
      saved: saved ?? [],
      completed: completed ?? [],
    });
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function rateTrip(tripId: string, stars: number) {
    const supabase = getSupabase();
    await supabase.from("trips").update({ rating: stars }).eq("id", tripId);
    // Optimistic update
    setTrips((prev) => ({
      ...prev,
      completed: prev.completed.map((t) =>
        t.id === tripId ? { ...t, rating: stars } : t
      ),
    }));
  }

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  const currentTrips = trips[activeTab];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Viagens</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
              {trips[tab.key].length > 0 ? ` (${trips[tab.key].length})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#C97826" size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C97826" />}
        >
          {currentTrips.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhuma viagem aqui ainda.</Text>
            </View>
          ) : (
            currentTrips.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                onRate={activeTab === "completed" ? (stars) => rateTrip(t.id, stars) : undefined}
              />
            ))
          )}
        </ScrollView>
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push("/trip/nova" as never)}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    backgroundColor: "#1A1A1A",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#fff" },

  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: "#C97826" },
  tabText: { fontSize: 12, fontWeight: "600", color: "#888" },
  tabTextActive: { color: "#C97826" },

  list: { flex: 1 },
  listContent: { paddingVertical: 12, paddingBottom: 80 },

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
  statVal: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  statLabel: { fontSize: 11, color: "#888", marginTop: 1 },

  cardCompleted: { borderLeftWidth: 3, borderLeftColor: "#6B7280" },
  completedDate: { fontSize: 12, color: "#888", fontWeight: "600" },

  ratingRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  star: { fontSize: 22, color: "#D0D0D0" },
  starFilled: { color: "#F59E0B" },
  rateHint: { fontSize: 12, color: "#aaa", marginLeft: 4 },
  ratingNote: { fontSize: 12, color: "#666", marginTop: 6, fontStyle: "italic" },

  empty: { paddingTop: 60, alignItems: "center" },
  emptyText: { fontSize: 15, color: "#aaa" },

  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#C97826",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#C97826",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { fontSize: 28, color: "#fff", lineHeight: 32, marginTop: -2 },
});
