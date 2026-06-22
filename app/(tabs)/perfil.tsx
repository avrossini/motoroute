import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";

interface Motorcycle {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  fuel_economy_km_l: number;
  tank_liters: number;
  odometer_km: number;
  is_active: boolean;
}

interface UserInfo {
  email: string;
  name: string;
}

export default function PerfilScreen() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [moto, setMoto] = useState<Motorcycle | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load() {
    setLoading(true);
    const supabase = getSupabase();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const email = authUser.email ?? "";
      const meta = authUser.user_metadata ?? {};
      const name = meta.full_name ?? meta.name ?? email.split("@")[0] ?? "Usuário";
      setUser({ email, name });
    }

    const { data } = await supabase
      .from("motorcycles")
      .select("id, make, model, year, color, fuel_economy_km_l, tank_liters, odometer_km, is_active")
      .eq("is_active", true)
      .maybeSingle();

    setMoto(data ?? null);
    setLoading(false);
  }

  async function signOut() {
    Alert.alert("Sair da conta", "Deseja mesmo sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          const supabase = getSupabase();
          await supabase.auth.signOut();
          router.replace("/login" as never);
        },
      },
    ]);
  }

  const avatarLetter = user?.name?.[0]?.toUpperCase() ?? "?";
  const autonomia = moto ? Math.round(moto.fuel_economy_km_l * moto.tank_liters) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header do perfil */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{avatarLetter}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name ?? "—"}</Text>
          <Text style={styles.profileEmail}>{user?.email ?? "—"}</Text>
        </View>
      </View>

      {/* Moto ativa */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MINHA MOTO</Text>
        {loading ? null : moto ? (
          <TouchableOpacity
            style={styles.motoCard}
            onPress={() => router.push("/minha-moto" as never)}
            activeOpacity={0.8}
          >
            <View style={styles.motoCardLeft}>
              <Text style={styles.motoEmoji}>🏍️</Text>
              <View>
                <Text style={styles.motoName}>{moto.make} {moto.model}</Text>
                <Text style={styles.motoYear}>{moto.year}{moto.color ? ` · ${moto.color}` : ""}</Text>
                <Text style={styles.motoStats}>
                  {moto.fuel_economy_km_l} km/L · {moto.tank_liters} L · ~{autonomia} km
                </Text>
              </View>
            </View>
            <Text style={styles.motoArrow}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.motoEmpty}
            onPress={() => router.push("/minha-moto" as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.motoEmptyIcon}>🏍️</Text>
            <View>
              <Text style={styles.motoEmptyTitle}>Cadastrar moto</Text>
              <Text style={styles.motoEmptyDesc}>Consumo e tanque para alertas de combustível</Text>
            </View>
            <Text style={styles.motoArrow}>›</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Menu */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>VIAGENS</Text>
        <MenuItem icon="⭐" label="Paradas Favoritas" onPress={() => router.push("/favoritas" as never)} />
        <MenuItem icon="🏁" label="Viagens Realizadas" onPress={() => router.push("/viagens" as never)} />
        <MenuItem icon="💾" label="Roteiros Salvos" onPress={() => router.push("/viagens" as never)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CONFIGURAÇÕES</Text>
        <MenuItem icon="⚙️" label="Preferências Padrão" onPress={() => router.push("/preferencias" as never)} />
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutIcon}>🚪</Text>
          <Text style={styles.signOutText}>Sair da conta</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function MenuItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },

  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#C97826",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: { fontSize: 24, fontWeight: "700", color: "#fff" },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: "700", color: "#fff" },
  profileEmail: { fontSize: 13, color: "#aaa", marginTop: 2 },

  section: { marginTop: 24, marginHorizontal: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  motoCard: {
    backgroundColor: "#1E3A5F",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  motoCardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  motoEmoji: { fontSize: 28 },
  motoName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  motoYear: { fontSize: 13, color: "#9DB4CC", marginTop: 1 },
  motoStats: { fontSize: 12, color: "#7A9BB5", marginTop: 3 },
  motoArrow: { fontSize: 22, color: "#9DB4CC" },

  motoEmpty: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderStyle: "dashed",
  },
  motoEmptyIcon: { fontSize: 28 },
  motoEmptyTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  motoEmptyDesc: { fontSize: 12, color: "#888", marginTop: 2, maxWidth: 200 },

  menuItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  menuIcon: { fontSize: 20, marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 15, color: "#1A1A1A" },
  menuArrow: { fontSize: 20, color: "#bbb" },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  signOutIcon: { fontSize: 20 },
  signOutText: { fontSize: 15, color: "#E53935", fontWeight: "600" },
});
