import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { getSupabase } from "@/services/supabase";
import { DateTimePickerField } from "@/components/DateTimePickerField";

type TripType = "day_trip" | "multi_day";

interface GeoResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

async function geocode(query: string): Promise<GeoResult[]> {
  const res = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: query.trim() }),
  });
  const json = await res.json();
  return json.results ?? [];
}

interface LocationPickerProps {
  label: string;
  placeholder: string;
  value: GeoResult | null;
  onSelect: (r: GeoResult) => void;
  onClear: () => void;
}

function LocationPicker({ label, placeholder, value, onSelect, onClear }: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await geocode(text);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  }

  function select(r: GeoResult) {
    setQuery("");
    setResults([]);
    onSelect(r);
  }

  if (value) {
    return (
      <View style={pickerStyles.field}>
        <Text style={pickerStyles.fieldLabel}>{label}</Text>
        <View style={pickerStyles.selected}>
          <View style={{ flex: 1 }}>
            <Text style={pickerStyles.selectedName}>{value.name}</Text>
            <Text style={pickerStyles.selectedAddr} numberOfLines={1}>{value.address}</Text>
          </View>
          <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={pickerStyles.clearBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={pickerStyles.field}>
      <Text style={pickerStyles.fieldLabel}>{label}</Text>
      <View style={pickerStyles.inputRow}>
        <TextInput
          style={pickerStyles.input}
          placeholder={placeholder}
          placeholderTextColor="#999"
          returnKeyType="search"
          value={query}
          onChangeText={handleChange}
        />
        {searching && <ActivityIndicator size="small" color="#C97826" style={{ position: "absolute", right: 14 }} />}
      </View>
      {results.length > 0 && (
        <View style={pickerStyles.resultList}>
          {results.map((item, i) => (
            <TouchableOpacity key={i} style={pickerStyles.resultItem} onPress={() => select(item)}>
              <Text style={pickerStyles.resultName}>{item.name}</Text>
              <Text style={pickerStyles.resultAddr} numberOfLines={1}>{item.address}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function NovaTripScreen() {
  const [tripType, setTripType] = useState<TripType>("day_trip");
  const [title, setTitle] = useState("");
  const [originGeo, setOriginGeo] = useState<GeoResult | null>(null);
  const [destGeo, setDestGeo] = useState<GeoResult | null>(null);
  const [departureDate, setDepartureDate] = useState(today());
  const [departureTime, setDepartureTime] = useState("07:00");
  const [numDays, setNumDays] = useState("1");
  const [minStopKm, setMinStopKm] = useState("100");
  const [maxStopKm, setMaxStopKm] = useState("200");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) { Alert.alert("Atenção", "Dê um nome para a viagem."); return; }
    if (!originGeo) { Alert.alert("Atenção", "Selecione o ponto de partida na lista de sugestões."); return; }
    if (!destGeo) { Alert.alert("Atenção", "Selecione o destino na lista de sugestões."); return; }
    const days = parseInt(numDays, 10);
    const minKm = parseInt(minStopKm, 10);
    const maxKm = parseInt(maxStopKm, 10);

    if (isNaN(days) || days < 1) { Alert.alert("Atenção", "Número de dias inválido."); return; }
    if (isNaN(minKm) || isNaN(maxKm) || minKm >= maxKm) {
      Alert.alert("Atenção", "A distância mínima entre paradas deve ser menor que a máxima."); return;
    }

    setSaving(true);
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) { Alert.alert("Erro", "Sessão expirada. Faça login novamente."); setSaving(false); return; }

    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_id: user.id,
        title: title.trim(),
        origin: originGeo.name,
        destination: destGeo.name,
        origin_lat: originGeo.lat,
        origin_lng: originGeo.lng,
        dest_lat: destGeo.lat,
        dest_lng: destGeo.lng,
        departure_date: departureDate,
        departure_time: departureTime,
        trip_type: tripType,
        num_days: tripType === "multi_day" ? days : 1,
        min_stop_km: minKm,
        max_stop_km: maxKm,
        status: "planned",
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      Alert.alert("Erro ao salvar", error.message);
      return;
    }

    router.replace(`/trip/${data.id}?autoCalc=true` as never);
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Nova Viagem</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        <Text style={styles.sectionLabel}>TIPO DE VIAGEM</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeOption, tripType === "day_trip" && styles.typeOptionSelected]}
            onPress={() => { setTripType("day_trip"); setNumDays("1"); }}
          >
            <Text style={styles.typeIcon}>🏍️</Text>
            <Text style={[styles.typeLabel, tripType === "day_trip" && styles.typeLabelSelected]}>Rolê</Text>
            <Text style={styles.typeSub}>No mesmo dia</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeOption, tripType === "multi_day" && styles.typeOptionSelected]}
            onPress={() => { setTripType("multi_day"); setNumDays("2"); }}
          >
            <Text style={styles.typeIcon}>🗺️</Text>
            <Text style={[styles.typeLabel, tripType === "multi_day" && styles.typeLabelSelected]}>Expedição</Text>
            <Text style={styles.typeSub}>Vários dias</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>INFORMAÇÕES DA VIAGEM</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Nome da viagem</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Serra da Mantiqueira"
            placeholderTextColor="#999"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <LocationPicker
          label="Ponto de partida"
          placeholder="Ex: São Paulo, SP"
          value={originGeo}
          onSelect={setOriginGeo}
          onClear={() => setOriginGeo(null)}
        />

        <LocationPicker
          label="Destino"
          placeholder="Ex: Campos do Jordão, SP"
          value={destGeo}
          onSelect={setDestGeo}
          onClear={() => setDestGeo(null)}
        />

        <View style={styles.row}>
          <View style={[styles.field, { flex: 3, marginRight: 10 }]}>
            <Text style={styles.fieldLabel}>Data de saída</Text>
            <DateTimePickerField
              mode="date"
              value={departureDate}
              onChange={setDepartureDate}
            />
          </View>
          <View style={[styles.field, { flex: 2 }]}>
            <Text style={styles.fieldLabel}>Horário</Text>
            <DateTimePickerField
              mode="time"
              value={departureTime}
              onChange={setDepartureTime}
            />
          </View>
        </View>

        {tripType === "multi_day" && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Número de dias</Text>
            <TextInput
              style={[styles.input, { width: 100 }]}
              placeholder="2"
              placeholderTextColor="#999"
              value={numDays}
              onChangeText={setNumDays}
              keyboardType="number-pad"
            />
          </View>
        )}

        <Text style={styles.sectionLabel}>REGRA DE PARADAS</Text>
        <Text style={styles.sectionHint}>Distância entre uma parada e a próxima</Text>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>Mínimo (km)</Text>
            <TextInput
              style={styles.input}
              placeholder="100"
              placeholderTextColor="#999"
              value={minStopKm}
              onChangeText={setMinStopKm}
              keyboardType="number-pad"
            />
          </View>
          <View style={[styles.field, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.fieldLabel}>Máximo (km)</Text>
            <TextInput
              style={styles.input}
              placeholder="200"
              placeholderTextColor="#999"
              value={maxStopKm}
              onChangeText={setMaxStopKm}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btnSave, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnSaveText}>Criar Viagem</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  field: { marginTop: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#555", marginBottom: 6 },
  inputRow: { position: "relative", justifyContent: "center" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingRight: 44,
    fontSize: 15,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  resultList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    marginTop: 4,
    overflow: "hidden",
  },
  resultItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  resultName: { fontSize: 14, fontWeight: "600", color: "#1A1A1A" },
  resultAddr: { fontSize: 12, color: "#888", marginTop: 2 },
  selected: {
    backgroundColor: "#FEF3E2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C97826",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  selectedName: { fontSize: 14, fontWeight: "600", color: "#C97826" },
  selectedAddr: { fontSize: 12, color: "#A0622A", marginTop: 2 },
  clearBtn: { fontSize: 16, color: "#C97826", paddingLeft: 10 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1A1A",
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backBtn: { fontSize: 22, color: "#fff", fontWeight: "300" },
  topBarTitle: { fontSize: 17, fontWeight: "700", color: "#fff" },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 2,
  },
  sectionHint: { fontSize: 11, color: "#aaa", marginBottom: 8 },

  typeRow: { flexDirection: "row", gap: 12, marginTop: 10 },
  typeOption: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E5E5",
  },
  typeOptionSelected: { borderColor: "#C97826", backgroundColor: "#FEF3E2" },
  typeIcon: { fontSize: 24, marginBottom: 4 },
  typeLabel: { fontSize: 14, fontWeight: "700", color: "#555" },
  typeLabelSelected: { color: "#C97826" },
  typeSub: { fontSize: 11, color: "#aaa", marginTop: 2 },

  field: { marginTop: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#555", marginBottom: 6 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  row: { flexDirection: "row" },

  btnSave: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 32,
  },
  btnSaveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
