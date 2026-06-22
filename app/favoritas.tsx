import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";

interface Favorite {
  id: string;
  place_id: string;
  name: string;
  place_type: string;
  address: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  custom_tags: string[] | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  fuel: "⛽ Posto",
  food: "🍽 Restaurante",
  cafe: "☕ Café",
  lodging: "🛏 Hospedagem",
  attraction: "📍 Atrativo",
  other: "📌 Outro",
};

const TYPE_COLORS: Record<string, string> = {
  fuel: "#F59E0B",
  food: "#EF4444",
  cafe: "#8B5CF6",
  lodging: "#1E3A5F",
  attraction: "#16A34A",
  other: "#6B7280",
};

function openMaps(lat: number, lng: number) {
  const url = `https://maps.google.com/?q=${lat},${lng}`;
  if (Platform.OS === "web") {
    (window as any).open(url, "_blank");
  } else {
    Linking.openURL(url);
  }
}

export default function FavoritasScreen() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("favorites")
      .select("*")
      .order("created_at", { ascending: false });
    setFavorites((data ?? []).map((f) => ({
      ...f,
      latitude: Number(f.latitude),
      longitude: Number(f.longitude),
    })));
    setLoading(false);
  }

  async function deleteFavorite(id: string, name: string) {
    Alert.alert("Remover favorito", `Remover "${name}" dos favoritos?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          const supabase = getSupabase();
          await supabase.from("favorites").delete().eq("id", id);
          setFavorites((prev) => prev.filter((f) => f.id !== id));
        },
      },
    ]);
  }

  const types = [...new Set(favorites.map((f) => f.place_type))];
  const filtered = filter ? favorites.filter((f) => f.place_type === filter) : favorites;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paradas Favoritas</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#C97826" size="large" /></View>
      ) : (
        <>
          {types.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              <TouchableOpacity
                style={[styles.filterChip, filter === null && styles.filterChipActive]}
                onPress={() => setFilter(null)}
              >
                <Text style={[styles.filterChipText, filter === null && styles.filterChipTextActive]}>Todos</Text>
              </TouchableOpacity>
              {types.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.filterChip, filter === t && styles.filterChipActive]}
                  onPress={() => setFilter(t)}
                >
                  <Text style={[styles.filterChipText, filter === t && styles.filterChipTextActive]}>
                    {TYPE_LABELS[t] ?? t}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 12, paddingBottom: 32 }}>
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>⭐</Text>
                <Text style={styles.emptyTitle}>Nenhum favorito ainda</Text>
                <Text style={styles.emptyHint}>
                  Salve postos, restaurantes e atrativos durante o planejamento de uma viagem.
                </Text>
              </View>
            ) : (
              filtered.map((fav) => (
                <View key={fav.id} style={styles.card}>
                  <View style={styles.cardLeft}>
                    <View style={[styles.typeTag, { backgroundColor: (TYPE_COLORS[fav.place_type] ?? "#888") + "22" }]}>
                      <Text style={[styles.typeTagText, { color: TYPE_COLORS[fav.place_type] ?? "#888" }]}>
                        {TYPE_LABELS[fav.place_type] ?? fav.place_type}
                      </Text>
                    </View>
                    <Text style={styles.cardName} numberOfLines={1}>{fav.name}</Text>
                    {fav.address ? <Text style={styles.cardAddress} numberOfLines={1}>{fav.address}</Text> : null}
                    <View style={styles.cardMeta}>
                      {fav.rating != null && <Text style={styles.cardRating}>★ {fav.rating}</Text>}
                      {(fav.custom_tags ?? []).map((tag) => (
                        <View key={tag} style={styles.tag}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => openMaps(fav.latitude, fav.longitude)} style={styles.actionBtn}>
                      <Text style={styles.actionBtnText}>🗺</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteFavorite(fav.id, fav.name)} style={styles.actionBtnDanger}>
                      <Text style={styles.actionBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" },
  header: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1A1A1A", paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  backBtnText: { fontSize: 22, color: "#fff" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: "#fff" },
  filterBar: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10, maxHeight: 52 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "#F5F5F5", borderWidth: 1, borderColor: "#E0E0E0" },
  filterChipActive: { backgroundColor: "#1A1A1A", borderColor: "#1A1A1A" },
  filterChipText: { fontSize: 12, color: "#555", fontWeight: "500" },
  filterChipTextActive: { color: "#fff", fontWeight: "700" },
  list: { flex: 1, backgroundColor: "#F5F5F5" },
  empty: { paddingTop: 80, alignItems: "center", paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#1A1A1A", marginBottom: 8 },
  emptyHint: { fontSize: 13, color: "#888", textAlign: "center", lineHeight: 20 },
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    marginHorizontal: 16, marginBottom: 8, padding: 14,
    flexDirection: "row", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardLeft: { flex: 1 },
  typeTag: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  typeTagText: { fontSize: 11, fontWeight: "700" },
  cardName: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  cardAddress: { fontSize: 12, color: "#888", marginTop: 2 },
  cardMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 },
  cardRating: { fontSize: 12, color: "#F59E0B", fontWeight: "600" },
  tag: { backgroundColor: "#F0F0F0", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontSize: 11, color: "#555" },
  cardActions: { flexDirection: "column", gap: 8, marginLeft: 12 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#F5F5F5", justifyContent: "center", alignItems: "center" },
  actionBtnDanger: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEF2F2", justifyContent: "center", alignItems: "center" },
  actionBtnText: { fontSize: 16 },
});
