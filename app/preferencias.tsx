import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { router } from "expo-router";
import { getSupabase } from "@/services/supabase";

interface Prefs {
  default_departure_time: string;
  default_min_stop_km: number;
  default_max_stop_km: number;
  default_autonomy_km: number;
  fuel_alert_km: number;
  rain_alert_threshold: number;
  wind_alert_kmh: number;
  avoid_tolls: boolean;
  notifications_enabled: boolean;
  default_navigation_app: 'google_maps' | 'waze' | null;
}

const DEFAULTS: Prefs = {
  default_departure_time: "07:00",
  default_min_stop_km: 100,
  default_max_stop_km: 200,
  default_autonomy_km: 300,
  fuel_alert_km: 80,
  rain_alert_threshold: 40,
  wind_alert_kmh: 50,
  avoid_tolls: false,
  notifications_enabled: true,
  default_navigation_app: null,
};

function StepField({
  label,
  hint,
  value,
  onDec,
  onInc,
  unit,
}: {
  label: string;
  hint?: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
  unit: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLeft}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepBtn} onPress={onDec} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepVal}>{value} {unit}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={onInc} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PreferenciasScreen() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [prefId, setPrefId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setPrefId(data.id);
      setPrefs({
        default_departure_time: data.default_departure_time ?? "07:00",
        default_min_stop_km: data.default_min_stop_km ?? 100,
        default_max_stop_km: data.default_max_stop_km ?? 200,
        default_autonomy_km: data.default_autonomy_km ?? 300,
        fuel_alert_km: data.fuel_alert_km ?? 80,
        rain_alert_threshold: data.rain_alert_threshold ?? 40,
        wind_alert_kmh: data.wind_alert_kmh ?? 50,
        avoid_tolls: data.avoid_tolls ?? false,
        notifications_enabled: data.notifications_enabled ?? true,
        default_navigation_app: (data.default_navigation_app as 'google_maps' | 'waze' | null) ?? null,
      });
    }
    setLoading(false);
  }

  function step(field: keyof Prefs, delta: number, min: number, max: number, snap: number) {
    setPrefs((p) => ({ ...p, [field]: Math.min(max, Math.max(min, (p[field] as number) + delta * snap)) }));
  }

  async function save() {
    setSaving(true);
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...prefs, user_id: user!.id };
    let error;
    if (prefId) {
      ({ error } = await supabase.from("user_preferences").update(payload).eq("id", prefId));
    } else {
      ({ error } = await supabase.from("user_preferences").insert(payload));
    }
    setSaving(false);
    if (error) {
      Alert.alert("Erro ao salvar", error.message);
    } else {
      router.back();
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#C97826" size="large" /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preferências Padrão</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.group}>
          <Text style={styles.groupLabel}>SAÍDA</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Horário de saída padrão</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => {
                const [h, m] = prefs.default_departure_time.split(":").map(Number);
                const total = Math.max(0, h * 60 + m - 30);
                setPrefs(p => ({ ...p, default_departure_time: `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}` }));
              }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepVal}>{prefs.default_departure_time}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => {
                const [h, m] = prefs.default_departure_time.split(":").map(Number);
                const total = Math.min(23*60+30, h * 60 + m + 30);
                setPrefs(p => ({ ...p, default_departure_time: `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}` }));
              }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>PARADAS</Text>
          <StepField label="Distância mínima entre paradas" value={prefs.default_min_stop_km} unit="km"
            onDec={() => step("default_min_stop_km", -1, 50, prefs.default_max_stop_km - 10, 10)}
            onInc={() => step("default_min_stop_km", 1, 50, prefs.default_max_stop_km - 10, 10)} />
          <StepField label="Distância máxima entre paradas" value={prefs.default_max_stop_km} unit="km"
            onDec={() => step("default_max_stop_km", -1, prefs.default_min_stop_km + 10, 500, 10)}
            onInc={() => step("default_max_stop_km", 1, prefs.default_min_stop_km + 10, 500, 10)} />
          <StepField label="Autonomia padrão (sem moto)" hint="Usado quando nenhuma moto está cadastrada" value={prefs.default_autonomy_km} unit="km"
            onDec={() => step("default_autonomy_km", -1, 50, 800, 25)}
            onInc={() => step("default_autonomy_km", 1, 50, 800, 25)} />
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>ALERTAS</Text>
          <StepField label="Alerta de combustível" hint="Avisar quando posto estiver a menos de X km" value={prefs.fuel_alert_km} unit="km"
            onDec={() => step("fuel_alert_km", -1, 20, 300, 10)}
            onInc={() => step("fuel_alert_km", 1, 20, 300, 10)} />
          <StepField label="Alerta de chuva" hint="Avisar quando chance de chuva superar X%" value={prefs.rain_alert_threshold} unit="%"
            onDec={() => step("rain_alert_threshold", -1, 10, 90, 5)}
            onInc={() => step("rain_alert_threshold", 1, 10, 90, 5)} />
          <StepField label="Alerta de vento" value={prefs.wind_alert_kmh} unit="km/h"
            onDec={() => step("wind_alert_kmh", -1, 20, 150, 10)}
            onInc={() => step("wind_alert_kmh", 1, 20, 150, 10)} />
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>OPÇÕES</Text>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Evitar pedágios</Text>
            <Switch value={prefs.avoid_tolls} onValueChange={(v) => setPrefs(p => ({ ...p, avoid_tolls: v }))}
              trackColor={{ false: "#ddd", true: "#C97826" }} thumbColor="#fff" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Notificações</Text>
            <Switch value={prefs.notifications_enabled} onValueChange={(v) => setPrefs(p => ({ ...p, notifications_enabled: v }))}
              trackColor={{ false: "#ddd", true: "#C97826" }} thumbColor="#fff" />
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>NAVEGAÇÃO</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>App de navegação padrão</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["google_maps", "waze"] as const).map((app) => (
                <TouchableOpacity
                  key={app}
                  onPress={() => setPrefs((p) => ({ ...p, default_navigation_app: app }))}
                  style={[styles.navOption, prefs.default_navigation_app === app && styles.navOptionSelected]}
                >
                  <Text style={[styles.navOptionText, prefs.default_navigation_app === app && styles.navOptionTextSelected]}>
                    {app === "google_maps" ? "Google Maps" : "Waze"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Salvar preferências</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" },
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1A1A1A", paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  backBtnText: { fontSize: 22, color: "#fff" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: "#fff" },
  group: { marginHorizontal: 16, marginTop: 20 },
  groupLabel: { fontSize: 11, fontWeight: "700", color: "#999", letterSpacing: 0.8, marginBottom: 8 },
  field: {
    backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", marginBottom: 8,
  },
  fieldLeft: { flex: 1, marginRight: 12 },
  fieldLabel: { fontSize: 14, color: "#1A1A1A", fontWeight: "500" },
  fieldHint: { fontSize: 11, color: "#aaa", marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#F0F0F0", justifyContent: "center", alignItems: "center",
  },
  stepBtnText: { fontSize: 18, color: "#1A1A1A", fontWeight: "600", lineHeight: 22 },
  stepVal: { fontSize: 15, fontWeight: "700", color: "#1A1A1A", minWidth: 70, textAlign: "center" },
  switchRow: {
    backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
  },
  saveBtn: {
    backgroundColor: "#C97826", borderRadius: 14,
    marginHorizontal: 16, marginTop: 28, paddingVertical: 16, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  navOption: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "#F0F0F0", borderWidth: 1, borderColor: "#E0E0E0",
  },
  navOptionSelected: { backgroundColor: "#C97826", borderColor: "#C97826" },
  navOptionText: { fontSize: 13, fontWeight: "600", color: "#666" },
  navOptionTextSelected: { color: "#fff" },
});
