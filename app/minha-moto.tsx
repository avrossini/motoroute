import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { getSupabase } from "@/services/supabase";

interface MotoForm {
  make: string;
  model: string;
  year: string;
  color: string;
  fuel_economy_km_l: string;
  tank_liters: string;
  odometer_km: string;
  displacement_cc: string;
}

const EMPTY: MotoForm = {
  make: "",
  model: "",
  year: "",
  color: "",
  fuel_economy_km_l: "",
  tank_liters: "",
  odometer_km: "0",
  displacement_cc: "",
};

export default function MinhaMotoScreen() {
  const [form, setForm] = useState<MotoForm>(EMPTY);
  const [motoId, setMotoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMoto();
  }, []);

  async function loadMoto() {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("motorcycles")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      setMotoId(data.id);
      setForm({
        make: data.make ?? "",
        model: data.model ?? "",
        year: String(data.year ?? ""),
        color: data.color ?? "",
        fuel_economy_km_l: String(data.fuel_economy_km_l ?? ""),
        tank_liters: String(data.tank_liters ?? ""),
        odometer_km: String(data.odometer_km ?? "0"),
        displacement_cc: String(data.displacement_cc ?? ""),
      });
    }
    setLoading(false);
  }

  function set(field: keyof MotoForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function autonomia() {
    const kmL = parseFloat(form.fuel_economy_km_l);
    const tank = parseFloat(form.tank_liters);
    if (!isNaN(kmL) && !isNaN(tank) && kmL > 0 && tank > 0) {
      return Math.round(kmL * tank);
    }
    return null;
  }

  async function save() {
    if (!form.make.trim() || !form.model.trim()) {
      Alert.alert("Campos obrigatórios", "Marca e modelo são obrigatórios.");
      return;
    }
    const kmL = parseFloat(form.fuel_economy_km_l);
    const tank = parseFloat(form.tank_liters);
    if (isNaN(kmL) || kmL <= 0 || isNaN(tank) || tank <= 0) {
      Alert.alert("Dados inválidos", "Informe consumo (km/L) e tanque (litros) válidos.");
      return;
    }
    const yearNum = parseInt(form.year);
    if (isNaN(yearNum) || yearNum < 1980 || yearNum > new Date().getFullYear() + 1) {
      Alert.alert("Ano inválido", "Informe um ano válido.");
      return;
    }

    setSaving(true);
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      user_id: user!.id,
      make: form.make.trim(),
      model: form.model.trim(),
      year: yearNum,
      color: form.color.trim() || null,
      fuel_economy_km_l: kmL,
      tank_liters: tank,
      odometer_km: parseInt(form.odometer_km) || 0,
      displacement_cc: parseInt(form.displacement_cc) || null,
      is_active: true,
    };

    let error;
    if (motoId) {
      ({ error } = await supabase.from("motorcycles").update(payload).eq("id", motoId));
    } else {
      ({ error } = await supabase.from("motorcycles").insert(payload));
    }

    setSaving(false);
    if (error) {
      Alert.alert("Erro ao salvar", error.message);
    } else {
      router.back();
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#C97826" size="large" />
      </View>
    );
  }

  const aut = autonomia();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{motoId ? "Editar Moto" : "Cadastrar Moto"}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {aut != null && (
          <View style={styles.autonomiaBanner}>
            <Text style={styles.autonomiaEmoji}>⛽</Text>
            <Text style={styles.autonomiaText}>Autonomia estimada: <Text style={styles.autonomiaValue}>~{aut} km</Text></Text>
          </View>
        )}

        <View style={styles.group}>
          <Text style={styles.groupLabel}>IDENTIFICAÇÃO</Text>
          <Field label="Marca *" value={form.make} onChangeText={(v) => set("make", v)} placeholder="Honda, Yamaha, BMW..." />
          <Field label="Modelo *" value={form.model} onChangeText={(v) => set("model", v)} placeholder="CB 500F, Tracer 9, R 1250 GS..." />
          <Field label="Ano *" value={form.year} onChangeText={(v) => set("year", v)} placeholder="2023" keyboardType="number-pad" />
          <Field label="Cor" value={form.color} onChangeText={(v) => set("color", v)} placeholder="Preta, Branca, Azul..." />
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>COMBUSTÍVEL</Text>
          <Field
            label="Consumo real (km/L) *"
            value={form.fuel_economy_km_l}
            onChangeText={(v) => set("fuel_economy_km_l", v)}
            placeholder="Ex: 22.0"
            keyboardType="decimal-pad"
            hint="Seu consumo médio real na estrada"
          />
          <Field
            label="Capacidade do tanque (litros) *"
            value={form.tank_liters}
            onChangeText={(v) => set("tank_liters", v)}
            placeholder="Ex: 17.5"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>OUTROS</Text>
          <Field
            label="Cilindrada (cc)"
            value={form.displacement_cc}
            onChangeText={(v) => set("displacement_cc", v)}
            placeholder="Ex: 471"
            keyboardType="number-pad"
          />
          <Field
            label="Hodômetro atual (km)"
            value={form.odometer_km}
            onChangeText={(v) => set("odometer_km", v)}
            placeholder="0"
            keyboardType="number-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>{motoId ? "Salvar alterações" : "Cadastrar moto"}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        keyboardType={keyboardType ?? "default"}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" },
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

  autonomiaBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E3A5F",
    margin: 16,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  autonomiaEmoji: { fontSize: 22 },
  autonomiaText: { fontSize: 14, color: "#9DB4CC" },
  autonomiaValue: { fontWeight: "700", color: "#fff" },

  group: { marginHorizontal: 16, marginTop: 20 },
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  field: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    marginBottom: 8,
  },
  fieldLabel: { fontSize: 11, fontWeight: "600", color: "#888", marginBottom: 2 },
  fieldHint: { fontSize: 11, color: "#aaa", marginBottom: 2, fontStyle: "italic" },
  fieldInput: {
    fontSize: 15,
    color: "#1A1A1A",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  saveBtn: {
    backgroundColor: "#C97826",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 28,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
