import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";
import { getSupabase } from "@/services/supabase";

type SortKey = "distance" | "rating" | "price";

interface LodgingResult {
  place_id: string;
  name: string;
  rating: number | null;
  total_ratings: number | null;
  price_level: number | null;
  latitude: number;
  longitude: number;
  distance_m: number;
  vicinity: string;
}

function priceLabel(level: number | null) {
  if (level == null) return "";
  return ["", "$", "$$", "$$$", "$$$$"][level] ?? "";
}

function distLabel(m: number) {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function distColor(m: number) {
  if (m < 1000) return "#16A34A";
  if (m <= 3000) return "#2563EB";
  return "#888";
}

export default function LodgingSearchScreen() {
  const { id, day, city: initialCity, checkin, checkout } = useLocalSearchParams<{
    id: string;
    day: string;
    city: string;
    checkin: string;
    checkout: string;
  }>();

  const [query, setQuery] = useState(initialCity ?? "");
  const [results, setResults] = useState<LodgingResult[]>([]);
  const [refLabel, setRefLabel] = useState("");
  const [refLat, setRefLat] = useState<number | null>(null);
  const [refLng, setRefLng] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("distance");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // place_id being saved

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/places-lodging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: query.trim() }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResults(json.results ?? []);
      setRefLabel(json.ref_label ?? query);
      setRefLat(json.ref_lat ?? null);
      setRefLng(json.ref_lng ?? null);
    } catch (e: any) {
      Alert.alert("Erro na busca", e.message ?? "Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function sortedResults() {
    const r = [...results];
    if (sort === "rating") return r.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sort === "price") return r.sort((a, b) => (a.price_level ?? 99) - (b.price_level ?? 99));
    return r.sort((a, b) => a.distance_m - b.distance_m);
  }

  async function selectLodging(option: LodgingResult) {
    setSaving(option.place_id);
    const supabase = getSupabase();
    try {
      // Remove previous selection for this day
      await supabase
        .from("lodging_suggestions")
        .delete()
        .eq("trip_id", id)
        .eq("day_index", Number(day));

      await supabase.from("lodging_suggestions").insert({
        trip_id: id,
        day_index: Number(day),
        place_id: option.place_id,
        name: option.name,
        rating: option.rating,
        total_ratings: option.total_ratings,
        price_level: option.price_level,
        latitude: option.latitude,
        longitude: option.longitude,
        city: refLabel || query,
        checkin_date: checkin,
        checkout_date: checkout,
        is_selected: true,
        is_reserved: false,
        reference_lat: refLat,
        reference_lng: refLng,
        reference_label: refLabel ? `centro de ${refLabel}` : query,
        distance_m: option.distance_m,
      });

      router.back();
    } catch (e: any) {
      Alert.alert("Erro ao salvar", e.message ?? "Tente novamente.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hospedagem — Dia {day}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Cidade ou endereço"
          placeholderTextColor="#aaa"
          onSubmitEditing={search}
          returnKeyType="search"
          autoFocus={!initialCity}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.searchBtnText}>Buscar</Text>
          )}
        </TouchableOpacity>
      </View>

      {refLabel ? (
        <Text style={styles.refNote}>
          Usando o centro de {refLabel} como referência. Para refinar, informe um endereço.
        </Text>
      ) : null}

      {results.length > 0 && (
        <View style={styles.sortRow}>
          {(["distance", "rating", "price"] as SortKey[]).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.sortChip, sort === k && styles.sortChipActive]}
              onPress={() => setSort(k)}
            >
              <Text style={[styles.sortChipText, sort === k && styles.sortChipTextActive]}>
                {k === "distance" ? "Distância" : k === "rating" ? "Avaliação" : "Preço"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 32 }}>
        {sortedResults().map((option) => (
          <View key={option.place_id} style={styles.optionCard}>
            <View style={styles.optionTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionName} numberOfLines={2}>{option.name}</Text>
                <Text style={styles.optionVicinity} numberOfLines={1}>{option.vicinity}</Text>
              </View>
              <View
                style={[styles.distBadge, { backgroundColor: distColor(option.distance_m) + "22", borderColor: distColor(option.distance_m) }]}
              >
                <Text style={[styles.distBadgeText, { color: distColor(option.distance_m) }]}>
                  {distLabel(option.distance_m)}
                </Text>
              </View>
            </View>
            <View style={styles.optionMeta}>
              {option.rating != null && (
                <Text style={styles.optionRating}>★ {option.rating} ({option.total_ratings ?? 0})</Text>
              )}
              {option.price_level != null && (
                <Text style={styles.optionPrice}>{priceLabel(option.price_level)}</Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.selectBtn, saving === option.place_id && { opacity: 0.6 }]}
              onPress={() => selectLodging(option)}
              disabled={saving != null}
            >
              {saving === option.place_id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.selectBtnText}>Selecionar</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}
        {results.length === 0 && !loading && query.trim() && (
          <Text style={styles.emptyText}>Nenhuma hospedagem encontrada. Tente outra cidade ou endereço.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  backBtnText: { fontSize: 22, color: "#fff" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: "#fff" },

  searchRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchBtn: {
    backgroundColor: "#C97826",
    borderRadius: 10,
    paddingHorizontal: 18,
    height: 44,
    justifyContent: "center",
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  refNote: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },

  sortRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  sortChipActive: { backgroundColor: "#1A1A1A", borderColor: "#1A1A1A" },
  sortChipText: { fontSize: 13, color: "#555" },
  sortChipTextActive: { color: "#fff", fontWeight: "700" },

  list: { flex: 1 },

  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  optionTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 6 },
  optionName: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  optionVicinity: { fontSize: 12, color: "#888", marginTop: 2 },
  distBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  distBadgeText: { fontSize: 12, fontWeight: "700" },
  optionMeta: { flexDirection: "row", gap: 12, marginBottom: 10 },
  optionRating: { fontSize: 13, color: "#F59E0B", fontWeight: "600" },
  optionPrice: { fontSize: 13, color: "#555" },
  selectBtn: {
    backgroundColor: "#C97826",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  selectBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  emptyText: { textAlign: "center", color: "#aaa", marginTop: 40, fontSize: 14 },
});
